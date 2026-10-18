// Backup das campanhas: exporta/importa .zip (campaign.json + files/) e guarda cópias automáticas do estado.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { campaignDir, filesDir, saveCampaign, UPLOAD_EXT, type CampaignFile } from "./store.ts";
import { ID_RE, newId } from "../shared/util.ts";

// ─── ZIP (sem compressão: imagens e músicas já vêm comprimidas) ──────────────

interface OutEntry { name: Buffer; size: number; file?: string; data?: Buffer }

export interface ZipPlan { entries: OutEntry[]; length: number }

/** Lista o que vai no backup e calcula o tamanho exato do .zip. */
export function planBackup(camp: CampaignFile): ZipPlan {
  const entries: OutEntry[] = [];
  const data = Buffer.from(JSON.stringify(camp));
  entries.push({ name: Buffer.from("campaign.json"), size: data.length, data });
  const dir = filesDir(camp.id);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    if (!UPLOAD_EXT.has(path.extname(f).toLowerCase())) continue;
    const file = path.join(dir, f);
    const st = fs.statSync(file);
    if (st.isFile()) entries.push({ name: Buffer.from(`files/${f}`), size: st.size, file });
  }
  const length = entries.reduce((n, e) => n + 30 + e.name.length + e.size + 46 + e.name.length, 22);
  if (length >= 0xffffffff || entries.length >= 0xffff) throw new Error("backup grande demais para .zip (mais de 4 GB)");
  return { entries, length };
}

function dosTime(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Gera o .zip em pedaços (cada arquivo é lido duas vezes: CRC antes, dados depois). */
export async function* zipStream(plan: ZipPlan): AsyncGenerator<Buffer> {
  const { time, date } = dosTime(new Date());
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of plan.entries) {
    let crc = 0;
    if (e.data) crc = zlib.crc32(e.data);
    else for await (const c of fs.createReadStream(e.file!)) crc = zlib.crc32(c as Buffer, crc);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);       // versão necessária
    local.writeUInt16LE(0x0800, 6);   // nomes em UTF-8
    local.writeUInt16LE(0, 8);        // sem compressão
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.size, 18);
    local.writeUInt32LE(e.size, 22);
    local.writeUInt16LE(e.name.length, 26);
    yield local;
    yield e.name;
    if (e.data) yield e.data;
    else for await (const c of fs.createReadStream(e.file!)) yield c as Buffer;
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(e.size, 20);
    cd.writeUInt32LE(e.size, 24);
    cd.writeUInt16LE(e.name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, e.name);
    offset += 30 + e.name.length + e.size;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(plan.entries.length, 8);
  end.writeUInt16LE(plan.entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  yield dir;
  yield end;
}

// ─── Leitura de .zip (aceita os nossos e os refeitos pelo Windows/7-Zip) ──────

interface InEntry { name: string; method: number; compSize: number; offset: number }

async function listZip(fh: fs.promises.FileHandle): Promise<InEntry[]> {
  const total = (await fh.stat()).size;
  const tailLen = Math.min(total, 22 + 0xffff);
  const tail = Buffer.alloc(tailLen);
  await fh.read(tail, 0, tailLen, total - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("não é um arquivo .zip");
  const count = tail.readUInt16LE(eocd + 10);
  const size = tail.readUInt32LE(eocd + 12);
  const cd = Buffer.alloc(size);
  await fh.read(cd, 0, size, tail.readUInt32LE(eocd + 16));
  const out: InEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error(".zip corrompido");
    const n = cd.readUInt16LE(p + 28);
    const name = cd.toString(cd.readUInt16LE(p + 8) & 0x0800 ? "utf8" : "latin1", p + 46, p + 46 + n).replace(/\\/g, "/");
    out.push({ name, method: cd.readUInt16LE(p + 10), compSize: cd.readUInt32LE(p + 20), offset: cd.readUInt32LE(p + 42) });
    p += 46 + n + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
  }
  return out;
}

