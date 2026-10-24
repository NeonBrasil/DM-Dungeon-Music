// Texto/handout: o mestre escreve (e decide se os jogadores veem); jogadores só leem.
import { useRef } from "react";
import { useState } from "react";
import { api, game, useColl } from "../game.ts";
import { closeHandout } from "../table/ui.ts";
import { EditField } from "../ui/EditField.tsx";
import { Icon } from "../ui/Icon.tsx";
import { cropAndUpload } from "../ui/ImageCrop.tsx";
import { Window } from "../ui/Window.tsx";

export function HandoutWindow({ id }: { id: string }) {
  const h = useColl("handouts")[id];
  const players = useColl("players");
  const role = game.use((s) => s.role);
  const [who, setWho] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!h) return null;
  const gm = role === "gm";
  const up = (patch: Record<string, unknown>) => api.update("handouts", id, patch);
  return (
    <Window
      title={h.name}
      width={520}
      height={560}
      onClose={() => closeHandout(id)}
      actions={gm && (
        <>
          <button className={`btn small ${h.shared || h.visibleTo?.length ? "active" : ""}`} onClick={() => setWho(!who)} title="Quem vê este texto">
            <Icon name={h.shared || h.visibleTo?.length ? "eye" : "eyeOff"} size={14} />
            {h.shared ? "Todos veem" : h.visibleTo?.length ? `${h.visibleTo.length} jogador(es)` : "Oculto"}
          </button>
          <button
            className="icon-btn small" title="Excluir"
            onClick={() => {
              if (confirm(`Excluir "${h.name}"?`)) {
                api.remove("handouts", id);
                closeHandout(id);
              }
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        </>
      )}
    >
      <div className="col" style={{ padding: 14 }}>
        {gm && who && (
          <div className="panel-box row wrap" style={{ padding: 8 }}>
            <label className="check small"><input type="checkbox" checked={h.shared} onChange={(e) => up({ shared: e.target.checked })} /> Todos</label>
            {Object.values(players).map((p) => (
              <label key={p.id} className="check small" style={{ opacity: h.shared ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  disabled={h.shared}
                  checked={(h.visibleTo ?? []).includes(p.id)}
                  onChange={(e) => up({ visibleTo: e.target.checked ? [...(h.visibleTo ?? []), p.id] : (h.visibleTo ?? []).filter((x) => x !== p.id) })}
                />
                <span style={{ color: p.color }}>{p.name}</span>
              </label>
            ))}
          </div>
        )}
        {gm && <EditField value={h.name} onCommit={(v) => up({ name: v || "Texto" })} />}
        {h.image && <img src={h.image} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />}
        {gm && (
          <div className="row">
            <button className="btn small" onClick={() => fileRef.current?.click()}><Icon name="image" size={14} /> {h.image ? "Trocar imagem" : "Adicionar imagem"}</button>
            {h.image && <button className="btn small" onClick={() => up({ image: null })}>Remover imagem</button>}
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                const url = f && (await cropAndUpload(f));
                if (url) up({ image: url });
              }}
            />
          </div>
        )}
        {gm ? (
          <EditField multiline rows={16} value={h.text} onCommit={(v) => up({ text: v })} placeholder="Texto…" />
        ) : (
          <div className="handout-text">{h.text}</div>
        )}
      </div>
    </Window>
  );
}
