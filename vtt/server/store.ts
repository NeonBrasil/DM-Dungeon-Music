// Persistência das campanhas: ~/.dm_dungeon_music/mesa/campaigns/<id>/campaign.json (+ files/).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { Colls, Page, Settings } from "../shared/types.ts";
import { COLL_NAMES } from "../shared/types.ts";
import { ID_RE, newId } from "../shared/util.ts";

export const DATA_DIR = process.env.DM_VTT_DATA || path.join(os.homedir(), ".dm_dungeon_music", "mesa");
const CAMPAIGNS_DIR = path.join(DATA_DIR, "campaigns");
export const UPLOAD_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".ogg", ".opus", ".wav", ".flac", ".m4a", ".webm"]);

export interface Config {
  gmKey: string;
  port: number;
}

export interface CampaignFile {
  id: string;
  createdAt: number;
  invite: string;
  secrets: Record<string, string>; // playerId → segredo (nunca enviado a outros)
  colls: Colls;
}

function writeAtomic(file: string, data: string) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function loadConfig(): Config {
  fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  const file = path.join(DATA_DIR, "config.json");
  let cfg: Partial<Config> = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* primeira execução */
  }
  const full: Config = {
    gmKey: cfg.gmKey || crypto.randomBytes(24).toString("hex"),
    port: cfg.port || 7777,
  };
  if (full.gmKey !== cfg.gmKey || full.port !== cfg.port) writeAtomic(file, JSON.stringify(full, null, 2));
  return full;
}

export function campaignDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error("id inválido");
  return path.join(CAMPAIGNS_DIR, id);
}

export function filesDir(id: string): string {
  return path.join(campaignDir(id), "files");
}

export function newPage(name: string, order: number): Page {
  return {
    id: newId(), name, order,
    cols: 30, rows: 20, gridSize: 70,
    grid: "square", gridColor: "#000000", gridOpacity: 0.2,
    scale: 1.5, unit: "m",
    bg: "#e8e4da",
    fogOn: false, fog: "",
  };
}

export function createCampaign(name: string): CampaignFile {
  const page = newPage("Página 1", 0);
  const settings: Settings = {
    id: "main", name, playerPageId: page.id, diagonal: "dnd",
    turns: { entries: [], current: 0, round: 1, open: false },
  };
  const colls = Object.fromEntries(COLL_NAMES.map((n) => [n, {}])) as unknown as Colls;
  colls.settings.main = settings;
  colls.pages[page.id] = page;
  const camp: CampaignFile = {
    id: newId(), createdAt: Date.now(), invite: newId(10), secrets: {}, colls,
  };
  fs.mkdirSync(filesDir(camp.id), { recursive: true });
  saveCampaign(camp);
  return camp;
}

export function saveCampaign(camp: CampaignFile) {
  writeAtomic(path.join(campaignDir(camp.id), "campaign.json"), JSON.stringify(camp));
}

export function loadCampaign(id: string): CampaignFile | null {
  try {
    const camp = JSON.parse(fs.readFileSync(path.join(campaignDir(id), "campaign.json"), "utf8")) as CampaignFile;
    for (const n of COLL_NAMES) camp.colls[n] ??= {};
    for (const p of Object.values(camp.colls.players)) p.online = false;
    return camp;
  } catch {
    return null;
  }
}

export function listCampaignIds(): string[] {
  return fs.readdirSync(CAMPAIGNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && ID_RE.test(d.name) && !d.name.startsWith("_"))
    .map((d) => d.name);
}

/** Não apaga de verdade: renomeia para _lixeira_<id>. */
export function trashCampaign(id: string) {
  fs.renameSync(campaignDir(id), path.join(CAMPAIGNS_DIR, `_lixeira_${id}_${Date.now()}`));
}
