// Estúdio de mapas procedurais (estilo Watabou): escolha o tipo, ajuste, gere, exporte ou mande para a mesa.
// Mundo interligado: os círculos dourados do mapa (povoados, ruínas, castelo…) abrem o lugar no gerador certo.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { WorldLink } from "../../shared/types.ts";
import { Icon } from "../ui/Icon.tsx";
import type { Dungeon } from "./dungeon.ts";
import { useDungeonEditor, type EditorLayer } from "./DungeonEditor.tsx";
import { randomSeed } from "./rng.ts";
import type { Built, GenKind } from "./types.ts";
import { KINDS, type KindDef } from "./kinds.ts";

export interface SendOptions { fog: boolean; light: boolean; marks: boolean; source: WorldLink }

type AllParams = Record<string, Record<string, unknown>>;
/** Parâmetros que dão nome ao lugar: vêm do mapa de cima e não ficam salvos. */
const NAME_KEYS = ["name", "title"];

function loadParams(): AllParams {
  try {
    return JSON.parse(localStorage.getItem("dm.gen.params") ?? "{}");
  } catch {
    return {};
  }
}

/** Os parâmetros do lugar (menos o nome) passam a ser os atuais daquele gerador. */
function withLink(all: AllParams, link: WorldLink | null | undefined): AllParams {
  if (!link) return all;
  const p = Object.fromEntries(Object.entries(link.params).filter(([k]) => !NAME_KEYS.includes(k)));
  return { ...all, [link.kind]: { ...(all[link.kind] ?? {}), ...p } };
}

