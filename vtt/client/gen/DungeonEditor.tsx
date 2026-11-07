// Editor da masmorra no estúdio: selecionar/mover/redimensionar salas, desenhar salas novas e pôr portas.
// O painel fica na lateral do estúdio; a camada (contorno, alças, prévia do arrasto) fica por cima do mapa.
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../ui/Icon.tsx";
import type { DoorType, Dungeon } from "./dungeon.ts";
import {
  DOOR_TYPES, addArea, areaAt, canPlace, canResize, doorIndex, edgeAt, edgeBetweenAreas, growMap, moveArea, removeArea,
  resizeArea, setAreaText, setDoor, type Box, type Edge,
} from "./dungeonEdit.ts";

type Pt = { x: number; y: number };
type Tool = "select" | "room" | "door";
type Sel = { kind: "area"; id: number } | { kind: "door"; edge: Edge } | null;
type Drag = { mode: "move" | "resize" | "draw"; start: Pt; cur: Pt } | null;

/** O que o Preview do estúdio precisa para desenhar e repassar o mouse (coordenadas em células). */
export interface EditorLayer {
  cursor: string;
  overlay(cell: number): ReactNode;
  down(p: Pt): boolean;
  move(p: Pt): void;
  up(p: Pt): void;
}

const COLOR = Object.fromEntries(DOOR_TYPES.map((t) => [t.id, t.color])) as Record<DoorType, string>;