/** Fluxo com o conteúdo (descomprimido) de uma entrada. */
async function entryStream(fh: fs.promises.FileHandle, zipFile: string, e: InEntry): Promise<NodeJS.ReadableStream> {
  if (e.method !== 0 && e.method !== 8) throw new Error(`compressão não suportada em ${e.name}`);
  const lh = Buffer.alloc(30);
  await fh.read(lh, 0, 30, e.offset);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(".zip corrompido");
  if (e.compSize === 0) return Readable.from([]);
  const start = e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const raw = fs.createReadStream(zipFile, { start, end: start + e.compSize - 1 });
  if (e.method === 0) return raw;
  const inflate = zlib.createInflateRaw();
  raw.pipe(inflate);
  raw.on("error", (err) => inflate.destroy(err));
  return inflate;
}

/** Cria uma campanha nova (id, convite e endereços dos arquivos novos) a partir de um backup .zip. */
export async function importBackup(zipFile: string): Promise<CampaignFile> {
  const fh = await fs.promises.open(zipFile, "r");
  try {
    const entries = await listZip(fh);
    // campaign.json na raiz ou dentro de uma pasta (zip refeito a partir da pasta)
    const main = entries.filter((e) => e.name === "campaign.json" || e.name.endsWith("/campaign.json")).sort((a, b) => a.name.length - b.name.length)[0];
    if (!main) throw new Error("o .zip não tem campaign.json");
    const prefix = main.name.slice(0, -"campaign.json".length);
    const chunks: Buffer[] = [];
    for await (const c of await entryStream(fh, zipFile, main)) chunks.push(c as Buffer);
    const old = JSON.parse(Buffer.concat(chunks).toString("utf8")) as CampaignFile;
    if (!old?.colls?.settings?.main || !ID_RE.test(String(old.id))) throw new Error("campaign.json inválido");

    const id = newId();
    const dir = filesDir(id);
    fs.mkdirSync(dir, { recursive: true });
    for (const e of entries) {
      if (!e.name.startsWith(`${prefix}files/`)) continue;
      const base = e.name.slice(prefix.length + 6);
      // só nomes simples e tipos aceitos (nada de ../ nem executáveis)
      if (!/^[a-z0-9]+\.[a-z0-9]+$/.test(base) || !UPLOAD_EXT.has(path.extname(base))) continue;
      await pipeline(await entryStream(fh, zipFile, e), fs.createWriteStream(path.join(dir, base)));
    }
    const camp = JSON.parse(JSON.stringify(old).split(`/files/${old.id}/`).join(`/files/${id}/`)) as CampaignFile;
    camp.id = id;
    camp.invite = newId(10);
    saveCampaign(camp);
    return camp;
  } finally {
    await fh.close();
  }
}

// ─── Cópias automáticas (campaigns/<id>/snapshots, últimas 24) ───────────────

const SNAP_KEEP = 24;
const SNAP_RE = /^[\w-]+\.json$/;
const snapDir = (id: string) => path.join(campaignDir(id), "snapshots");

/** Copia o campaign.json salvo agora para snapshots/. */
export function snapshot(id: string, tag = "") {
  const src = path.join(campaignDir(id), "campaign.json");
  if (!fs.existsSync(src)) return;
  const dir = snapDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  fs.writeFileSync(path.join(dir, `${stamp}${tag}.json`), fs.readFileSync(src));
  const all = fs.readdirSync(dir).filter((f) => SNAP_RE.test(f)).sort();
  for (const f of all.slice(0, -SNAP_KEEP)) fs.rmSync(path.join(dir, f), { force: true });
}

export function listSnapshots(id: string): { name: string; ts: number; size: number }[] {
  const dir = snapDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => SNAP_RE.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, ts: st.mtimeMs, size: st.size };
    });
}

/** Lê uma cópia automática (null se não existir ou não for desta campanha). */
export function readSnapshot(id: string, name: string): CampaignFile | null {
  if (!SNAP_RE.test(name)) return null;
  try {
    const camp = JSON.parse(fs.readFileSync(path.join(snapDir(id), name), "utf8")) as CampaignFile;
    return camp.id === id && camp.colls?.settings?.main ? camp : null;
  } catch {
    return null;
  }
}
