// Opções da ferramenta ativa (canto superior esquerdo do tabuleiro).
import type { Page, TemplateType } from "../../shared/types.ts";
import { fogEncode } from "../../shared/util.ts";
import { game, useColl } from "../game.ts";
import { TPL_NAMES } from "./board/templates.ts";
import { act, group } from "./history.ts";
import { ui, type DrawMode } from "./ui.ts";

const COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6", "#ecf0f1", "#1d1d1d"];

export const LIGHT_PRESETS: { id: string; label: string; bright: number; dim: number; color: string }[] = [
  { id: "candle", label: "Vela (1,5 + 1,5 m)", bright: 1.5, dim: 1.5, color: "#ffb347" },
  { id: "torch", label: "Tocha (6 + 6 m)", bright: 6, dim: 6, color: "#ff9f43" },
  { id: "lamp", label: "Lampião (4,5 + 9 m)", bright: 4.5, dim: 9, color: "#ffd27f" },
  { id: "bullseye", label: "Lanterna furta-fogo (18 + 18 m)", bright: 18, dim: 18, color: "#ffe4a8" },
  { id: "light", label: "Magia Luz (6 + 6 m)", bright: 6, dim: 6, color: "#ffffff" },
];

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg small">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function FogOptions({ page }: { page: Page }) {
  const mode = ui.use((s) => s.fogMode);
  const shape = ui.use((s) => s.fogShape);
  const brush = ui.use((s) => s.fogBrush);
  const all = (reveal: boolean) => act.update("pages", page.id, { fog: fogEncode(new Uint8Array(page.cols * page.rows).fill(reveal ? 1 : 0)) });
  return (
    <>
      <label className="check small">
        <input type="checkbox" checked={page.fogOn} onChange={(e) => act.update("pages", page.id, { fogOn: e.target.checked })} />
        Névoa ativa
      </label>
      <Seg value={mode} options={[["reveal", "Revelar"], ["hide", "Esconder"]]} onChange={(v) => ui.set({ fogMode: v })} />
      <div className="seg small">
        <button className={shape === "brush" ? "on" : ""} onClick={() => ui.set({ fogShape: "brush" })}>Pincel</button>
        <button className={shape === "rect" ? "on" : ""} onClick={() => ui.set({ fogShape: "rect" })}>Retângulo</button>
        <button className={shape === "room" ? "on" : ""} disabled={!page.rooms?.length} title={page.rooms?.length ? "" : "Só em mapas gerados"} onClick={() => ui.set({ fogShape: "room" })}>Sala</button>
      </div>
      {shape === "brush" && (
        <label className="row small muted">
          Tamanho
          <input type="range" min={1} max={6} value={brush} onChange={(e) => ui.set({ fogBrush: Number(e.target.value) })} />
        </label>
      )}
      <button className="btn small" onClick={() => all(true)}>Revelar tudo</button>
      <button className="btn small" onClick={() => all(false)}>Esconder tudo</button>
    </>
  );
}

function DrawOptions() {
  const mode = ui.use((s) => s.drawMode);
  const color = ui.use((s) => s.drawColor);
  const width = ui.use((s) => s.drawWidth);
  const fill = ui.use((s) => s.drawFill);
  return (
    <>
      <Seg<DrawMode> value={mode} options={[["free", "Lápis"], ["line", "Linha"], ["rect", "Retângulo"], ["ellipse", "Elipse"], ["text", "Texto"]]} onChange={(v) => ui.set({ drawMode: v })} />
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => ui.set({ drawColor: c })} />
        ))}
        <input type="color" value={color} onChange={(e) => ui.set({ drawColor: e.target.value })} title="Outra cor" />
      </div>
      {mode !== "text" && (
        <label className="row small muted">
          Espessura
          <input type="range" min={1} max={20} value={width} onChange={(e) => ui.set({ drawWidth: Number(e.target.value) })} />
        </label>
      )}
      {(mode === "rect" || mode === "ellipse" || mode === "free") && (
        <label className="check small"><input type="checkbox" checked={fill} onChange={(e) => ui.set({ drawFill: e.target.checked })} /> Preencher</label>
      )}
    </>
  );
}