export function GeneratorStudio({ onClose, onSend, initial, preset, from }: {
  onClose: () => void;
  onSend?: (b: Built, o: SendOptions) => Promise<void>;
  initial?: GenKind | null;
  preset?: WorldLink | null;
  from?: WorldLink | null;  // mapa de onde o marcador foi aberto (primeira migalha)
}) {
  const [kindId, setKindId] = useState<GenKind>(preset?.kind ?? initial ?? (localStorage.getItem("dm.gen.kind") as GenKind) ?? "dungeon");
  const kind: KindDef = KINDS.find((k) => k.id === kindId) ?? KINDS[0];
  const [allParams, setAllParams] = useState(() => withLink(loadParams(), preset));
  const params = { ...kind.defaults, ...(allParams[kind.id] ?? {}) };
  const [seed, setSeed] = useState(() => preset?.seed ?? randomSeed());
  const [place, setPlace] = useState<WorldLink | null>(preset ?? null); // lugar aberto por um marcador
  const [trail, setTrail] = useState<WorldLink[]>(() => (from ? [from] : [])); // caminho até aqui: região › cidade › …
  const [gmPreview, setGmPreview] = useState(true);
  const [fog, setFog] = useState(true);
  const [light, setLight] = useState(false);
  const [marks, setMarks] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.setItem("dm.gen.kind", kind.id);
    localStorage.setItem("dm.gen.params", JSON.stringify(allParams));
  }, [kind.id, allParams]);

  // o nome vale enquanto for o mesmo lugar (mesmo gerador e semente)
  const naming = place && place.kind === kind.id && place.seed === seed
    ? Object.fromEntries(Object.entries(place.params).filter(([k]) => NAME_KEYS.includes(k)))
    : {};

  const genKey = `${kind.id}:${seed}:${JSON.stringify(params)}:${JSON.stringify(naming)}`;
  const generated = useMemo<Built | null>(() => {
    try {
      setError("");
      return kind.build({ ...params, ...naming, seed });
    } catch (e) {
      console.error(e);
      setError(String((e as Error).message ?? e));
      return null;
    }
  }, [genKey]);

  // Edição à mão (masmorra): pilha de versões do mapa gerado; vale enquanto for o mesmo mapa
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<{ key: string; stack: Dungeon[] } | null>(null);
  const stack = edits?.key === genKey ? edits.stack : [];
  const edited = stack[stack.length - 1] ?? null;
  const built = useMemo(() => (edited && generated?.editable ? generated.editable.rebuild(edited) : generated), [generated, edited]);
  const editor = useDungeonEditor(
    editing && generated?.editable ? edited ?? generated.editable.dungeon : null,
    (next) => setEdits({ key: genKey, stack: [...stack.slice(-49), next] }),
    stack.length ? () => setEdits({ key: genKey, stack: stack.slice(0, -1) }) : null,
    () => setEdits(null),
  );
  /** Gerar outro / mudar parâmetros descarta as edições: confirma antes. */
  const guard = (fn: () => void) => {
    if (edited && !confirm("Gerar de novo descarta as edições deste mapa. Continuar?")) return;
    fn();
  };

  const here = (): WorldLink => ({ kind: kind.id, seed, params: { ...params, ...naming }, label: built?.title ?? kind.label });
  const go = (link: WorldLink, nextTrail: WorldLink[]) => {
    setTrail(nextTrail);
    setPlace(link);
    setAllParams((all) => withLink(all, link));
    setKindId(link.kind);
    setSeed(link.seed);
  };

  const setParam = (key: string, value: unknown) =>
    guard(() => setAllParams((all) => ({ ...all, [kind.id]: { ...(all[kind.id] ?? {}), [key]: value } })));

  const download = async () => {
    if (!built) return;
    setBusy("Gerando PNG…");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const cell = Math.min(70, Math.floor(8000 / Math.max(built.cols, built.rows)));
      const cv = built.render(cell, gmPreview);
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
      if (!blob) throw new Error("falha ao gerar imagem");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${built.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setBusy("");
    }
  };

  const send = async () => {
    if (!built || !onSend) return;
    setBusy("Enviando para a mesa…");
    try {
      await onSend(built, { fog, light, marks, source: here() });
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="studio">
      <div className="studio-side">
        <div className="side-head">
          <Icon name="wand" />
          <h3>Gerador de mapas</h3>
          <button className="icon-btn small" onClick={onClose} title="Fechar"><Icon name="x" size={16} /></button>
        </div>
        <div className="side-scroll">
          {trail.length > 0 && (
            <div className="crumbs">
              {trail.map((l, i) => (
                <Fragment key={i}>
                  <button onClick={() => go(l, trail.slice(0, i))}>{l.label}</button>
                  <span>›</span>
                </Fragment>
              ))}
              <b>{built?.title ?? kind.label}</b>
            </div>
          )}
          <div className="gen-tabs">
            {KINDS.map((k) => (
              <button key={k.id} className={`gen-tab ${k.id === kind.id ? "on" : ""}`} onClick={() => setKindId(k.id)}>
                <Icon name={k.icon} size={18} />
                <b>{k.label}</b>
                <span className="small muted">{k.desc}</span>
              </button>
            ))}
          </div>
          <div className="sep" />
          <label className="field">
            <span>Semente</span>
            <div className="row">
              <input className="input mono" value={seed} onChange={(e) => guard(() => setSeed(e.target.value))} />
              <button className="icon-btn" title="Nova semente" onClick={() => guard(() => setSeed(randomSeed()))}><Icon name="refresh" /></button>
            </div>
          </label>
          {kind.params.map((pd) => {
            const v = params[pd.key];
            if (pd.type === "check") {
              return (
                <label key={pd.key} className="check">
                  <input type="checkbox" checked={!!v} onChange={(e) => setParam(pd.key, e.target.checked)} /> {pd.label}
                </label>
              );
            }
            if (pd.type === "range") {
              return (
                <label key={pd.key} className="field">
                  <span>{pd.label}: {String(v)}</span>
                  <input type="range" min={pd.min} max={pd.max} step={pd.step ?? 1} value={Number(v)} onChange={(e) => setParam(pd.key, Number(e.target.value))} />
                </label>
              );
            }
            return (
              <label key={pd.key} className="field">
                <span>{pd.label}</span>
                <select className="input" value={String(v)} onChange={(e) => setParam(pd.key, e.target.value)}>
                  {pd.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </label>
            );
          })}
          <button className="btn primary" onClick={() => guard(() => setSeed(randomSeed()))}><Icon name="sparkles" size={16} /> Gerar outro</button>
          {generated?.editable && (
            <>
              <div className="sep" />
              <label className="check">
                <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} /> <b>Editar mapa</b>
                {edited && <span className="small muted">({stack.length} {stack.length === 1 ? "edição" : "edições"})</span>}
              </label>
              {editor.panel}
            </>
          )}
          <div className="sep" />
          <label className="check small"><input type="checkbox" checked={gmPreview} onChange={(e) => setGmPreview(e.target.checked)} /> Mostrar números e segredos</label>
          <button className="btn" onClick={download} disabled={!built || !!busy}><Icon name="download" size={16} /> Baixar PNG</button>
          {onSend && (
            <>
              <div className="sep" />
              {kind.battlemap && (
                <label className="check small"><input type="checkbox" checked={fog} onChange={(e) => setFog(e.target.checked)} /> Começar coberto pela névoa</label>
              )}
              {kind.battlemap && (
                <label className="check small" title="Paredes e portas já vêm prontas; jogadores veem só o que os tokens deles enxergam">
                  <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} /> Iluminação dinâmica (paredes e portas)
                </label>
              )}
              {!!built?.links?.length && (
                <label className="check small" title="Desmarque para colocar os locais à mão (botão direito no mapa → Adicionar local)">
                  <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /> Criar locais automáticos (marcadores dourados)
                </label>
              )}
              <button className="btn primary" onClick={send} disabled={!built || !!busy}><Icon name="send" size={16} /> Enviar para a mesa</button>
              <span className="small muted">Cria uma página nova. {kind.battlemap ? "Números, armadilhas e portas secretas vão para a camada do mestre; a descrição vira um texto só seu." : ""}</span>
            </>
          )}
          {busy && <span className="small muted">{busy}</span>}
          {error && <span className="error-text">{error}</span>}
        </div>
      </div>
      <Preview built={built} gm={gmPreview} fitKey={genKey} editor={editor.layer} onOpen={(l) => go(l, [...trail, here()])} />
      <div className="studio-notes">
        {built?.links?.length ? <p className="small muted" style={{ fontFamily: "system-ui", marginTop: 0 }}>Clique nos círculos dourados do mapa para abrir o lugar.</p> : null}
        {built ? <Notes built={built} /> : null}
      </div>
    </div>
  );
}

