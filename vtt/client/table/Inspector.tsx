// Propriedades do que está selecionado: tokens (vida, condições, aura, visão, luz),
// desenhos, moldes, cartas e imagens.
import { useMemo, useRef, useState } from "react";
import type { Graphic, Layer } from "../../shared/types.ts";
import { DRAWING_KINDS } from "../../shared/types.ts";
import { game, send, useColl } from "../game.ts";
import { EditField } from "../ui/EditField.tsx";
import { Icon } from "../ui/Icon.tsx";
import { cropAndUpload } from "../ui/ImageCrop.tsx";
import { CONDITIONS } from "./conditions.ts";
import { act } from "./history.ts";
import { LIGHT_PRESETS } from "./ToolOptions.tsx";
import { canControl, openSheet, ui, useViewPage } from "./ui.ts";

function Conditions({ g, up }: { g: Graphic; up: (p: Record<string, unknown>) => void }) {
  const markers = g.markers ?? [];
  const toggle = (id: string) => up({ markers: markers.includes(id) ? markers.filter((m) => m !== id) : [...markers, id] });
  return (
    <div className="col" style={{ gap: 4 }}>
      <h4>Condições</h4>
      <div className="conditions">
        {CONDITIONS.map((c) => (
          <button key={c.id} className={`cond ${markers.includes(c.id) ? "on" : ""}`} title={`${c.label}${c.desc ? `\n\n${c.desc}` : ""}`} onClick={() => toggle(c.id)}>
            <span>{c.icon}</span>
          </button>
        ))}
      </div>
      {markers.length > 0 && <span className="small muted">{markers.map((m) => CONDITIONS.find((c) => c.id === m)?.label ?? m).join(", ")}</span>}
    </div>
  );
}

/** Botão de trocar a imagem do token (jogador: só nos tokens dele). */
function TokenImage({ g, up }: { g: Graphic; up: (p: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn small" onClick={() => ref.current?.click()}><Icon name="image" size={14} /> Trocar imagem</button>
      <input
        ref={ref} type="file" accept="image/*" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          const url = f && (await cropAndUpload(f, { aspect: g.w / g.h, size: 512 }));
          if (url) up({ src: url });
        }}
      />
    </>
  );
}