function TemplateOptions({ page }: { page: Page }) {
  const type = ui.use((s) => s.tplType);
  const graphics = useColl("graphics");
  const role = game.use((s) => s.role);
  const playerId = game.use((s) => s.playerId);
  const mine = Object.values(graphics).filter((g) => g.pageId === page.id && g.kind === "template" && (role === "gm" || g.controlledBy.includes(playerId ?? "")));
  return (
    <>
      <Seg<TemplateType> value={type} options={(Object.keys(TPL_NAMES) as TemplateType[]).map((k) => [k, TPL_NAMES[k]])} onChange={(v) => ui.set({ tplType: v })} />
      {mine.length > 0 && (
        <button className="btn small" onClick={() => group(() => mine.forEach((g) => act.remove("graphics", g.id)))}>
          Apagar {role === "gm" ? "todos os" : "meus"} moldes ({mine.length})
        </button>
      )}
    </>
  );
}

function WallOptions({ page }: { page: Page }) {
  const mode = ui.use((s) => s.wallMode);
  const preview = ui.use((s) => s.lightPreview);
  const graphics = useColl("graphics");
  const light = page.light ?? { on: false, global: false, explore: true };
  const setLight = (patch: Partial<typeof light>) => act.update("pages", page.id, { light: { ...light, ...patch } });
  const playerTokens = Object.values(graphics).filter((g) => g.pageId === page.id && g.kind === "token" && g.controlledBy.length > 0);
  const torch = LIGHT_PRESETS[1];
  return (
    <>
      <Seg value={mode} options={[["wall", "Parede"], ["door", "Porta"], ["erase", "Apagar"]]} onChange={(v) => ui.set({ wallMode: v })} />
      <span className="muted small">{(page.walls?.length ?? 0) / 4} paredes · {page.doors?.length ?? 0} portas</span>
      <label className="check small"><input type="checkbox" checked={light.on} onChange={(e) => setLight({ on: e.target.checked })} /> Iluminação dinâmica</label>
      {light.on && (
        <>
          <label className="check small" title="Tudo iluminado; só as paredes bloqueiam a visão">
            <input type="checkbox" checked={light.global} onChange={(e) => setLight({ global: e.target.checked })} /> Luz do dia
          </label>
          <label className="check small" title="Lugares já vistos ficam na penumbra">
            <input type="checkbox" checked={light.explore} onChange={(e) => setLight({ explore: e.target.checked })} /> Lembrar explorado
          </label>
          <label className="check small" title="Selecione um token com visão">
            <input type="checkbox" checked={preview} onChange={(e) => ui.set({ lightPreview: e.target.checked })} /> Ver como o token selecionado
          </label>
          {!light.global && playerTokens.length > 0 && (
            <button
              className="btn small"
              title="Jogadores sem luz não enxergam no escuro"
              onClick={() => group(() => playerTokens.forEach((g) => act.update("graphics", g.id, {
                light: { bright: torch.bright, dim: torch.dim, color: torch.color },
                vision: { on: true, range: g.vision?.range ?? 0, dark: g.vision?.dark ?? 0 },
              })))}
            >
              Tocha para os jogadores
            </button>
          )}
        </>
      )}
      {(page.walls?.length || page.doors?.length) ? (
        <button className="btn small danger" onClick={() => confirm("Apagar todas as paredes e portas desta página?") && act.update("pages", page.id, { walls: [], doors: [] })}>
          Limpar
        </button>
      ) : null}
    </>
  );
}

export function ToolOptions({ page }: { page: Page }) {
  const tool = ui.use((s) => s.tool);
  const role = game.use((s) => s.role);
  const gm = role === "gm";
  let body: React.ReactNode = null;
  if (tool === "fog" && gm) body = <FogOptions page={page} />;
  else if (tool === "draw") body = <DrawOptions />;
  else if (tool === "template") body = <TemplateOptions page={page} />;
  else if (tool === "walls" && gm) body = <WallOptions page={page} />;
  if (!body) return null;
  return <div className="tool-options" onPointerDown={(e) => e.stopPropagation()}>{body}</div>;
}

