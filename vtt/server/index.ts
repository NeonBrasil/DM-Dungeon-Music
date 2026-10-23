// Servidor da mesa: HTTP (página, API, arquivos) + WebSocket (/ws) na mesma porta.
// Roda no PC do mestre; jogadores entram pelo link de convite (LAN, VPN ou túnel).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WebSocketServer } from "ws";
import { Room } from "./room.ts";
import {
  createCampaign, DATA_DIR, filesDir, listCampaignIds, loadCampaign, loadConfig, saveCampaign, trashCampaign, UPLOAD_EXT,
  type CampaignFile,
} from "./store.ts";
import { importBackup, listSnapshots, planBackup, readSnapshot, snapshot, zipStream } from "./backup.ts";
import { tunnel } from "./tunnel.ts";
import { importLegacy, listLegacy } from "./legacy.ts";
import { compendium } from "./compendium/index.ts";
import { ID_RE, newId } from "../shared/util.ts";

const DIST = path.resolve(import.meta.dirname, "..", "dist");
const config = loadConfig();
const MAX_UPLOAD = 500 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav",
  ".flac": "audio/flac", ".m4a": "audio/mp4", ".webm": "audio/webm",
};

// ─── Campanhas carregadas ────────────────────────────────────────────────────

interface Live {
  camp: CampaignFile;
  room: Room;
  timer: NodeJS.Timeout | null;
  snapped: boolean; // já guardou a cópia de "como estava ao abrir"
  dirty: boolean;   // mudou desde a última cópia automática
}
const live = new Map<string, Live>();

function getLive(id: string): Live | null {
  if (!ID_RE.test(id)) return null;
  let l = live.get(id);
  if (l) return l;
  const camp = loadCampaign(id);
  if (!camp) return null;
  const entry: Live = { camp, room: null as unknown as Room, timer: null, snapped: false, dirty: false };
  entry.room = new Room(camp, () => scheduleSave(entry));
  live.set(id, entry);
  return entry;
}

function scheduleSave(l: Live) {
  if (live.get(l.camp.id) !== l) return; // entrada antiga (campanha restaurada ou excluída)
  if (!l.snapped) {
    // primeira mudança desde que a campanha abriu: guarda como ela estava
    l.snapped = true;
    snapshot(l.camp.id);
  }
  l.dirty = true;
  if (l.timer) return;
  l.timer = setTimeout(() => {
    l.timer = null;
    saveCampaign(l.camp);
  }, 1000);
}

// De hora em hora, cópia das campanhas que mudaram (campaigns/<id>/snapshots, últimas 24).
setInterval(() => {
  for (const l of live.values()) {
    if (!l.dirty) continue;
    l.dirty = false;
    if (l.timer) {
      clearTimeout(l.timer);
      l.timer = null;
      saveCampaign(l.camp);
    }
    snapshot(l.camp.id);
  }
}, 60 * 60 * 1000).unref();

/** Salva já o que estiver pendente. */
function flush(l: Live) {
  if (!l.timer) return;
  clearTimeout(l.timer);
  l.timer = null;
  saveCampaign(l.camp);
}

function flushAll() {
  for (const l of live.values()) {
    if (l.timer) {
      clearTimeout(l.timer);
      l.timer = null;
      saveCampaign(l.camp);
    }
  }
}

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage, limit = 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("corpo grande demais"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const isGm = (req: http.IncomingMessage) => safeEqual(String(req.headers["x-gm-key"] ?? ""), config.gmKey);

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: string) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end();
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (range && (range[1] || range[2])) {
      let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      start = Math.max(0, start);
      end = Math.min(st.size - 1, end);
      if (start > end) {
        res.writeHead(416, { "content-range": `bytes */${st.size}` }).end();
        return;
      }
      res.writeHead(206, {
        "content-type": type, "content-length": end - start + 1, "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${st.size}`, "cache-control": cache,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": type, "content-length": st.size, "accept-ranges": "bytes", "cache-control": cache });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

function lanUrls(): string[] {
  const urls: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal && !ni.address.startsWith("169.254.")) {
        urls.push(`http://${ni.address}:${port}`);
      }
    }
  }
  return urls;
}

