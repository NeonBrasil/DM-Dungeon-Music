// Tela inicial do mestre: campanhas, conexão (LAN / link público), convites e backups.
import { useEffect, useRef, useState } from "react";
import { gmKey } from "../game.ts";
import { Icon } from "../ui/Icon.tsx";
import { Modal } from "../ui/Window.tsx";
import { CopyField, inviteUrl, TunnelControls, useNet } from "../table/ShareModal.tsx";

interface Summary {
  id: string;
  name: string;
  createdAt: number;
  invite: string;
  players: { name: string; color: string; online: boolean }[];
}

const headers = () => ({ "x-gm-key": gmKey(), "content-type": "application/json" });

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Icon name="dice" size={26} /></div>
      <div>
        <h1>DM Mesa</h1>
        <p>Mesa virtual do DM - Dungeon Music</p>
      </div>
    </div>
  );
}

export function Lobby() {
  const [state, setState] = useState<"loading" | "gm" | "nogm">("loading");
  const [list, setList] = useState<Summary[]>([]);

  const load = async () => {
    const r = await fetch("/api/campaigns", { headers: headers() });
    if (r.ok) setList(await r.json());
  };

  useEffect(() => {
    fetch("/api/session", { headers: headers() })
      .then((r) => r.json())
      .then((s) => {
        setState(s.gm ? "gm" : "nogm");
        if (s.gm) load();
      })
      .catch(() => setState("nogm"));
  }, []);

  if (state === "loading") return <div className="screen" />;
  if (state === "nogm") return <NoAccess />;
  return (
    <div className="screen">
      <div className="lobby">
        <div className="lobby-head">
          <Brand />
          <span className="spacer" />
          <ImportBackup onDone={load} />
          <a className="btn" href="/gerador"><Icon name="wand" size={16} /> Gerador de mapas</a>
        </div>
        <Connection />
        <h2 className="section-title">Campanhas</h2>
        <div className="cards">
          <NewCampaign onCreated={load} />
          {list.map((c) => <CampaignCard key={c.id} c={c} onChange={load} />)}
        </div>
      </div>
    </div>
  );
}

