// Convite: link na rede local / VPN e link público grátis (Cloudflare Quick Tunnel).
import { useEffect, useState } from "react";
import { game, gmKey } from "../game.ts";
import { Icon } from "../ui/Icon.tsx";
import { Modal } from "../ui/Window.tsx";

interface Net {
  port: number;
  lan: string[];
  tunnel: { state: "off" | "downloading" | "starting" | "on" | "error"; url: string | null; error: string | null; progress: number };
}

export async function fetchNet(): Promise<Net> {
  const r = await fetch("/api/net", { headers: { "x-gm-key": gmKey() } });
  return r.json();
}

export async function setTunnel(on: boolean) {
  await fetch("/api/tunnel", { method: "POST", headers: { "x-gm-key": gmKey(), "content-type": "application/json" }, body: JSON.stringify({ on }) });
}

export function useNet(): [Net | null, () => void] {
  const [net, setNet] = useState<Net | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = async () => {
      const n = await fetchNet().catch(() => null);
      if (!alive) return;
      setNet(n);
      const busy = n && (n.tunnel.state === "downloading" || n.tunnel.state === "starting");
      timer = window.setTimeout(load, busy ? 800 : 5000);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tick]);
  return [net, () => setTick((t) => t + 1)];
}

export function CopyField({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="row">
      <input className="input mono small" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn small"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        }}
      >
        <Icon name="copy" size={14} /> {ok ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

export function TunnelControls({ net, refresh }: { net: Net; refresh: () => void }) {
  const t = net.tunnel;
  const toggle = async (on: boolean) => {
    await setTunnel(on);
    refresh();
  };
  if (t.state === "on") {
    return <button className="btn small danger" onClick={() => toggle(false)}>Desligar link público</button>;
  }
  if (t.state === "downloading") return <span className="muted small">Baixando cloudflared… {Math.round(t.progress * 100)}%</span>;
  if (t.state === "starting") return <span className="muted small">Abrindo túnel…</span>;
  return (
    <div className="col">
      <button className="btn small" onClick={() => toggle(true)}>
        <Icon name="globe" size={14} /> Gerar link público (grátis)
      </button>
      {t.state === "error" && <span className="error-text">{t.error}</span>}
    </div>
  );
}

export function inviteUrl(base: string, campaignId: string, invite: string) {
  return `${base}/c/${campaignId}?convite=${invite}`;
}

export function ShareModal({ onClose }: { onClose: () => void }) {
  const cid = game.use((s) => s.campaignId);
  const [net, refresh] = useNet();
  const [invite, setInvite] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/campaigns", { headers: { "x-gm-key": gmKey() } })
      .then((r) => r.json())
      .then((list: { id: string; invite: string }[]) => setInvite(list.find((c) => c.id === cid)?.invite ?? null))
      .catch(() => {});
  }, [cid]);

  const newInvite = async () => {
    if (!confirm("Gerar novo convite? O link antigo para de funcionar para quem ainda não entrou.")) return;
    const r = await fetch(`/api/campaigns/${cid}/invite`, { method: "POST", headers: { "x-gm-key": gmKey() } });
    setInvite((await r.json()).invite);
  };

  return (
    <Modal title="Convidar jogadores" onClose={onClose}>
      {!net || !invite ? (
        <div className="muted">Carregando…</div>
      ) : (
        <>
          <div className="col">
            <b>Pela internet (qualquer lugar)</b>
            {net.tunnel.url ? (
              <CopyField value={inviteUrl(net.tunnel.url, cid, invite)} />
            ) : (
              <span className="muted small">Cria um endereço https://….trycloudflare.com que aponta para o seu PC. Sem conta, grátis. Muda a cada vez que liga.</span>
            )}
            <TunnelControls net={net} refresh={refresh} />
          </div>
          <div className="sep" />
          <div className="col">
            <b>Mesma rede / Radmin / Hamachi</b>
            {net.lan.length ? net.lan.map((u) => <CopyField key={u} value={inviteUrl(u, cid, invite)} />) : <span className="muted small">Nenhuma rede encontrada.</span>}
          </div>
          <div className="row">
            <span className="muted small grow">Jogadores entram com o nome; quem repetir um nome volta como aquele jogador.</span>
            <button className="btn small" onClick={newInvite}><Icon name="refresh" size={14} /> Novo convite</button>
          </div>
        </>
      )}
    </Modal>
  );
}
