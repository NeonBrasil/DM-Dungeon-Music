import type { Layer } from "../../shared/types.ts";
import { game } from "../game.ts";
import { Icon } from "../ui/Icon.tsx";
import { redo, undo } from "./history.ts";
import { ui, type Tool } from "./ui.ts";

const LAYERS: [Layer, string, string][] = [
  ["map", "MAPA", "Camada do mapa (fundo, travado para jogadores)"],
  ["tokens", "TOK", "Camada de tokens (todos veem)"],
  ["gm", "MES", "Camada do mestre (só você vê)"],
];

export function Toolbar() {
  const role = game.use((s) => s.role);
  const tool = ui.use((s) => s.tool);
  const layer = ui.use((s) => s.layer);
  const showTurns = ui.use((s) => s.showTurns);
  const gm = role === "gm";

  const T = (t: Tool, icon: string, title: string) => (
    <button className={`icon-btn ${tool === t ? "active" : ""}`} title={title} onClick={() => ui.set({ tool: t })}>
      <Icon name={icon} />
    </button>
  );

  return (
    <div className="toolbar">
      {T("select", "pointer", "Selecionar e mover (V) · Shift+arrastar seleciona área · segure para pingar")}
      {T("ruler", "ruler", "Régua (R)")}
      {T("draw", "edit", "Desenhar (D)")}
      {T("template", "target", "Áreas de magia (T)")}
      {gm && T("fog", "cloud", "Névoa de guerra (F)")}
      {gm && T("walls", "door", "Paredes, portas e iluminação (W)")}
      {gm && (
        <>
          <div className="sep" />
          {LAYERS.map(([l, label, title]) => (
            <button
              key={l}
              className={`icon-btn layer-btn ${layer === l ? "active" : ""}`}
              title={title}
              onClick={() => ui.set({ layer: l, selected: [] })}
            >
              {label}
            </button>
          ))}
        </>
      )}
      <div className="sep" />
      <button className={`icon-btn ${showTurns ? "active" : ""}`} title="Iniciativa" onClick={() => ui.set({ showTurns: !showTurns })}>
        <Icon name="swords" />
      </button>
      {gm && (
        <button className="icon-btn" title="Gerador de mapas" onClick={() => ui.set({ generator: (localStorage.getItem("dm.gen.kind") as "dungeon") ?? "dungeon" })}>
          <Icon name="wand" />
        </button>
      )}
      <span className="spacer" />
      <button className="icon-btn" title="Desfazer (Ctrl+Z)" onClick={() => undo()}><Icon name="undo" /></button>
      <button className="icon-btn" title="Refazer (Ctrl+Y)" onClick={() => redo()}><Icon name="redo" /></button>
    </div>
  );
}
