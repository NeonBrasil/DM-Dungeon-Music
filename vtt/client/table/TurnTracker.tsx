// Ordem de iniciativa (o mestre edita; todos veem).
import type { Settings, TurnEntry } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { api, game, useColl } from "../game.ts";
import { EditField } from "../ui/EditField.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Window } from "../ui/Window.tsx";
import { ui } from "./ui.ts";

export function TurnTracker() {
  const show = ui.use((s) => s.showTurns);
  const settings = useColl("settings").main;
  const role = game.use((s) => s.role);
  if (!show || !settings) return null;
  const gm = role === "gm";
  const t = settings.turns;
  const set = (patch: Partial<Settings["turns"]>) => api.update("settings", "main", { turns: { ...t, ...patch } });
  const entries = t.entries;

  const next = (dir: 1 | -1) => {
    if (!entries.length) return;
    let current = t.current + dir;
    let round = t.round;
    if (current >= entries.length) {
      current = 0;
      round++;
    } else if (current < 0) {
      current = entries.length - 1;
      round = Math.max(1, round - 1);
    }
    set({ current, round });
  };
  const sort = () => {
    const curId = entries[t.current]?.id;
    const sorted = [...entries].sort((a, b) => b.value - a.value);
    set({ entries: sorted, current: Math.max(0, sorted.findIndex((e) => e.id === curId)) });
  };
  const add = () => {
    const name = prompt("Nome");
    if (name?.trim()) set({ entries: [...entries, { id: newId(), name: name.trim(), value: 0 }] });
  };
  const edit = (id: string, patch: Partial<TurnEntry>) => set({ entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const del = (id: string) => {
    const idx = entries.findIndex((e) => e.id === id);
    set({ entries: entries.filter((e) => e.id !== id), current: idx < t.current ? t.current - 1 : Math.min(t.current, entries.length - 2) });
  };

  return (
    <Window
      title={`Iniciativa · Rodada ${t.round}`}
      className="turn-window"
      onClose={() => ui.set({ showTurns: false })}
      width={300}
      height={380}
      actions={gm && (
        <>
          <button className="icon-btn small" title="Ordenar" onClick={sort}><Icon name="arrowDown" size={15} /></button>
          <button className="icon-btn small" title="Adicionar" onClick={add}><Icon name="plus" size={15} /></button>
        </>
      )}
    >
      <div className="turns">
        {entries.length === 0 && (
          <div className="empty">{gm ? "Clique direito num token → Adicionar à iniciativa." : "Sem combate no momento."}</div>
        )}
        {entries.map((e, i) => (
          <div key={e.id} className={`turn ${i === t.current ? "current" : ""}`}>
            {gm ? (
              <>
                <EditField className="input value" type="number" value={e.value} onCommit={(v) => edit(e.id, { value: Number(v) || 0 })} />
                <EditField value={e.name} onCommit={(v) => edit(e.id, { name: v })} />
                <button className="icon-btn small" onClick={() => del(e.id)} title="Remover"><Icon name="x" size={14} /></button>
              </>
            ) : (
              <>
                <b className="value">{e.value}</b>
                <span className="grow">{e.name}</span>
              </>
            )}
          </div>
        ))}
      </div>
      {gm && entries.length > 0 && (
        <div className="row" style={{ padding: 10 }}>
          <button className="btn small" onClick={() => next(-1)}><Icon name="chevronLeft" size={14} /></button>
          <button className="btn small primary grow" onClick={() => next(1)}>Próximo turno <Icon name="next" size={14} /></button>
          <button className="btn small" onClick={() => set({ entries: [], current: 0, round: 1 })} title="Limpar">Limpar</button>
        </div>
      )}
    </Window>
  );
}
