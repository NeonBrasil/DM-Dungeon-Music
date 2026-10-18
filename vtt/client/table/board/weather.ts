// Clima sobre o tabuleiro (camada própria, em pixels de tela): chuva, tempestade, neve,
// névoa, brasas, cinzas, folhas e areia.
import type { WeatherType } from "../../../shared/types.ts";

interface P { x: number; y: number; vx: number; vy: number; s: number; a: number; r: number; vr: number; c: string }

const LEAF = ["#b5651d", "#d2691e", "#8b4513", "#c49a3a", "#a0522d"];
const EMBER = ["#ffb347", "#ff7f2a", "#ffd27f", "#ff5a1f"];

export class Weather {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private type: WeatherType = "none";
  private intensity = 0.5;
  private parts: P[] = [];
  private raf = 0;
  private last = 0;
  private flash = 0;
  private nextFlash = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.reset();
  }

  set(type: WeatherType, intensity: number) {
    if (type === this.type && Math.abs(intensity - this.intensity) < 0.01) return;
    this.type = type;
    this.intensity = intensity;
    this.reset();
    if (type === "none") this.stop();
    else this.start();
  }

  private count(): number {
    const area = (this.w * this.h) / 1e6;
    const base: Record<WeatherType, number> = { none: 0, rain: 420, storm: 650, snow: 260, fog: 14, embers: 110, ash: 160, leaves: 40, sand: 300 };
    return Math.round(base[this.type] * Math.max(0.08, this.intensity) * (this.type === "fog" ? 1 : Math.max(0.4, area)));
  }

  private spawn(anywhere: boolean): P {
    const r = Math.random;
    const t = this.type;
    const x = r() * (this.w + 200) - 100;
    const y = anywhere ? r() * this.h : t === "embers" ? this.h + 10 : -20;
    switch (t) {
      case "rain":
      case "storm":
        return { x, y, vx: t === "storm" ? -260 : -90, vy: 900 + r() * 500, s: 10 + r() * 14, a: 0.35 + r() * 0.3, r: 0, vr: 0, c: "" };
      case "snow":
        return { x, y, vx: 0, vy: 30 + r() * 60, s: 1 + r() * 2.6, a: 0.6 + r() * 0.4, r: r() * 6.28, vr: 0.5 + r(), c: "" };
      case "ash":
        return { x, y, vx: 12, vy: 18 + r() * 30, s: 0.8 + r() * 1.6, a: 0.35 + r() * 0.4, r: r() * 6.28, vr: 0.4 + r(), c: "" };
      case "fog":
        return { x: r() * this.w, y: r() * this.h, vx: 8 + r() * 18, vy: (r() - 0.5) * 4, s: 160 + r() * 260, a: 0.06 + r() * 0.08, r: 0, vr: 0, c: "" };
      case "embers":
        return { x, y, vx: (r() - 0.5) * 30, vy: -(30 + r() * 70), s: 1 + r() * 2.2, a: 0.6 + r() * 0.4, r: r() * 6.28, vr: 2 + r() * 3, c: EMBER[Math.floor(r() * EMBER.length)] };
      case "leaves":
        return { x, y, vx: 20 + r() * 40, vy: 40 + r() * 50, s: 5 + r() * 5, a: 0.85, r: r() * 6.28, vr: (r() - 0.5) * 4, c: LEAF[Math.floor(r() * LEAF.length)] };
      case "sand":
        return { x: anywhere ? r() * this.w : -40, y: r() * this.h, vx: 500 + r() * 400, vy: (r() - 0.5) * 40, s: 8 + r() * 16, a: 0.18 + r() * 0.2, r: 0, vr: 0, c: "" };
      default:
        return { x, y, vx: 0, vy: 0, s: 0, a: 0, r: 0, vr: 0, c: "" };
    }
  }

  private reset() {
    this.parts = [];
    const n = this.count();
    for (let i = 0; i < n; i++) this.parts.push(this.spawn(true));
  }

  private start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt, t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private step(dt: number, t: number) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const type = this.type;
    if (type === "storm") {
      ctx.fillStyle = "rgba(5,8,20,0.22)";
      ctx.fillRect(0, 0, w, h);
    } else if (type === "sand") {
      ctx.fillStyle = "rgba(190,150,90,0.13)";
      ctx.fillRect(0, 0, w, h);
    }
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (type === "snow" || type === "ash") p.x += Math.sin(p.r) * 12 * dt;
      if (type === "leaves") p.x += Math.sin(p.r * 0.7) * 30 * dt;
      const out = p.y > h + 30 || p.y < -40 || p.x > w + 120 || p.x < -140;
      if (type === "fog") {
        if (p.x - p.s > w) p.x = -p.s;
      } else if (out) Object.assign(p, this.spawn(false));
      switch (type) {
        case "rain":
        case "storm": {
          ctx.strokeStyle = `rgba(175,195,225,${p.a})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          const k = p.s / Math.hypot(p.vx, p.vy);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
          ctx.stroke();
          break;
        }
        case "snow":
        case "ash":
          ctx.fillStyle = type === "snow" ? `rgba(255,255,255,${p.a})` : `rgba(120,115,110,${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "fog": {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
          g.addColorStop(0, `rgba(225,228,232,${p.a})`);
          g.addColorStop(1, "rgba(225,228,232,0)");
          ctx.fillStyle = g;
          ctx.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
          break;
        }
        case "embers":
          ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(p.r * 3));
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case "leaves":
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case "sand":
          ctx.strokeStyle = `rgba(214,180,120,${p.a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.s, p.y);
          ctx.stroke();
          break;
      }
    }
    if (type === "storm") {
      if (t > this.nextFlash) {
        this.flash = 1;
        this.nextFlash = t + 3500 + Math.random() * 7000;
      }
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(235,240,255,${this.flash * 0.55})`;
        ctx.fillRect(0, 0, w, h);
        this.flash = Math.max(0, this.flash - dt * 4);
      }
    }
  }
}

export const WEATHER_LABELS: Record<WeatherType, string> = {
  none: "Nenhum", rain: "Chuva", storm: "Tempestade", snow: "Neve", fog: "Névoa", embers: "Brasas", ash: "Cinzas", leaves: "Folhas", sand: "Areia",
};