function summary(camp: CampaignFile) {
  const s = camp.colls.settings.main;
  return {
    id: camp.id, name: s.name, createdAt: camp.createdAt, invite: camp.invite,
    players: Object.values(camp.colls.players).map((p) => ({ name: p.name, color: p.color, online: !!p.online })),
  };
}

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c", "#f1c40f", "#e84393", "#00cec9", "#a29bfe"];

// ─── Upload ──────────────────────────────────────────────────────────────────

function upload(req: http.IncomingMessage, res: http.ServerResponse, cid: string, name: string) {
  const ext = path.extname(name).toLowerCase();
  if (!UPLOAD_EXT.has(ext)) return json(res, 400, { error: "tipo de arquivo não suportado" });
  const dir = filesDir(cid);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `upload-${newId()}.tmp`);
  const out = fs.createWriteStream(tmp);
  const hash = crypto.createHash("sha256");
  let size = 0;
  let failed = false;
  const fail = (code: number, msg: string) => {
    if (failed) return;
    failed = true;
    out.destroy();
    fs.rm(tmp, { force: true }, () => {});
    json(res, code, { error: msg });
  };
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > MAX_UPLOAD) {
      fail(413, "arquivo grande demais");
      req.destroy();
      return;
    }
    hash.update(c);
  });
  req.pipe(out);
  req.on("error", () => fail(400, "upload interrompido"));
  out.on("finish", () => {
    if (failed) return;
    const file = hash.digest("hex").slice(0, 20) + ext;
    const dest = path.join(dir, file);
    if (fs.existsSync(dest)) fs.rmSync(tmp);
    else fs.renameSync(tmp, dest);
    json(res, 200, { url: `/files/${cid}/${file}` });
  });
}

