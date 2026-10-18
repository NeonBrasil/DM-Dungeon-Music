import { useEffect, useRef } from "react";
import { Icon } from "./Icon.tsx";

export type MenuItem = { label: string; icon?: string; danger?: boolean; onClick: () => void } | "sep";

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  // mantém o menu dentro da janela
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - items.length * 32 - 10);
  return (
    <div className="ctx-menu" ref={ref} style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="sep" />
        ) : (
          <button
            key={i}
            className={it.danger ? "danger" : ""}
            style={it.danger ? { color: "var(--danger)" } : undefined}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.icon && <Icon name={it.icon} size={15} />}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