/** d = null: não está editando (o hook continua sendo chamado, só não devolve nada). */
export function useDungeonEditor(d: Dungeon | null, commit: (next: Dungeon) => void, undo: (() => void) | null, discard: () => void): {
  panel: ReactNode;
  layer: EditorLayer | null;
} {
  const [tool, setTool] = useState<Tool>("select");
  const [doorType, setDoorType] = useState<DoorType>("door");
  const [sel, setSel] = useState<Sel>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [msg, setMsg] = useState("");

  const area = d && sel?.kind === "area" ? d.areas[sel.id] : undefined;
  const door = d && sel?.kind === "door" ? d.doors[doorIndex(d, sel.edge)] : undefined;
  const fail = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };
  const doUndo = undo && (() => {
    undo();
    setSel(null);
  });

  const remove = () => {
    if (!d) return;
    if (area) {
      commit(removeArea(d, area.id));
      setSel(null);
    } else if (door && sel?.kind === "door") {
      commit(setDoor(d, sel.edge, null)!);
      setSel(null);
    }
  };

  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "Delete" || e.key === "Backspace") remove();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && doUndo) {
        e.preventDefault();
        doUndo();
      } else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!d) return { panel: null, layer: null };

  const box = (dr: NonNullable<Drag>): Box | null => {
    if (dr.mode === "draw") {
      const x0 = Math.floor(Math.min(dr.start.x, dr.cur.x));
      const y0 = Math.floor(Math.min(dr.start.y, dr.cur.y));
      return { x: x0, y: y0, w: Math.floor(Math.max(dr.start.x, dr.cur.x)) - x0 + 1, h: Math.floor(Math.max(dr.start.y, dr.cur.y)) - y0 + 1 };
    }
    if (!area) return null;
    if (dr.mode === "move") return { ...area, x: area.x + Math.round(dr.cur.x - dr.start.x), y: area.y + Math.round(dr.cur.y - dr.start.y) };
    return { x: area.x, y: area.y, w: Math.max(1, Math.round(dr.cur.x) - area.x), h: Math.max(1, Math.round(dr.cur.y) - area.y) };
  };

  const layer: EditorLayer = {
    cursor: tool === "select" ? "default" : "crosshair",
    down(p) {
      if (tool === "room") {
        setDrag({ mode: "draw", start: p, cur: p });
        return true;
      }
      const e = edgeAt(p.x, p.y, tool === "door" ? 0.35 : 0.2);
      if (e && doorIndex(d, e) >= 0) {
        setSel({ kind: "door", edge: e });
        return true;
      }
      if (tool === "door") {
        if (e && edgeBetweenAreas(d, e)) {
          commit(setDoor(d, e, doorType)!);
          setSel({ kind: "door", edge: e });
        } else fail("Clique numa parede entre duas salas (ou sala e corredor).");
        return true;
      }
      if (area && canResize(d, area.id) && Math.abs(p.x - (area.x + area.w)) < 0.45 && Math.abs(p.y - (area.y + area.h)) < 0.45) {
        setDrag({ mode: "resize", start: p, cur: p });
        return true;
      }
      const id = areaAt(d, p.x, p.y);
      if (id < 0) {
        setSel(null);
        return false;
      }
      setSel({ kind: "area", id });
      setDrag({ mode: "move", start: p, cur: p });
      return true;
    },
    move(p) {
      if (drag) setDrag({ ...drag, cur: p });
    },
    up() {
      if (!drag) return;
      const b = box(drag);
      setDrag(null);
      if (!b) return;
      if (drag.mode === "draw") {
        if (b.w * b.h < 2) return;
        const r = addArea(d, b);
        if (!r) return fail("A sala nova não pode cobrir outra área nem sair do mapa.");
        commit(r.d);
        setSel({ kind: "area", id: r.id });
        setTool("select");
      } else if (area && (b.x !== area.x || b.y !== area.y || b.w !== area.w || b.h !== area.h)) {
        const next = drag.mode === "move" ? moveArea(d, area.id, b.x - area.x, b.y - area.y) : resizeArea(d, area.id, b);
        if (next) commit(next);
        else fail("Não cabe aí: encostaria em outra área ou sairia do mapa.");
      }
    },
    overlay(c) {
      const ghost = drag ? box(drag) : null;
      const ok = ghost && (drag!.mode === "draw" ? canPlace(d, ghost) : canPlace(d, ghost, area?.id));
      return (
        <>
          {d.doors.map((dr, i) => {
            const cx = (dr.horiz ? dr.x + 0.5 : dr.x) * c;
            const cy = (dr.horiz ? dr.y : dr.y + 0.5) * c;
            const on = door === dr;
            return <rect key={i} x={cx - c * 0.22} y={cy - c * 0.22} width={c * 0.44} height={c * 0.44} rx={c * 0.1} fill={COLOR[dr.type]} stroke={on ? "#fff" : "#0008"} strokeWidth={on ? 3 : 1} />;
          })}
          {area && (
            <>
              <rect x={area.x * c} y={area.y * c} width={area.w * c} height={area.h * c} fill="rgba(212,167,58,0.12)" stroke="#d4a73a" strokeWidth={2} strokeDasharray="6 4" />
              {canResize(d, area.id) && <rect x={(area.x + area.w) * c - 7} y={(area.y + area.h) * c - 7} width={14} height={14} fill="#d4a73a" stroke="#000" />}
            </>
          )}
          {ghost && (
            <rect
              x={ghost.x * c} y={ghost.y * c} width={ghost.w * c} height={ghost.h * c}
              fill={ok ? "rgba(61,214,140,0.18)" : "rgba(229,72,77,0.22)"} stroke={ok ? "#3dd68c" : "#e5484d"} strokeWidth={2}
            />
          )}
        </>
      );
    },
  };

  const typePicker = (value: DoorType | undefined, pick: (t: DoorType) => void) => (
    <div className="door-types">
      {DOOR_TYPES.map((t) => (
        <button key={t.id} className={`door-type ${value === t.id ? "on" : ""}`} onClick={() => pick(t.id)}>
          <i style={{ background: t.color }} />{t.label}
        </button>
      ))}
    </div>
  );

  const panel = (
    <div className="col" style={{ gap: 8 }}>
      <div className="seg small">
        {([["select", "Mover"], ["room", "Nova sala"], ["door", "Porta"]] as [Tool, string][]).map(([t, label]) => (
          <button key={t} className={tool === t ? "on" : ""} onClick={() => setTool(t)}>{label}</button>
        ))}
      </div>
      <span className="small muted">
        {tool === "select" && "Clique numa sala para selecionar; arraste para mover; a alça dourada no canto muda o tamanho. Delete exclui."}
        {tool === "room" && "Arraste no espaço vazio para desenhar a sala. Com 1 célula de largura vira corredor."}
        {tool === "door" && "Clique numa parede entre duas áreas para pôr a porta do tipo escolhido."}
      </span>
      {tool === "door" && !door && typePicker(doorType, setDoorType)}
      {door && sel?.kind === "door" && (
        <div className="col" style={{ gap: 6 }}>
          <b className="small">Porta selecionada</b>
          {typePicker(door.type, (t) => {
            setDoorType(t);
            commit(setDoor(d, sel.edge, t)!);
          })}
          <button className="btn small danger" onClick={remove}><Icon name="trash" size={13} /> Remover porta</button>
        </div>
      )}
      {area && <AreaPanel key={area.id} d={d} id={area.id} commit={commit} onRemove={remove} />}
      {msg && <span className="error-text">{msg}</span>}
      <div className="row wrap">
        <button className="btn small" disabled={!doUndo} onClick={() => doUndo?.()} title="Ctrl+Z"><Icon name="undo" size={13} /> Desfazer</button>
        <button className="btn small" onClick={() => commit(growMap(d, 2))} title="Mais espaço em volta para salas novas">Ampliar mapa</button>
        <button className="btn small ghost" onClick={() => confirm("Descartar todas as edições deste mapa?") && discard()}>Descartar edições</button>
      </div>
    </div>
  );

  return { panel, layer };
}

function AreaPanel({ d, id, commit, onRemove }: { d: Dungeon; id: number; commit: (n: Dungeon) => void; onRemove: () => void }) {
  const a = d.areas[id];
  const [name, setName] = useState(a.name);
  const [text, setText] = useState(a.text);
  const save = () => (name !== a.name || text !== a.text) && commit(setAreaText(d, id, { name, text }));
  return (
    <div className="col" style={{ gap: 6 }}>
      <b className="small">{a.kind === "room" ? `Sala ${a.num}` : "Corredor"} · {a.w}×{a.h}</b>
      {a.kind === "room" && (
        <>
          <input className="input" value={name} placeholder="Nome da sala" onChange={(e) => setName(e.target.value)} onBlur={save} />
          <textarea className="input" rows={3} value={text} placeholder="Descrição (vai para as notas do mestre)" onChange={(e) => setText(e.target.value)} onBlur={save} />
          <label className="check small"><input type="checkbox" checked={a.trap} onChange={(e) => commit(setAreaText(d, id, { trap: e.target.checked }))} /> Armadilha (! na camada do mestre)</label>
        </>
      )}
      <button className="btn small danger" onClick={onRemove}><Icon name="trash" size={13} /> Excluir {a.kind === "room" ? "sala" : "corredor"}</button>
    </div>
  );
}
