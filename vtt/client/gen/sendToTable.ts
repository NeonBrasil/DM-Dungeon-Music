// Coloca um mapa gerado na mesa: imagem na camada do mapa, rótulos do mestre, névoa e notas.
import { newId } from "../../shared/util.ts";
import type { Page } from "../../shared/types.ts";
import { api, game, uploadFile } from "../game.ts";
import { blankPage } from "../table/TopBar.tsx";
import { ui } from "../table/ui.ts";
import type { SendOptions } from "./GeneratorStudio.tsx";
import type { Built } from "./types.ts";

const GS = 70;
const MAX_PX = 7000;

export async function sendToTable(b: Built, o: SendOptions) {
  const cell = Math.min(GS, Math.floor(MAX_PX / Math.max(b.cols, b.rows)));
  const cv = b.render(cell, false);
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
  if (!blob) throw new Error("falha ao gerar a imagem");
  const slug = b.title.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40) || "mapa";
  const url = await uploadFile(blob, `${slug}.png`);

  const pages = Object.values(game.get().colls.pages);
  const order = pages.reduce((m, p) => Math.max(m, p.order), 0) + 1;
  const page: Page = {
    ...blankPage(b.title, order),
    cols: b.cols,
    rows: b.rows,
    gridSize: GS,
    grid: b.grid ? "square" : "none",
    bg: b.bg,
    scale: b.scale.value,
    unit: b.scale.unit,
    fogOn: o.fog && !!b.rooms,
    fog: "",
    walls: b.walls?.map((v) => Math.round(v * GS * 10) / 10),
    doors: b.doors?.map((d) => ({ id: newId(8), x1: d.x1 * GS, y1: d.y1 * GS, x2: d.x2 * GS, y2: d.y2 * GS, open: false, locked: d.locked, secret: d.secret, seeThrough: d.seeThrough })),
    light: b.walls ? { on: o.light, global: false, explore: true } : undefined,
    rooms: b.rooms,
    source: o.source,
  };
  api.create("pages", page);
  api.create("graphics", {
    id: newId(), pageId: page.id, layer: "map", z: 0, kind: "image",
    x: 0, y: 0, w: b.cols * GS, h: b.rows * GS, src: url, name: b.title, controlledBy: [], locked: true,
  });
  let z = 0;
  for (const l of b.gmLabels ?? []) {
    const size = (l.size ?? 0.6) * GS;
    api.create("graphics", {
      id: newId(), pageId: page.id, layer: "gm", z: z++, kind: "text", text: l.text, color: l.color,
      x: l.x * GS - size, y: l.y * GS - size / 2, w: size * 2, h: size, controlledBy: [],
    });
  }
  // marcadores do mestre que abrem o lugar (ou levam à página dele, se já existir)
  const markH = Math.max(0.9, Math.max(b.cols, b.rows) / 70); // mapas grandes: letra maior (lê no zoom de página inteira)
  for (const l of o.marks ? b.links ?? [] : []) {
    const h = GS * markH;
    const w = Math.max(h, l.link.label.length * h * 0.62);
    api.create("graphics", {
      id: newId(), pageId: page.id, layer: "gm", z: z++, kind: "text", text: l.link.label, color: "#ffd24a",
      x: l.x * GS - w / 2, y: (l.y + 0.6) * GS, w, h, controlledBy: [], link: l.link,
    });
  }
  if (b.notes) api.create("handouts", { id: newId(), name: b.title, text: b.notes, shared: false });
  ui.set({ viewPageId: page.id, generator: null, genPreset: null, layer: "tokens", tool: o.fog && b.rooms ? "fog" : "select", fogShape: "room", fogMode: "reveal" });
}