function AuraAndLight({ g, up, gm, unit }: { g: Graphic; up: (p: Record<string, unknown>) => void; gm: boolean; unit: string }) {
  const [open, setOpen] = useState(false);
  const lightId = g.light ? LIGHT_PRESETS.find((p) => p.bright === g.light!.bright && p.dim === g.light!.dim)?.id ?? "custom" : "";
  return (
    <div className="col" style={{ gap: 6 }}>
      <button className="btn small ghost" style={{ justifyContent: "flex-start" }} onClick={() => setOpen(!open)}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} /> Aura, luz{gm ? " e visão" : ""}
      </button>
      {open && (
        <>
          <div className="row">
            <span className="small muted" style={{ width: 52 }}>Aura</span>
            <EditField type="number" value={g.aura?.radius ?? 0} title={`Raio (${unit})`} onCommit={(v) => up({ aura: Number(v) > 0 ? { radius: Number(v), color: g.aura?.color ?? "#3498db" } : null })} />
            <input type="color" value={g.aura?.color ?? "#3498db"} onChange={(e) => up({ aura: { radius: g.aura?.radius || 1.5, color: e.target.value } })} />
          </div>
          <div className="row">
            <span className="small muted" style={{ width: 52 }}>Luz</span>
            <select
              className="input small"
              value={lightId}
              onChange={(e) => {
                const p = LIGHT_PRESETS.find((x) => x.id === e.target.value);
                up({ light: p ? { bright: p.bright, dim: p.dim, color: p.color } : null });
              }}
            >
              <option value="">Nenhuma</option>
              {LIGHT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              {lightId === "custom" && <option value="custom">Personalizada</option>}
            </select>
          </div>
          {g.light && (
            <div className="row">
              <EditField type="number" value={g.light.bright} title={`Luz forte (${unit})`} onCommit={(v) => up({ "light.bright": Number(v) || 0 })} />
              <EditField type="number" value={g.light.dim} title={`Penumbra (${unit})`} onCommit={(v) => up({ "light.dim": Number(v) || 0 })} />
              <input type="color" value={g.light.color || "#ffffff"} onChange={(e) => up({ "light.color": e.target.value })} />
            </div>
          )}
          {gm && (
            <>
              <label className="check small">
                <input type="checkbox" checked={!!g.vision?.on} onChange={(e) => up({ vision: e.target.checked ? { on: true, range: g.vision?.range ?? 0, dark: g.vision?.dark ?? 0 } : null })} />
                Tem visão (iluminação dinâmica)
              </label>
              {g.vision?.on && (
                <div className="row">
                  <label className="field grow"><span>Alcance ({unit}, 0 = ∞)</span>
                    <EditField type="number" value={g.vision.range} onCommit={(v) => up({ "vision.range": Math.max(0, Number(v) || 0) })} />
                  </label>
                  <label className="field grow"><span>No escuro ({unit})</span>
                    <EditField type="number" value={g.vision.dark} onCommit={(v) => up({ "vision.dark": Math.max(0, Number(v) || 0) })} />
                  </label>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function Inspector() {
  const selected = ui.use((s) => s.selected);
  const graphics = useColl("graphics");
  const characters = useColl("characters");
  const players = useColl("players");
  const decks = useColl("decks");
  const role = game.use((s) => s.role);
  const page = useViewPage();
  const charList = useMemo(() => Object.values(characters).sort((a, b) => a.name.localeCompare(b.name)), [characters]);

  if (selected.length !== 1 || !page) return null;
  const g = graphics[selected[0]];
  if (!g) return null;
  const gm = role === "gm";
  if (!gm && !canControl(g.controlledBy)) return null;
  const gs = page.gridSize;
  const up = (patch: Record<string, unknown>) => act.update("graphics", g.id, patch);
  const ch = g.characterId ? characters[g.characterId] : undefined;
  const close = <button className="icon-btn small" title="Fechar" onClick={() => ui.set({ selected: [] })}><Icon name="x" size={15} /></button>;
  const del = (gm || DRAWING_KINDS.includes(g.kind)) && (
    <button className="icon-btn small" title="Excluir (Delete)" onClick={() => { act.remove("graphics", g.id); ui.set({ selected: [] }); }}><Icon name="trash" size={15} /></button>
  );

  // Cartas na mesa
  if (g.kind === "card") {
    const deck = g.card ? decks[g.card.deckId] : undefined;
    const card = deck?.cards.find((c) => c.id === g.card!.cardId);
    return (
      <div className="inspector" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row"><h4 className="grow">Carta · {deck?.name ?? "?"}</h4>{close}</div>
        <b>{card && (g.card!.faceUp || canControl(g.controlledBy)) ? card.name : "Virada para baixo"}</b>
        <div className="row wrap">
          <button className="btn small" onClick={() => send({ t: "deck", op: "flip", graphicId: g.id })}>{g.card?.faceUp ? "Virar para baixo" : "Revelar"}</button>
          <button className="btn small" onClick={() => send({ t: "deck", op: "take", graphicId: g.id })}>Pegar</button>
          <button className="btn small" onClick={() => send({ t: "deck", op: "discard", graphicId: g.id })}>Descartar</button>
        </div>
      </div>
    );
  }

  // Desenhos e moldes
  if (DRAWING_KINDS.includes(g.kind)) {
    const what = g.kind === "template" ? "Área" : g.kind === "text" ? "Texto" : "Desenho";
    return (
      <div className="inspector" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row"><h4 className="grow">{what}</h4>{del}{close}</div>
        {g.kind === "text" && <label className="field"><span>Texto</span><EditField value={g.text} onCommit={(v) => up({ text: v, ...(g.link ? { "link.label": v } : {}) })} /></label>}
        <div className="row">
          <span className="small muted">Cor</span>
          <input
            type="color"
            value={(g.kind === "path" || g.kind === "shape" ? g.stroke : g.color) ?? "#e74c3c"}
            onChange={(e) => up(g.kind === "path" || g.kind === "shape" ? { stroke: e.target.value, ...(g.fill ? { fill: e.target.value } : {}) } : { color: e.target.value })}
          />
          {(g.kind === "path" || g.kind === "shape") && (
            <>
              <input className="grow" type="range" min={1} max={20} value={g.strokeWidth ?? 4} onChange={(e) => up({ strokeWidth: Number(e.target.value) })} />
              <label className="check small"><input type="checkbox" checked={!!g.fill} onChange={(e) => up({ fill: e.target.checked ? g.stroke ?? "#e74c3c" : null })} /> Preencher</label>
            </>
          )}
        </div>
        {gm && (
          <label className="field">
            <span>Camada</span>
            <select className="input" value={g.layer} onChange={(e) => up({ layer: e.target.value as Layer })}>
              <option value="map">Mapa</option>
              <option value="tokens">Tokens</option>
              <option value="gm">Mestre (oculto)</option>
            </select>
          </label>
        )}
      </div>
    );
  }

  if (!gm) {
    return (
      <div className="inspector" onPointerDown={(e) => e.stopPropagation()}>
        <div className="row">
          <b className="grow">{g.name || "Token"}</b>
          {ch && <button className="btn small" onClick={() => openSheet(ch.id)}><Icon name="book" size={14} /> Ficha</button>}
          {close}
        </div>
        {g.bar && (
          <label className="field">
            <span>Vida</span>
            <div className="row">
              <EditField type="number" value={g.bar.value} onCommit={(v) => up({ "bar.value": Number(v) || 0 })} />
              <span className="muted">/ {g.bar.max}</span>
            </div>
          </label>
        )}
        {g.kind === "token" && <TokenImage g={g} up={up} />}
        <Conditions g={g} up={up} />
        <AuraAndLight g={g} up={up} gm={false} unit={page.unit} />
      </div>
    );
  }

  const togglePlayer = (id: string) => {
    const set = new Set(g.controlledBy);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    up({ controlledBy: [...set] });
  };

  return (
    <div className="inspector" onPointerDown={(e) => e.stopPropagation()}>
      <div className="row">
        <h4 className="grow">{g.kind === "token" ? "Token" : "Imagem"}</h4>
        {del}
        {close}
      </div>

      <label className="field">
        <span>Nome</span>
        <EditField value={g.name} onCommit={(v) => up({ name: v })} />
      </label>
      {g.kind === "token" && (
        <label className="check small"><input type="checkbox" checked={!!g.showName} onChange={(e) => up({ showName: e.target.checked })} /> Mostrar nome</label>
      )}

      <div className="row">
        <label className="field grow"><span>Largura (células)</span>
          <EditField type="number" value={+(g.w / gs).toFixed(2)} onCommit={(v) => up({ w: Math.max(0.25, Number(v) || 1) * gs })} />
        </label>
        <label className="field grow"><span>Altura</span>
          <EditField type="number" value={+(g.h / gs).toFixed(2)} onCommit={(v) => up({ h: Math.max(0.25, Number(v) || 1) * gs })} />
        </label>
      </div>

      <label className="field">
        <span>Camada</span>
        <select className="input" value={g.layer} onChange={(e) => up({ layer: e.target.value as Layer })}>
          <option value="map">Mapa</option>
          <option value="tokens">Tokens</option>
          <option value="gm">Mestre (oculto)</option>
        </select>
      </label>

      {g.kind === "token" && (
        <div className="row">
          <TokenImage g={g} up={up} />
          {!g.src && <label className="row small muted">Cor <input type="color" value={g.color ?? "#c0392b"} onChange={(e) => up({ color: e.target.value })} /></label>}
        </div>
      )}

      {g.kind === "token" && (
        <>
          <label className="field">
            <span>Ficha vinculada</span>
            <div className="row">
              <select
                className="input"
                value={g.characterId ?? ""}
                onChange={(e) => {
                  const c = characters[e.target.value];
                  if (!c) return up({ characterId: null });
                  up({ characterId: c.id, name: c.name, controlledBy: c.controlledBy, ...(c.avatar && !g.src ? { src: c.avatar } : {}) });
                }}
              >
                <option value="">— nenhuma —</option>
                {charList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {ch && <button className="icon-btn small" title="Abrir ficha" onClick={() => openSheet(ch.id)}><Icon name="book" size={15} /></button>}
            </div>
          </label>
          {ch && (
            <label className="check small" title="Ex.: vários goblins da mesma ficha, cada um com a própria vida">
              <input type="checkbox" checked={!!g.unlinked} onChange={(e) => up({ unlinked: e.target.checked })} /> Vida própria (não liga à ficha)
            </label>
          )}

          <div className="col">
            <span className="small muted">Quem controla</span>
            <div className="row wrap">
              <label className="check small"><input type="checkbox" checked={g.controlledBy.includes("all")} onChange={() => togglePlayer("all")} /> Todos</label>
              {Object.values(players).map((p) => (
                <label key={p.id} className="check small">
                  <input type="checkbox" checked={g.controlledBy.includes(p.id)} onChange={() => togglePlayer(p.id)} />
                  <span style={{ color: p.color }}>{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="col">
            <label className="check small">
              <input type="checkbox" checked={!!g.bar} onChange={(e) => up({ bar: e.target.checked ? { value: 10, max: 10 } : null })} /> Barra de vida
            </label>
            {g.bar && (
              <div className="row">
                <EditField type="number" value={g.bar.value} onCommit={(v) => up({ "bar.value": Number(v) || 0 })} />
                <span className="muted">/</span>
                <EditField type="number" value={g.bar.max} onCommit={(v) => up({ "bar.max": Number(v) || 0 })} />
              </div>
            )}
          </div>
          <Conditions g={g} up={up} />
          <AuraAndLight g={g} up={up} gm unit={page.unit} />
        </>
      )}
      <label className="check small"><input type="checkbox" checked={!!g.locked} onChange={(e) => up({ locked: e.target.checked })} /> Travado</label>
    </div>
  );
}
