// Configurações da página atual (grade, clima, luz, trilha da cena) e da campanha (mestre).
import { useMemo } from "react";
import type { Page, WeatherType } from "../../shared/types.ts";
import { api, serverNow, useColl } from "../game.ts";
import { EditField } from "../ui/EditField.tsx";
import { WEATHER_LABELS } from "./board/weather.ts";
import { act } from "./history.ts";
import { useViewPage } from "./ui.ts";

export function PagePanel() {
  const page = useViewPage();
  const settings = useColl("settings").main;
  const tracks = useColl("tracks");
  const music = useMemo(() => Object.values(tracks).filter((t) => t.kind === "music").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [tracks]);
  if (!page || !settings) return <div className="empty">Nenhuma página.</div>;
  const up = (patch: Partial<Page> | Record<string, unknown>) => act.update("pages", page.id, patch as Record<string, unknown>);
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const light = page.light ?? { on: false, global: false, explore: true };
  const weather = page.weather ?? { type: "none" as WeatherType, intensity: 0.5 };
  const scene = new Set(page.music ?? []);
  const playScene = () => {
    const now = serverNow();
    for (const t of music) {
      if (scene.has(t.id)) {
        if (!t.playing) api.update("tracks", t.id, { playing: true, startedAt: now, pausedAt: 0 });
      } else if (page.musicReplace !== false && t.playing) api.update("tracks", t.id, { playing: false, pausedAt: 0 });
    }
  };

  return (
    <div className="side-scroll">
      <h4 className="section-title" style={{ margin: "0 0 4px" }}>Página</h4>
      <label className="field"><span>Nome</span><EditField value={page.name} onCommit={(v) => up({ name: v || "Página" })} /></label>
      <div className="row">
        <label className="field grow"><span>Colunas</span>
          <EditField type="number" value={page.cols} onCommit={(v) => up({ cols: Math.round(num(v, 1, 300, page.cols)), fog: "" })} />
        </label>
        <label className="field grow"><span>Linhas</span>
          <EditField type="number" value={page.rows} onCommit={(v) => up({ rows: Math.round(num(v, 1, 300, page.rows)), fog: "" })} />
        </label>
      </div>
      <span className="small muted">
        Tamanho: {(page.cols * page.scale).toLocaleString("pt-BR")} × {(page.rows * page.scale).toLocaleString("pt-BR")} {page.unit} (máx. 300 × 300 células)
      </span>
      <div className="row">
        <label className="field grow"><span>Tamanho da célula (px)</span>
          <EditField type="number" value={page.gridSize} onCommit={(v) => up({ gridSize: Math.round(num(v, 10, 400, page.gridSize)) })} />
        </label>
        <label className="field grow"><span>Fundo</span>
          <input type="color" value={page.bg} onChange={(e) => up({ bg: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <label className="field grow"><span>Cada célula vale</span>
          <EditField type="number" value={page.scale} onCommit={(v) => up({ scale: num(v, 0.01, 10000, page.scale) })} />
        </label>
        <label className="field grow"><span>Unidade</span>
          <EditField value={page.unit} onCommit={(v) => up({ unit: v || "m" })} />
        </label>
      </div>
      <label className="check"><input type="checkbox" checked={page.grid === "square"} onChange={(e) => up({ grid: e.target.checked ? "square" : "none" })} /> Mostrar grade</label>
      {page.grid === "square" && (
        <div className="row">
          <input type="color" value={page.gridColor} onChange={(e) => up({ gridColor: e.target.value })} />
          <input className="grow" type="range" min={0} max={1} step={0.05} value={page.gridOpacity} onChange={(e) => up({ gridOpacity: Number(e.target.value) })} />
        </div>
      )}
      <label className="check"><input type="checkbox" checked={page.fogOn} onChange={(e) => up({ fogOn: e.target.checked })} /> Névoa de guerra</label>

      <h4 className="section-title">Iluminação</h4>
      <label className="check"><input type="checkbox" checked={light.on} onChange={(e) => up({ light: { ...light, on: e.target.checked } })} /> Iluminação dinâmica</label>
      {light.on && (
        <>
          <label className="check"><input type="checkbox" checked={light.global} onChange={(e) => up({ light: { ...light, global: e.target.checked } })} /> Luz do dia (tudo aceso)</label>
          <label className="check"><input type="checkbox" checked={light.explore} onChange={(e) => up({ light: { ...light, explore: e.target.checked } })} /> Lembrar áreas exploradas</label>
          <span className="small muted">Paredes e portas: ferramenta de porta na barra da esquerda (W).</span>
        </>
      )}

      <h4 className="section-title">Clima</h4>
      <select className="input" value={weather.type} onChange={(e) => up({ weather: { ...weather, type: e.target.value as WeatherType } })}>
        {(Object.keys(WEATHER_LABELS) as WeatherType[]).map((k) => <option key={k} value={k}>{WEATHER_LABELS[k]}</option>)}
      </select>
      {weather.type !== "none" && (
        <label className="row small muted">
          Intensidade
          <input className="grow" type="range" min={0.1} max={1} step={0.05} value={weather.intensity} onChange={(e) => up({ weather: { ...weather, intensity: Number(e.target.value) } })} />
        </label>
      )}

      <h4 className="section-title">Trilha da cena</h4>
      {music.length === 0 ? (
        <span className="small muted">Envie músicas na aba de música para montar a trilha.</span>
      ) : (
        <>
          <span className="small muted">Toca sozinha quando você leva os jogadores para esta página.</span>
          <div className="list">
            {music.map((t) => (
              <label key={t.id} className="check small">
                <input
                  type="checkbox"
                  checked={scene.has(t.id)}
                  onChange={(e) => up({ music: e.target.checked ? [...scene, t.id] : [...scene].filter((x) => x !== t.id) })}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              </label>
            ))}
          </div>
          <label className="check small">
            <input type="checkbox" checked={page.musicReplace !== false} onChange={(e) => up({ musicReplace: e.target.checked })} /> Parar as outras músicas
          </label>
          {scene.size > 0 && <button className="btn small" onClick={playScene}>Tocar a trilha agora</button>}
        </>
      )}

      <h4 className="section-title">Campanha</h4>
      <label className="field"><span>Nome da campanha</span>
        <EditField value={settings.name} onCommit={(v) => api.update("settings", "main", { name: v || "Campanha" })} />
      </label>
      <label className="field">
        <span>Diagonais na régua</span>
        <select className="input" value={settings.diagonal} onChange={(e) => api.update("settings", "main", { diagonal: e.target.value })}>
          <option value="dnd">D&amp;D 5e (toda diagonal = 1)</option>
          <option value="alt">Alternada (1-2-1, Pathfinder)</option>
          <option value="euclid">Distância real</option>
        </select>
      </label>
    </div>
  );
}
