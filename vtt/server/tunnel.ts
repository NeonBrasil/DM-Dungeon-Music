// Link público grátis: Cloudflare Quick Tunnel (sem conta). Roda
// `cloudflared tunnel --url http://localhost:PORT` e lê o endereço *.trycloudflare.com.
// Se o cloudflared não estiver instalado, baixa o executável oficial do GitHub da Cloudflare.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DATA_DIR } from "./store.ts";

type State = "off" | "downloading" | "starting" | "on" | "error";

const BIN_DIR = path.join(DATA_DIR, "bin");
const LOCAL_EXE = path.join(BIN_DIR, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const RELEASE = "https://github.com/cloudflare/cloudflared/releases/latest/download/";
const ASSET: Record<string, string> = {
  "win32-x64": "cloudflared-windows-amd64.exe",
  "win32-ia32": "cloudflared-windows-386.exe",
  "linux-x64": "cloudflared-linux-amd64",
  "linux-arm64": "cloudflared-linux-arm64",
};

class Tunnel {
  private state: State = "off";
  private url: string | null = null;
  private error: string | null = null;
  private progress = 0;
  private proc: ChildProcess | null = null;

  status() {
    return { state: this.state, url: this.url, error: this.error, progress: this.progress };
  }

  start(port: number) {
    if (this.state !== "off" && this.state !== "error") return;
    this.error = null;
    this.url = null;
    this.state = "starting";
    this.run(port).catch((err) => {
      this.state = "error";
      this.error = String(err?.message ?? err);
    });
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
    this.state = "off";
    this.url = null;
  }

  private async findExe(): Promise<string> {
    if (fs.existsSync(LOCAL_EXE)) return LOCAL_EXE;
    const onPath = await new Promise<boolean>((resolve) => {
      const p = spawn("cloudflared", ["--version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
    if (onPath) return "cloudflared";
    const asset = ASSET[`${process.platform}-${process.arch}`];
    if (!asset) throw new Error("Sistema sem cloudflared automático; instale manualmente.");
    this.state = "downloading";
    this.progress = 0;
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const res = await fetch(RELEASE + asset);
    if (!res.ok || !res.body) throw new Error(`Falha ao baixar cloudflared (${res.status})`);
    const total = Number(res.headers.get("content-length")) || 0;
    let got = 0;
    const tmp = LOCAL_EXE + ".part";
    const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
    body.on("data", (c: Buffer) => {
      got += c.length;
      if (total) this.progress = got / total;
    });
    await pipeline(body, fs.createWriteStream(tmp));
    fs.renameSync(tmp, LOCAL_EXE);
    if (process.platform !== "win32") fs.chmodSync(LOCAL_EXE, 0o755);
    return LOCAL_EXE;
  }

  private async run(port: number) {
    const exe = await this.findExe();
    if (this.state === "off") return; // parado durante o download
    this.state = "starting";
    const proc = spawn(exe, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;
    const onData = (buf: Buffer) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(buf));
      if (m && !this.url) {
        this.url = m[0];
        this.state = "on";
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.url = null;
      if (this.state !== "off") {
        this.state = "error";
        this.error = `cloudflared encerrou (código ${code})`;
      }
    });
  }
}

export const tunnel = new Tunnel();