/** Recebe o corpo da requisição num arquivo temporário. */
function receive(req: http.IncomingMessage, file: string, limit: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const out = fs.createWriteStream(file);
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        out.destroy();
        reject(new Error("arquivo grande demais"));
      }
    });
    req.on("error", reject);
    out.on("error", reject);
    out.on("finish", resolve);
    req.pipe(out);
  });
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const method = req.method ?? "GET";
  let m: RegExpExecArray | null;

  if (p === "/api/session") return json(res, 200, { gm: isGm(req) });

  if (p === "/api/campaigns" && method === "GET") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const list = listCampaignIds().map((id) => getLive(id)?.camp).filter((c): c is CampaignFile => !!c).map(summary);
    return json(res, 200, list.sort((a, b) => b.createdAt - a.createdAt));
  }
  if (p === "/api/campaigns" && method === "POST") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const body = await readJson(req);
    const camp = createCampaign(String(body.name || "Nova campanha").slice(0, 80));
    return json(res, 200, summary(camp));
  }
  if ((m = /^\/api\/campaigns\/([^/]+)$/.exec(p)) && method === "DELETE") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "não encontrada" });
    for (const cl of l.room.clients) cl.ws.close(4004, "campanha removida");
    if (l.timer) clearTimeout(l.timer);
    live.delete(m[1]);
    trashCampaign(m[1]);
    return json(res, 200, { ok: true });
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/invite$/.exec(p)) && method === "POST") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "não encontrada" });
    l.camp.invite = newId(10);
    scheduleSave(l);
    return json(res, 200, summary(l.camp));
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/public$/.exec(p))) {
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    if (!isGm(req) && !safeEqual(url.searchParams.get("invite") ?? "", l.camp.invite)) {
      return json(res, 403, { error: "convite inválido" });
    }
    const s = summary(l.camp);
    return json(res, 200, { name: s.name, players: s.players });
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/whoami$/.exec(p))) {
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    const auth = String(req.headers["x-auth"] ?? "");
    if (safeEqual(auth, config.gmKey)) return json(res, 200, { role: "gm" });
    const entry = Object.entries(l.camp.secrets).find(([, sec]) => safeEqual(sec, auth));
    if (entry && l.camp.colls.players[entry[0]]) return json(res, 200, { role: "player", playerId: entry[0] });
    return json(res, 403, { error: "sem acesso" });
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/join$/.exec(p)) && method === "POST") {
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    const body = await readJson(req);
    if (!safeEqual(String(body.invite ?? ""), l.camp.invite)) return json(res, 403, { error: "convite inválido" });
    const name = String(body.name ?? "").trim().slice(0, 40);
    if (!name) return json(res, 400, { error: "nome vazio" });
    const players = l.camp.colls.players;
    // Mesa entre amigos: entrar com um nome já usado recupera aquele jogador.
    let player = Object.values(players).find((pl) => pl.name.toLowerCase() === name.toLowerCase());
    if (!player) {
      const used = new Set(Object.values(players).map((pl) => pl.color));
      const color = /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
      player = { id: newId(), name, color, online: false };
      players[player.id] = player;
      l.camp.secrets[player.id] = crypto.randomBytes(18).toString("hex");
      l.room.push("players", player.id);
      scheduleSave(l);
    }
    return json(res, 200, { playerId: player.id, secret: l.camp.secrets[player.id] });
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/upload$/.exec(p)) && method === "POST") {
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    const auth = String(req.headers["x-auth"] ?? "");
    const ok = safeEqual(auth, config.gmKey) || Object.values(l.camp.secrets).some((s) => safeEqual(auth, s));
    if (!ok) return json(res, 403, { error: "sem permissão" });
    return upload(req, res, l.camp.id, url.searchParams.get("name") ?? "");
  }
  // ─── Backup ────────────────────────────────────────────────────────────────
  if ((m = /^\/api\/campaigns\/([^/]+)\/backup$/.exec(p)) && method === "GET") {
    // link de download direto: a chave pode vir na URL
    if (!isGm(req) && !safeEqual(url.searchParams.get("k") ?? "", config.gmKey)) return json(res, 403, { error: "só o mestre" });
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    flush(l);
    const plan = planBackup(l.camp);
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = l.camp.colls.settings.main.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "campanha";
    res.writeHead(200, {
      "content-type": "application/zip", "content-length": plan.length, "cache-control": "no-store",
      "content-disposition": `attachment; filename="${slug}-${stamp}.zip"`,
    });
    return pipeline(Readable.from(zipStream(plan)), res);
  }
  if (p === "/api/campaigns/import" && method === "POST") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const tmp = path.join(DATA_DIR, `import-${newId()}.tmp`);
    try {
      await receive(req, tmp, 0xffffffff);
      const camp = await importBackup(tmp);
      // mesmo nome de outra campanha daqui: marca como cópia
      const names = listCampaignIds().filter((id) => id !== camp.id).map((id) => getLive(id)?.camp.colls.settings.main.name);
      if (names.includes(camp.colls.settings.main.name)) {
        camp.colls.settings.main.name += " (cópia)";
        saveCampaign(camp);
      }
      return json(res, 200, summary(camp));
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/snapshots$/.exec(p)) && method === "GET") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    if (!getLive(m[1])) return json(res, 404, { error: "campanha não encontrada" });
    return json(res, 200, listSnapshots(m[1]));
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/snapshots\/([^/]+)\/restore$/.exec(p)) && method === "POST") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    const restored = readSnapshot(l.camp.id, m[2]);
    if (!restored) return json(res, 404, { error: "cópia não encontrada" });
    // o estado atual também vira cópia (dá para desfazer); quem está na mesa reconecta no estado restaurado
    flush(l);
    live.delete(l.camp.id);
    snapshot(l.camp.id, "-antes-de-restaurar");
    saveCampaign(restored);
    for (const cl of l.room.clients) cl.ws.close(4005, "campanha restaurada");
    return json(res, 200, { ok: true });
  }
  if (p === "/api/legacy/tracks") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    return json(res, 200, listLegacy());
  }
  if ((m = /^\/api\/campaigns\/([^/]+)\/legacy-import$/.exec(p)) && method === "POST") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const l = getLive(m[1]);
    if (!l) return json(res, 404, { error: "campanha não encontrada" });
    const body = await readJson(req);
    const paths = Array.isArray(body.paths) ? body.paths.filter((x: unknown) => typeof x === "string") : [];
    return json(res, 200, await importLegacy(paths, filesDir(l.camp.id), `/files/${l.camp.id}`));
  }
  // Bestiário e itens: jogadores não leem nem pelo endereço direto.
  if ((m = /^\/api\/compendium\/([a-z-]+)$/.exec(p))) {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const body = compendium(m[1]);
    if (!body) return json(res, 404, { error: "não encontrado" });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(body);
  }
  if (p === "/api/net") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    return json(res, 200, { port, lan: lanUrls(), tunnel: tunnel.status() });
  }
  if (p === "/api/tunnel" && method === "POST") {
    if (!isGm(req)) return json(res, 403, { error: "só o mestre" });
    const body = await readJson(req);
    if (body.on) tunnel.start(port);
    else tunnel.stop();
    return json(res, 200, tunnel.status());
  }
  if (p.startsWith("/api/")) return json(res, 404, { error: "rota desconhecida" });

  if ((m = /^\/files\/([^/]+)\/([a-z0-9]+\.[a-z0-9]+)$/.exec(p))) {
    if (!ID_RE.test(m[1])) return res.writeHead(404).end();
    return sendFile(req, res, path.join(filesDir(m[1]), m[2]), "public, max-age=31536000, immutable");
  }

  // Arquivos do cliente (build do Vite); rotas desconhecidas caem no index.html (SPA).
  const rel = path.normalize(decodeURIComponent(p)).replace(/^([/\\])+/, "");
  const file = path.join(DIST, rel);
  if (rel && file.startsWith(DIST + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(req, res, file, rel.startsWith("assets") ? "public, max-age=31536000, immutable" : "no-cache");
  }
  const index = path.join(DIST, "index.html");
  if (!fs.existsSync(index)) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Cliente não compilado. Rode: npm run build");
  }
  return sendFile(req, res, index, "no-cache");
}

