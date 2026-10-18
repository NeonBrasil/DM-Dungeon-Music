// Barra superior: páginas (mestre), jogadores, compartilhar.
import { useMemo, useState } from "react";
import { newId } from "../../shared/util.ts";
import { api, game, useColl } from "../game.ts";
import { Avatar } from "../chat/Chat.tsx";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ShareModal } from "./ShareModal.tsx";
import { ui, useViewPage } from "./ui.ts";
import type { Page } from "../../shared/types.ts";

export function blankPage(name: string, order: number): Page {
  return {
    id: newId(), name, order, cols: 30, rows: 20, gridSize: 70, grid: "square", gridColor: "#000000",
    gridOpacity: 0.2, scale: 1.5, unit: "m", bg: "#e8e4da", fogOn: false, fog: "",
  };
}

export function TopBar() {
  const role = game.use((s) => s.role);
  const status = game.use((s) => s.status);
  const settings = useColl("settings").main;
  const pages = useColl("pages");
  const players = useColl("players");
  const view = useViewPage();
  const [share, setShare] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const gm = role === "gm";
  const sorted = useMemo(() => Object.values(pages).sort((a, b) => a.order - b.order), [pages]);
  const playerList = useMemo(() => Object.values(players).sort((a, b) => Number(!!b.online) - Number(!!a.online)), [players]);

  const addPage = () => {
    const p = blankPage(`Página ${sorted.length + 1}`, (sorted[sorted.length - 1]?.order ?? 0) + 1);
    api.create("pages", p);
    ui.set({ viewPageId: p.id });
  };

  const pageMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const p = pages[id];
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Levar jogadores para cá", icon: "users", onClick: () => api.update("settings", "main", { playerPageId: id }) },
        {
          label: "Renomear", icon: "edit", onClick: () => {
            const name = prompt("Nome da página", p.name);
            if (name?.trim()) api.update("pages", id, { name: name.trim() });
          },
        },
        "sep",
        {
          label: "Excluir página", icon: "trash", danger: true, onClick: () => {
            if (sorted.length > 1 && confirm(`Excluir "${p.name}" e tudo nela?`)) api.remove("pages", id);
          },
        },
      ],
    });
  };

  const playerMenu = (e: React.MouseEvent, id: string) => {
    if (!gm) return;
    e.preventDefault();
    const p = players[id];
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [{
        label: `Remover ${p.name}`, icon: "trash", danger: true, onClick: () => {
          if (confirm(`Remover ${p.name} da campanha?`)) api.remove("players", id);
        },
      }],
    });
  };

  return (
    <div className="topbar">
      {gm && (
        <a className="icon-btn" href="/" title="Campanhas">
          <Icon name="home" />
        </a>
      )}
      <div className="title">{settings?.name}</div>
      {gm ? (
        <div className="pages">
          {sorted.map((p) => (
            <button
              key={p.id}
              className={`page-tab ${view?.id === p.id ? "on" : ""}`}
              onClick={() => ui.set({ viewPageId: p.id })}
              onDoubleClick={() => {
                const name = prompt("Nome da página", p.name);
                if (name?.trim()) api.update("pages", p.id, { name: name.trim() });
              }}
              onContextMenu={(e) => pageMenu(e, p.id)}
              title="Clique direito: opções"
            >
              {settings?.playerPageId === p.id && (
                <span className="players-here" title="Jogadores estão aqui"><Icon name="users" size={14} /></span>
              )}
              {p.name}
            </button>
          ))}
          <button className="icon-btn small" onClick={addPage} title="Nova página">
            <Icon name="plus" size={16} />
          </button>
          {view && settings?.playerPageId !== view.id && (
            <button className="btn small" onClick={() => api.update("settings", "main", { playerPageId: view.id })}>
              <Icon name="users" size={14} /> Levar jogadores para cá
            </button>
          )}
        </div>
      ) : (
        <div className="pages">
          <span className="muted small" style={{ alignSelf: "center" }}>{view?.name}</span>
        </div>
      )}
      {status !== "open" && <span className="chip" style={{ color: "var(--danger)" }}>{status === "connecting" ? "Conectando…" : "Reconectando…"}</span>}
      <div className="player-list">
        {playerList.map((p) => (
          <span key={p.id} onContextMenu={(e) => playerMenu(e, p.id)}>
            <Avatar name={p.name} color={p.color} online={p.online} />
          </span>
        ))}
      </div>
      {gm && (
        <button className="btn small primary" onClick={() => setShare(true)}>
          <Icon name="link" size={15} /> Convidar
        </button>
      )}
      {share && <ShareModal onClose={() => setShare(false)} />}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