function Notes({ built }: { built: Built }) {
  const [title, ...rest] = (built.notes ?? built.title).split("\n");
  return (
    <>
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>{title}</h2>
      {rest.map((line, i) =>
        line.trim() === "" ? <div key={i} style={{ height: 8 }} /> : (
          <p key={i} style={{ margin: "0 0 8px", lineHeight: 1.45, fontStyle: i === 1 ? "italic" : undefined }}>
            {/^\d+\./.test(line) ? <><b>{line.split(".")[0]}.</b>{line.slice(line.indexOf(".") + 1)}</> : line}
          </p>
        ),
      )}
      <p className="small muted" style={{ fontFamily: "system-ui" }}>{built.cols} × {built.rows} células · 1 célula = {built.scale.value} {built.scale.unit}</p>
    </>
  );
}

function Preview({ built, gm, fitKey, editor, onOpen }: {
  built: Built | null; gm: boolean; fitKey: string; editor: EditorLayer | null; onOpen: (l: WorldLink) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [cell, setCell] = useState(0);
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const editing = useRef(false); // o arrasto atual é do editor (não move a vista)
  const fitted = useRef("");

  useEffect(() => {
    const el = host.current;
    if (!el || !built) return;
    const cell = Math.max(6, Math.min(48, Math.floor(2600 / Math.max(built.cols, built.rows))));
    const cv = built.render(cell, gm);
    setCell(cell);
    cvRef.current?.remove();
    el.prepend(cv);
    cvRef.current = cv;
    // editar a masmorra redesenha o mapa sem mexer no zoom (só reenquadra num mapa novo ou de outro tamanho)
    const key = `${fitKey}:${cv.width}x${cv.height}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const r = el.getBoundingClientRect();
    const z = Math.min((r.width - 40) / cv.width, (r.height - 40) / cv.height, 2);
    setView({ z, x: (r.width - cv.width * z) / 2, y: (r.height - cv.height * z) / 2 });
  }, [built, gm]);

  const toCell = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / (view.z * cell), y: (e.clientY - r.top - view.y) / (view.z * cell) };
  };

  useEffect(() => {
    const cv = cvRef.current;
    if (cv) cv.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  }, [view, built, gm]);

  useEffect(() => {
    const el = host.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setView((v) => {
        const z = Math.min(8, Math.max(0.05, v.z * Math.exp(-e.deltaY * 0.0015)));
        return { z, x: sx - ((sx - v.x) / v.z) * z, y: sy - ((sy - v.y) / v.z) * z };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      className="studio-view"
      ref={host}
      style={editor ? { cursor: editor.cursor } : undefined}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        if (editor && e.button === 0 && cell && editor.down(toCell(e))) {
          editing.current = true;
          return;
        }
        drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      }}
      onPointerMove={(e) => {
        if (editing.current) return editor?.move(toCell(e));
        const d = drag.current;
        if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
      }}
      onPointerUp={(e) => {
        if (editing.current) editor?.up(toCell(e));
        editing.current = false;
        drag.current = null;
      }}
    >
      {editor && built && cell > 0 && (
        <svg
          className="gen-overlay" width={built.cols * cell} height={built.rows * cell}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          {editor.overlay(cell)}
        </svg>
      )}
      {cell > 0 && built?.links?.map((l, i) => (
        <button
          key={i}
          className="gen-link"
          title={`Abrir ${l.link.label}`}
          style={{ left: view.x + l.x * cell * view.z, top: view.y + l.y * cell * view.z }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpen(l.link)}
        />
      ))}
    </div>
  );
}
