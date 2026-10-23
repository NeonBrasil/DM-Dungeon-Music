// Diário: fichas de personagem e textos (handouts). Arraste uma ficha para o tabuleiro para criar o token.
import { useMemo, useRef, useState } from "react";
import type { Character } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { api, game, uploadFile, useColl } from "../game.ts";
import { initialsOf } from "../chat/Chat.tsx";
import { openHandout, openSheet, ui } from "../table/ui.ts";
import { Icon } from "../ui/Icon.tsx";
import { Modal } from "../ui/Window.tsx";
import { defaultData } from "./engine.ts";
import { BUILTIN, findTemplate } from "./templates.ts";
import { importFile } from "./transfer.ts";
import { toast } from "../ui/Toast.tsx";

export function Journal() {
  const characters = useColl("characters");
  const handouts = useColl("handouts");
  const templates = useColl("templates");
  const players = useColl("players");
  const role = game.use((s) => s.role);
  const gm = role === "gm";
  const [creating, setCreating] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const chars = useMemo(
    () => Object.values(characters).filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [characters, filter],
  );
  const texts = useMemo(() => Object.values(handouts).sort((a, b) => a.name.localeCompare(b.name)), [handouts]);

  const owner = (c: Character) => c.controlledBy.map((id) => players[id]?.name).filter(Boolean).join(", ");

  return (
    <div className="side-scroll">
      <div className="row">
        <h4 className="section-title grow" style={{ margin: 0 }}>Fichas</h4>
        <button className="btn small" title="Importar ficha ou modelo (.json)" onClick={() => importRef.current?.click()}><Icon name="upload" size={14} /></button>
        <button className="btn small primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> Nova ficha</button>
        <input
          ref={importRef} type="file" accept=".json,application/json" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              toast(await importFile(f));
            } catch (err) {
              toast((err as Error).message);
            }
          }}
        />
      </div>
      {chars.length > 6 && <input className="input" placeholder="Buscar…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      <div className="list">
        {chars.length === 0 && <div className="empty">Nenhuma ficha ainda.</div>}
        {chars.map((c) => (
          <div
            key={c.id}
            className="list-item"
            draggable={gm}
            onDragStart={(e) => e.dataTransfer.setData("application/x-dm-character", c.id)}
            onClick={() => openSheet(c.id)}
            title={gm ? "Clique para abrir · arraste para o tabuleiro para criar o token" : "Abrir ficha"}
          >
            <div className="thumb" style={c.avatar ? { backgroundImage: `url("${c.avatar}")` } : undefined}>{!c.avatar && initialsOf(c.name)}</div>
            <div className="name">
              {c.name}
              <div className="small muted">{findTemplate(c.template, templates).name}{gm && owner(c) ? ` · ${owner(c)}` : ""}</div>
            </div>
            {gm && c.shared && <Icon name="eye" size={14} className="muted" />}
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <h4 className="section-title grow" style={{ margin: 0 }}>Textos</h4>
        {gm && (
          <button
            className="btn small"
            onClick={() => {
              const id = newId();
              api.create("handouts", { id, name: "Novo texto", text: "", shared: false });
              openHandout(id);
            }}
          >
            <Icon name="plus" size={14} /> Texto
          </button>
        )}
      </div>
      <div className="list">
        {texts.length === 0 && <div className="empty">{gm ? "Textos, pistas e mapas para mostrar aos jogadores." : "Nada compartilhado ainda."}</div>}
        {texts.map((h) => (
          <div key={h.id} className="list-item" onClick={() => openHandout(h.id)}>
            <div className="thumb" style={h.image ? { backgroundImage: `url("${h.image}")` } : undefined}>{!h.image && <Icon name="book" size={16} />}</div>
            <div className="name">{h.name}</div>
            {gm && <Icon name={h.shared ? "eye" : "eyeOff"} size={14} className="muted" />}
          </div>
        ))}
      </div>

      {gm && (
        <button className="btn small" style={{ marginTop: 10 }} onClick={() => ui.set({ showTemplates: true })}>
          <Icon name="edit" size={14} /> Modelos de ficha
        </button>
      )}
      {creating && <NewCharacter onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewCharacter({ onClose }: { onClose: () => void }) {
  const templates = useColl("templates");
  const role = game.use((s) => s.role);
  const playerId = game.use((s) => s.playerId);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState(() => localStorage.getItem("dm.lastTemplate") ?? "free");
  const [avatar, setAvatar] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const all = [...BUILTIN, ...Object.values(templates)];
  const create = () => {
    const t = findTemplate(tpl, templates);
    const id = newId();
    localStorage.setItem("dm.lastTemplate", t.id);
    api.create("characters", {
      id, name: name.trim() || "Novo personagem", template: t.id, data: defaultData(t),
      controlledBy: role === "gm" ? [] : [playerId!], shared: false, ...(avatar ? { avatar } : {}),
    });
    openSheet(id);
    onClose();
  };
  return (
    <Modal title="Nova ficha" onClose={onClose}>
      <div className="row">
        <button
          className="sheet-avatar" title="Imagem do personagem (vira a do token)"
          style={avatar ? { backgroundImage: `url("${avatar}")` } : undefined}
          onClick={() => fileRef.current?.click()}
        >
          {!avatar && <Icon name={uploading ? "refresh" : "image"} size={22} />}
        </button>
        <input
          ref={fileRef} type="file" accept="image/*" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setUploading(true);
            try {
              setAvatar(await uploadFile(f, f.name));
            } catch (err) {
              toast((err as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
        <label className="field grow"><span>Nome</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </label>
      </div>
      <label className="field"><span>Sistema / modelo</span>
        <select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)}>
          {all.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div className="row">
        <span className="grow small muted">{role === "gm" ? "Fichas do mestre começam ocultas; marque os donos depois." : "A ficha será sua."}</span>
        <button className="btn primary" disabled={uploading} onClick={create}>Criar</button>
      </div>
    </Modal>
  );
}