// ─── Servidor ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    if (!res.headersSent) json(res, 500, { error: String(err?.message ?? err) });
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const l = url.pathname === "/ws" ? getLive(url.searchParams.get("c") ?? "") : null;
  if (!l) return socket.destroy();
  const k = url.searchParams.get("k");
  const s = url.searchParams.get("s");
  let role: "gm" | "player" | null = null;
  let playerId: string | null = null;
  if (k && safeEqual(k, config.gmKey)) role = "gm";
  else if (s) {
    const entry = Object.entries(l.camp.secrets).find(([, sec]) => safeEqual(sec, s));
    if (entry && l.camp.colls.players[entry[0]]) {
      role = "player";
      playerId = entry[0];
    }
  }
  if (!role) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    l.room.join(ws, role, playerId);
  });
});

let port = Number(process.env.PORT) || config.port;

function listen(attempt = 0) {
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < 10) {
      port++;
      listen(attempt + 1);
    } else throw err;
  });
  server.listen(port, () => {
    const gmUrl = `http://localhost:${port}/?gm=${config.gmKey}`;
    console.log(`\n  Mesa rodando na porta ${port}`);
    console.log(`  Mestre:  ${gmUrl}`);
    for (const u of lanUrls()) console.log(`  Rede:    ${u}`);
    console.log("\n  Ctrl+C para fechar.\n");
    if (process.argv.includes("--open")) {
      spawn("cmd", ["/c", "start", "", gmUrl.replace(/&/g, "^&")], { detached: true, stdio: "ignore" }).unref();
    }
  });
}

listen();

for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
  process.on(sig, () => {
    flushAll();
    tunnel.stop();
    process.exit(0);
  });
}
process.on("exit", flushAll);
