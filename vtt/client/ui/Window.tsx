// Janela flutuante arrastável e redimensionável (fichas, iniciativa, textos).
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

let zTop = 50;
let cascade = 0;

export function Window({
  title, onClose, children, width = 420, height = 520, actions, minimal, className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
  actions?: ReactNode;
  minimal?: boolean;
  className?: string;
}) {
  const [rect, setRect] = useState(() => {
    const off = (cascade++ % 6) * 28;
    return {
      x: Math.max(8, Math.min(window.innerWidth - width - 360, 120 + off)),
      y: Math.max(8, 70 + off),
      w: Math.min(width, window.innerWidth - 16),
      h: Math.min(height, window.innerHeight - 90),
    };
  });
  const [z, setZ] = useState(() => ++zTop);
  const dragRef = useRef<{ mode: "move" | "size"; sx: number; sy: number; r: typeof rect } | null>(null);

  const start = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, select") && mode === "move") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, r: rect };
  };
  const move = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === "move") {
      setRect({ ...d.r, x: Math.max(-d.r.w + 80, Math.min(window.innerWidth - 80, d.r.x + dx)), y: Math.max(0, Math.min(window.innerHeight - 40, d.r.y + dy)) });
    } else {
      setRect({ ...d.r, w: Math.max(260, d.r.w + dx), h: Math.max(120, d.r.h + dy) });
    }
  };
  const end = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={`window ${className ?? ""}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: minimal ? undefined : rect.h, zIndex: z }}
      onPointerDownCapture={() => z !== zTop && setZ(++zTop)}
    >
      <div className="window-head" onPointerDown={start("move")} onPointerMove={move} onPointerUp={end}>
        <h3>{title}</h3>
        {actions}
        <button className="icon-btn small" onClick={onClose} title="Fechar">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="window-body">{children}</div>
      {!minimal && <div className="window-resize" onPointerDown={start("size")} onPointerMove={move} onPointerUp={end} />}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row">
          <h3 className="grow">{title}</h3>
          <button className="icon-btn small" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
