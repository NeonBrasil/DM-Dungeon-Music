// Entrada numa campanha: decide se é mestre, jogador conhecido ou novo jogador (tela de entrada).
import { useEffect, useState } from "react";
import { connect, disconnect, game, gmKey, playerAuth, setPlayerAuth } from "../game.ts";
import { Table } from "../table/Table.tsx";
import { Brand } from "./Lobby.tsx";

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c", "#f1c40f", "#e84393", "#00cec9", "#a29bfe"];

async function whoami(cid: string, auth: string): Promise<number> {
  const r = await fetch(`/api/campaigns/${cid}/whoami`, { headers: { "x-auth": auth } });
  return r.status;
}

export function CampaignApp({ cid }: { cid: string }) {
  const [mode, setMode] = useState<"checking" | "join" | "ready" | "missing">("checking");
  const status = game.use((s) => s.status);
  const role = game.use((s) => s.role);

  const start = async () => {
    if (gmKey() && (await whoami(cid, gmKey())) === 200) {
      connect(cid, true);
      setMode("ready");
      return;
    }
    const pa = playerAuth(cid);
    if (pa) {
      const code = await whoami(cid, pa.secret);
      if (code === 200) {
        connect(cid, false);
        setMode("ready");
        return;
      }
      if (code === 404) {
        setMode("missing");
        return;
      }
      setPlayerAuth(cid, null);
    }
    const invite = new URLSearchParams(location.search).get("convite") ?? "";
    const r = await fetch(`/api/campaigns/${cid}/public?invite=${encodeURIComponent(invite)}`);
    setMode(r.status === 404 ? "missing" : "join");
  };

  useEffect(() => {
    start();
    return () => disconnect();
  }, [cid]);

  if (mode === "missing") return <Message text="Campanha não encontrada." />;
  if (mode === "join") return <Join cid={cid} onJoined={start} />;
  if (status === "kicked") {
    return (
      <Message text="Você foi removido desta mesa (ou ela foi apagada).">
        <button className="btn" onClick={() => { setPlayerAuth(cid, null); location.reload(); }}>Entrar de novo</button>
      </Message>
    );
  }
  if (mode !== "ready" || !role) return <Message text="Conectando à mesa…" />;
  return <Table />;
}

function Message({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="screen">
      <div className="join-box panel-box">
        <Brand />
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}

function Join({ cid, onJoined }: { cid: string; onJoined: () => void }) {
  const invite = new URLSearchParams(location.search).get("convite") ?? "";
  const [info, setInfo] = useState<{ name: string; players: { name: string; color: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("dm.lastName") ?? "");
  const [color, setColor] = useState("");

  useEffect(() => {
    fetch(`/api/campaigns/${cid}/public?invite=${encodeURIComponent(invite)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setInfo(body);
      })
      .catch((e) => setError(e.message === "convite inválido" ? "Link de convite inválido ou antigo. Peça um novo ao mestre." : e.message));
  }, [cid]);

  const join = async (asName = name) => {
    if (!asName.trim()) return;
    const r = await fetch(`/api/campaigns/${cid}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invite, name: asName.trim(), color: color || undefined }),
    });
    const body = await r.json();
    if (!r.ok) {
      setError(body.error);
      return;
    }
    localStorage.setItem("dm.lastName", asName.trim());
    setPlayerAuth(cid, { playerId: body.playerId, secret: body.secret });
    onJoined();
  };

  if (error) return <Message text={error} />;
  if (!info) return <Message text="Carregando…" />;
  const used = new Set(info.players.map((p) => p.color));

  return (
    <div className="screen">
      <div className="join-box panel-box">
        <Brand />
        <div>
          <div className="muted small">Você foi convidado para</div>
          <h2>{info.name}</h2>
        </div>
        {info.players.length > 0 && (
          <div className="col">
            <span className="small muted">Já jogou aqui? Clique no seu nome:</span>
            <div className="row wrap">
              {info.players.map((p) => (
                <button key={p.name} className="chip" style={{ cursor: "pointer" }} onClick={() => join(p.name)}>
                  <span className="dot" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="field">
          <span>Seu nome</span>
          <input className="input" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} />
        </label>
        <div className="col">
          <span className="small muted">Sua cor</span>
          <div className="color-row">
            {COLORS.filter((c) => !used.has(c)).map((c) => (
              <button key={c} className={`color-swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <button className="btn primary" disabled={!name.trim()} onClick={() => join()}>Entrar na mesa</button>
      </div>
    </div>
  );
}
