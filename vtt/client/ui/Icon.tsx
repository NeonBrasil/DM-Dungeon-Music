// Ícones de traço (24×24), desenhados com currentColor.
import type { ReactNode } from "react";

const P = (d: string) => <path d={d} />;
const C = (cx: number, cy: number, r: number) => <circle cx={cx} cy={cy} r={r} />;
const R = (x: number, y: number, w: number, h: number, rx = 2) => <rect x={x} y={y} width={w} height={h} rx={rx} />;

const ICONS: Record<string, ReactNode> = {
  pointer: P("M4 4l7 17 2.5-7.5L21 11z"),
  ruler: <>{P("M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z")}{P("M14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2")}</>,
  cloud: P("M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"),
  eye: <>{P("M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z")}{C(12, 12, 3)}</>,
  eyeOff: P("M9.9 9.9a3 3 0 1 0 4.2 4.2M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"),
  layers: P("M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"),
  map: P("M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"),
  users: <>{P("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8")}{C(9, 7, 4)}</>,
  user: <>{C(12, 8, 5)}{P("M20 21a8 8 0 0 0-16 0")}</>,
  dice: P("M12 2 21 7v10l-9 5-9-5V7zM12 2 7.5 15h9zM3 7l4.5 8M21 7l-4.5 8M7.5 15 12 22l4.5-7"),
  message: P("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"),
  book: P("M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"),
  music: <>{P("M9 18V5l12-2v13")}{C(6, 18, 3)}{C(18, 16, 3)}</>,
  image: <>{R(3, 3, 18, 18)}{C(9, 9, 2)}{P("M21 15l-5-5L5 21")}</>,
  sliders: P("M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"),
  plus: P("M12 5v14M5 12h14"),
  minus: P("M5 12h14"),
  trash: P("M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"),
  x: P("M18 6 6 18M6 6l12 12"),
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" />,
  pause: <><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></>,
  stop: <rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" />,
  repeat: P("M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"),
  volume: P("M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"),
  link: P("M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"),
  copy: <>{R(9, 9, 13, 13)}{P("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1")}</>,
  upload: P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"),
  download: P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"),
  refresh: P("M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"),
  swords: P("M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"),
  wand: P("M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"),
  crown: P("M2 20h20M3 7l5 5 4-7 4 7 5-5-2 10H5z"),
  grid: <>{R(3, 3, 18, 18, 1)}{P("M3 9h18M3 15h18M9 3v18M15 3v18")}</>,
  logout: P("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"),
  target: <>{C(12, 12, 10)}{C(12, 12, 6)}{C(12, 12, 2)}</>,
  brush: P("M9 11.9 17.1 3.8a2.9 2.9 0 1 1 4 4L13 15.9M7 15c-1.7 0-3 1.3-3 3 0 1.3-2.5 1.5-2 2 1.1 1.1 2.5 2 4 2 2.2 0 4-1.8 4-4a3 3 0 0 0-3-3z"),
  square: R(3, 3, 18, 18),
  edit: P("M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"),
  chevronLeft: P("M15 18l-6-6 6-6"),
  chevronRight: P("M9 18l6-6-6-6"),
  chevronDown: P("M6 9l6 6 6-6"),
  next: <>{P("M5 4l10 8-10 8z")}{P("M19 5v14")}</>,
  globe: <>{C(12, 12, 10)}{P("M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z")}</>,
  arrowUp: P("M12 19V5M5 12l7-7 7 7"),
  arrowDown: P("M12 5v14M19 12l-7 7-7-7"),
  lock: <>{R(3, 11, 18, 11)}{P("M7 11V7a5 5 0 0 1 10 0v4")}</>,
  send: P("M22 2 11 13M22 2l-7 20-4-9-9-4z"),
  home: P("M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"),
  door: <>{P("M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17")}{C(14.5, 12, 0.8)}</>,
  sparkles: P("M12 3l1.9 5.8L20 10.5l-5.8 1.9L12 18l-1.9-5.6L4 10.5l6.1-1.7zM5 3v4M3 5h4M19 17v4M17 19h4"),
  heart: P("M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"),
  undo: P("M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"),
  redo: P("M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"),
  cards: <>{R(3, 7, 12, 15)}{P("M8 3h11a2 2 0 0 1 2 2v13")}</>,
  paw: <>{C(5.5, 10, 2)}{C(9.5, 5.5, 2)}{C(14.5, 5.5, 2)}{C(18.5, 10, 2)}{P("M12 12c-3 0-5.5 3.5-5.5 6 0 1.5 1.2 2.5 2.7 2.5 1.2 0 1.7-.6 2.8-.6s1.6.6 2.8.6c1.5 0 2.7-1 2.7-2.5 0-2.5-2.5-6-5.5-6z")}</>,
  sun: <>{C(12, 12, 4)}{P("M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4")}</>,
  zap: P("M13 2 3 14h9l-1 8 10-12h-9z"),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {ICONS[name] ?? ICONS.square}
    </svg>
  );
}