function NewCampaign({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const create = async () => {
    const r = await fetch("/api/campaigns", { method: "POST", headers: headers(), body: JSON.stringify({ name: name.trim() || "Nova campanha" }) });
    if (r.ok) {
      setName("");
      setOpen(false);
      onCreated();
    }
  };
  if (!open) {
    return (
      <button className="card new" onClick={() => setOpen(true)} style={{ cursor: "pointer", font: "inherit" }}>
        <Icon name="plus" size={28} />
        Nova campanha
      </button>
    );
  }
  return (
    <div className="card">
      <h3>Nova campanha</h3>
      <input className="input" autoFocus placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
      <div className="row">
        <button className="btn primary" onClick={create}>Criar</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}

function ImportBackup({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await fetch("/api/campaigns/import", { method: "POST", headers: { "x-gm-key": gmKey() }, body: file });
      if (r.ok) onDone();
      else alert((await r.json().catch(() => ({}))).error ?? "Falha ao importar.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <button className="btn" disabled={busy} onClick={() => input.current?.click()} title="Cria uma campanha nova a partir de um backup .zip">
        <Icon name="upload" size={16} /> {busy ? "Importando…" : "Importar backup"}
      </button>
      <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </>
  );
}

function Snapshots({ c, onClose }: { c: Summary; onClose: () => void }) {
  const [list, setList] = useState<{ name: string; ts: number; size: number }[] | null>(null);
  useEffect(() => {
    fetch(`/api/campaigns/${c.id}/snapshots`, { headers: headers() }).then((r) => r.json()).then(setList).catch(() => setList([]));
  }, [c.id]);
  const restore = async (name: string) => {
    if (!confirm("Voltar a campanha para este momento? O estado atual também vira uma cópia, então dá para desfazer.")) return;
    const r = await fetch(`/api/campaigns/${c.id}/snapshots/${name}/restore`, { method: "POST", headers: headers() });
    if (r.ok) onClose();
    else alert((await r.json().catch(() => ({}))).error ?? "Falha ao restaurar.");
  };
  return (
    <Modal title={`Cópias automáticas · ${c.name}`} onClose={onClose}>
      <p className="small muted">Feitas ao abrir a mesa e de hora em hora enquanto ela muda (ficam as últimas 24).</p>
      {list === null ? (
        <div className="muted small">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="empty">Nenhuma cópia ainda.</div>
      ) : (
        <div className="list" style={{ maxHeight: 360, overflowY: "auto" }}>
          {list.map((s) => (
            <div key={s.name} className="list-item">
              <span className="name">
                {new Date(s.ts).toLocaleString("pt-BR")}
                {s.name.includes("antes-de-restaurar") && <span className="muted small"> · antes de restaurar</span>}
              </span>
              <span className="muted small">{Math.max(1, Math.round(s.size / 1024))} KB</span>
              <button className="btn small" onClick={() => restore(s.name)}>Restaurar</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CampaignCard({ c, onChange }: { c: Summary; onChange: () => void }) {
  const [net] = useNet();
  const [snaps, setSnaps] = useState(false);
  const base = net?.tunnel.url ?? net?.lan[0] ?? location.origin;
  const del = async () => {
    if (!confirm(`Excluir a campanha "${c.name}"? (vai para a lixeira em ~/.dm_dungeon_music/mesa)`)) return;
    await fetch(`/api/campaigns/${c.id}`, { method: "DELETE", headers: headers() });
    onChange();
  };
  return (
    <div className="card">
      <div className="row">
        <h3 className="grow">{c.name}</h3>
        <button className="icon-btn small" title="Excluir" onClick={del}><Icon name="trash" size={15} /></button>
      </div>
      <div className="muted small">Criada em {new Date(c.createdAt).toLocaleDateString("pt-BR")}</div>
      <div className="players">
        {c.players.length === 0 && <span className="muted small">Nenhum jogador ainda</span>}
        {c.players.map((p) => (
          <span key={p.name} className="chip"><span className="dot" style={{ background: p.color, opacity: p.online ? 1 : 0.4 }} />{p.name}</span>
        ))}
      </div>
      <CopyField value={inviteUrl(base, c.id, c.invite)} />
      <a className="btn primary" href={`/c/${c.id}`}><Icon name="play" size={14} /> Abrir mesa</a>
      <div className="row">
        <a className="btn small" href={`/api/campaigns/${c.id}/backup?k=${encodeURIComponent(gmKey())}`} download title="Baixa a campanha inteira (fichas, mapas, imagens e músicas) num .zip">
          <Icon name="download" size={13} /> Backup (.zip)
        </a>
        <button className="btn small" onClick={() => setSnaps(true)} title="Voltar a campanha para um momento anterior">
          <Icon name="undo" size={13} /> Cópias automáticas
        </button>
      </div>
      {snaps && <Snapshots c={c} onClose={() => setSnaps(false)} />}
    </div>
  );
}

function Connection() {
  const [net, refresh] = useNet();
  if (!net) return null;
  return (
    <div className="panel-box col">
      <div className="row wrap">
        <b className="grow"><Icon name="globe" size={16} /> Como os jogadores entram</b>
        <TunnelControls net={net} refresh={refresh} />
      </div>
      {net.tunnel.url && (
        <div className="small">Link público ativo: <span className="mono">{net.tunnel.url}</span> — os convites abaixo já usam ele.</div>
      )}
      <div className="small muted">
        Rede local / Radmin / Hamachi: {net.lan.length ? net.lan.map((u) => <span key={u} className="mono chip" style={{ marginRight: 4 }}>{u}</span>) : "nenhuma rede"}
      </div>
    </div>
  );
}

function NoAccess() {
  const [key, setKey] = useState("");
  return (
    <div className="screen">
      <div className="join-box panel-box">
        <Brand />
        <p>Para entrar numa mesa, use o <b>link de convite</b> que o mestre mandou.</p>
        <details>
          <summary className="muted small" style={{ cursor: "pointer" }}>Sou o mestre</summary>
          <div className="col" style={{ marginTop: 10 }}>
            <span className="small muted">Abra o link "Mestre" mostrado na janela do servidor, ou cole a chave (config.json):</span>
            <input className="input mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="chave do mestre" />
            <button
              className="btn primary"
              onClick={() => {
                localStorage.setItem("dm.gmKey", key.trim());
                location.reload();
              }}
            >
              Entrar como mestre
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
