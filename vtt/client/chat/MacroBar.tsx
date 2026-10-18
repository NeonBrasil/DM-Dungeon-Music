// Barra de macros (embaixo do tabuleiro) e a janelinha das perguntas ?{…}.
import { useEffect, useState } from "react";
import type { Macro } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { api, game, useColl } from "../game.ts";
import { ui } from "../table/ui.ts";
import { Icon } from "../ui/Icon.tsx";
import { Modal } from "../ui/Window.tsx";
import { prepareText, queryStore } from "./prepare.ts";

/** Envia ao chat (cada linha vira uma mensagem), resolvendo perguntas e referências. */
export async function sendChat(text: string) {
  const ready = await prepareText(text);
  if (!ready) return;
  const as = ui.get().speakAs || undefined;
  for (const line of ready.split("\n").map((l) => l.trim()).filter(Boolean)) api.chat(line, as);
}

function useMacros(): [Macro[], (list: Macro[]) => void] {
  const role = game.use((s) => s.role);
  const playerId = game.use((s) => s.playerId);
  const players = useColl("players");
  const settings = useColl("settings").main;
  if (role === "gm") return [settings?.gmMacros ?? [], (list) => api.update("settings", "main", { gmMacros: list })];
  return [players[playerId ?? ""]?.macros ?? [], (list) => playerId && api.update("players", playerId, { macros: list })];
}

export function MacroBar() {
  const [macros, save] = useMacros();
  const [edit, setEdit] = useState<Macro | null>(null);
  return (
    <div className="macro-bar" onPointerDown={(e) => e.stopPropagation()}>
      {macros.map((m) => (
        <button
          key={m.id}
          className="btn small macro"
          title={`${m.text}\n(botão direito: editar)`}
          onClick={() => sendChat(m.text)}
          onContextMenu={(e) => {
            e.preventDefault();
            setEdit(m);
          }}
        >
          {m.label}
        </button>
      ))}
      <button className="icon-btn small" title="Nova macro" onClick={() => setEdit({ id: newId(8), label: "", text: "" })}><Icon name="plus" size={14} /></button>
      {edit && (
        <MacroEditor
          macro={edit}
          isNew={!macros.some((m) => m.id === edit.id)}
          onClose={() => setEdit(null)}
          onSave={(m) => {
            save(macros.some((x) => x.id === m.id) ? macros.map((x) => (x.id === m.id ? m : x)) : [...macros, m]);
            setEdit(null);
          }}
          onDelete={() => {
            save(macros.filter((x) => x.id !== edit.id));
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function MacroEditor({ macro, isNew, onClose, onSave, onDelete }: { macro: Macro; isNew: boolean; onClose: () => void; onSave: (m: Macro) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(macro.label);
  const [text, setText] = useState(macro.text);
  return (
    <Modal title={isNew ? "Nova macro" : "Editar macro"} onClose={onClose}>
      <label className="field"><span>Nome do botão</span><input className="input" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="field">
        <span>Comando (uma mensagem por linha)</span>
        <textarea className="input mono" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"/r 1d20 + ?{Bônus|0} Ataque\n/r 1d8+3 Dano"} />
      </label>
      <span className="small muted">
        Perguntas: <span className="mono">?{"{Bônus|0}"}</span> ou <span className="mono">?{"{Rolagem|Normal,1d20|Vantagem,2d20kh1}"}</span>.
        Fichas: <span className="mono">@{"{Thorin|athletics}"}</span>. Iniciativa: <span className="mono">/r 1d20+2 &amp;{"{tracker}"}</span>.
      </span>
      <div className="row">
        {!isNew && <button className="btn danger" onClick={onDelete}><Icon name="trash" size={14} /> Excluir</button>}
        <span className="spacer" />
        <button className="btn primary" disabled={!label.trim() || !text.trim()} onClick={() => onSave({ ...macro, label: label.trim(), text })}>Salvar</button>
      </div>
    </Modal>
  );
}

export function QueryModal() {
  const items = queryStore.use((s) => s.items);
  const resolve = queryStore.use((s) => s.resolve);
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => setVals(items.map((q) => q.def)), [items]);
  if (!resolve || !items.length) return null;
  const finish = (ok: boolean) => {
    queryStore.set({ items: [], resolve: null });
    resolve(ok ? vals : null);
  };
  return (
    <Modal title="Rolagem" onClose={() => finish(false)}>
      {items.map((q, i) => (
        <label key={q.q} className="field">
          <span>{q.q}</span>
          {q.options ? (
            <select className="input" value={vals[i] ?? ""} onChange={(e) => setVals((v) => v.map((x, k) => (k === i ? e.target.value : x)))}>
              {q.options.map(([l, v]) => <option key={l} value={v}>{l}</option>)}
            </select>
          ) : (
            <input
              className="input"
              autoFocus={i === 0}
              value={vals[i] ?? ""}
              onChange={(e) => setVals((v) => v.map((x, k) => (k === i ? e.target.value : x)))}
              onKeyDown={(e) => e.key === "Enter" && finish(true)}
            />
          )}
        </label>
      ))}
      <div className="row">
        <span className="spacer" />
        <button className="btn" onClick={() => finish(false)}>Cancelar</button>
        <button className="btn primary" onClick={() => finish(true)}>Rolar</button>
      </div>
    </Modal>
  );
}
