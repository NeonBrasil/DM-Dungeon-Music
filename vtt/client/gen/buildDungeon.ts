import type { Rect } from "../../shared/types.ts";
import { generateDungeon, type DungeonSize } from "./dungeon.ts";
import { doorKey, dungeonNotes, numberSpot, renderDungeon, roundWallSegments, wallSegments } from "./dungeonDraw.ts";
import { STYLES, type StyleName } from "./ink.ts";
import type { Theme, Title } from "./names.ts";
import type { Built } from "./types.ts";

export interface DungeonOpts { seed: string; size: DungeonSize; theme: Theme; style: StyleName; title?: Title }

export function buildDungeon(o: DungeonOpts): Built {
  const d = generateDungeon({ seed: o.seed, size: o.size, theme: o.theme, title: o.title });
  const S = STYLES[o.style];
  // Cada sala/corredor vira uma área de névoa revelável com um clique
  const rooms: Rect[][] = d.areas.map((a) => (a.kind === "room" ? [{ x: a.x, y: a.y, w: a.w, h: a.h }] : a.cells.map(([x, y]) => ({ x, y, w: 1, h: 1 }))));
  const gmLabels: Built["gmLabels"] = [];
  for (const a of d.areas) {
    if (a.kind !== "room") continue;
    const [x, y] = numberSpot(a);
    gmLabels.push({ x, y, text: String(a.num), color: "#ffd24a" });
    if (a.trap) gmLabels.push({ x: Math.min(a.x + a.w - 0.5, x + 0.8), y, text: "!", color: "#ff5a4f" });
  }
  for (const door of d.doors) {
    if (door.type !== "secret") continue;
    gmLabels.push({ x: door.horiz ? door.x + 0.5 : door.x, y: door.horiz ? door.y : door.y + 0.5, text: "S", color: "#ff5a4f" });
  }
  // Iluminação: toda porta abre um vão na parede; portas "de verdade" viram objetos (arcos ficam só como vão)
  const walls = [...wallSegments(d, new Set(d.doors.map(doorKey))), ...roundWallSegments(d, () => true)];
  const doors = d.doors.filter((dr) => dr.type !== "open").map((dr) => ({
    x1: dr.x, y1: dr.y, x2: dr.horiz ? dr.x + 1 : dr.x, y2: dr.horiz ? dr.y : dr.y + 1,
    locked: dr.type === "locked", secret: dr.type === "secret", seeThrough: dr.type === "portcullis",
  }));
  return {
    walls,
    doors,
    title: d.title,
    notes: dungeonNotes(d),
    cols: d.cols,
    rows: d.rows,
    grid: false,
    bg: S.bg,
    scale: { value: 1.5, unit: "m" },
    render: (cell, gm) => renderDungeon(d, { cell, style: o.style, numbers: gm, secrets: gm, seed: o.seed }),
    rooms,
    gmLabels,
  };
}
