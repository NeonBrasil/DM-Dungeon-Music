// Importa músicas e efeitos da biblioteca do DM - Dungeon Music (app desktop):
// ~/.dm_dungeon_music/tracks_music.json e tracks_sfx.json ([{ file_path, volume }]).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const LEGACY_DIR = path.join(os.homedir(), ".dm_dungeon_music");
const AUDIO_EXT = new Set([".mp3", ".ogg", ".opus", ".wav", ".flac", ".m4a", ".webm"]);

export interface LegacyTrack {
  path: string;
  name: string;
  kind: "music" | "sfx";
  volume: number;
  exists: boolean;
  size: number;
}

export function listLegacy(): LegacyTrack[] {
  const out: LegacyTrack[] = [];
  for (const [file, kind] of [["tracks_music.json", "music"], ["tracks_sfx.json", "sfx"]] as const) {
    let list: { file_path?: unknown; volume?: unknown }[] = [];
    try {
      list = JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, file), "utf8"));
    } catch {
      continue;
    }
    for (const t of Array.isArray(list) ? list : []) {
      if (typeof t.file_path !== "string" || !AUDIO_EXT.has(path.extname(t.file_path).toLowerCase())) continue;
      let st: fs.Stats | null = null;
      try {
        st = fs.statSync(t.file_path);
      } catch {
        /* arquivo sumiu */
      }
      out.push({
        path: t.file_path,
        name: path.basename(t.file_path).replace(/\.[^.]+$/, ""),
        kind,
        volume: Math.min(1, Math.max(0, Number(t.volume) || 0.7)),
        exists: !!st?.isFile(),
        size: st?.size ?? 0,
      });
    }
  }
  return out;
}

async function hashFile(file: string): Promise<string> {
  const h = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex").slice(0, 20);
}

/** Copia as faixas pedidas (só as que estão na biblioteca antiga) para a pasta da campanha. */
export async function importLegacy(paths: string[], destDir: string, urlPrefix: string): Promise<{ path: string; url: string }[]> {
  const allowed = new Map(listLegacy().filter((t) => t.exists).map((t) => [t.path, t]));
  fs.mkdirSync(destDir, { recursive: true });
  const out: { path: string; url: string }[] = [];
  for (const p of paths) {
    if (!allowed.has(p)) continue;
    const name = (await hashFile(p)) + path.extname(p).toLowerCase();
    const dest = path.join(destDir, name);
    if (!fs.existsSync(dest)) await fs.promises.copyFile(p, dest);
    out.push({ path: p, url: `${urlPrefix}/${name}` });
  }
  return out;
}
