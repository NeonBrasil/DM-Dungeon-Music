// Música e efeitos: o mestre controla; todos ouvem sincronizado, cada um no seu volume.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { api, game, gmKey, serverNow, uploadFile, useColl } from "../game.ts";
import { Icon } from "../ui/Icon.tsx";
import { Modal } from "../ui/Window.tsx";
import { audioPrefs, localPosition, setAudioPrefs } from "./engine.ts";

const AUDIO_ACCEPT = ".mp3,.ogg,.opus,.wav,.flac,.m4a,.webm,audio/*";

function newTrack(name: string, src: string, kind: Track["kind"], volume = 0.8): Track {
  return { id: newId(), name, src, kind, volume, loop: kind === "music", playing: false, startedAt: 0, pausedAt: 0, order: Date.now() };
}

function Volumes() {
  const music = audioPrefs.use((s) => s.music);
  const sfx = audioPrefs.use((s) => s.sfx);
  const muted = audioPrefs.use((s) => s.muted);
  return (
    <div className="panel-box col" style={{ padding: 10 }}>
      <div className="row">
        <b className="grow small">Seu volume</b>
        <button className={`icon-btn small ${muted ? "active" : ""}`} title={muted ? "Ativar som" : "Silenciar"} onClick={() => setAudioPrefs({ muted: !muted })}>
          <Icon name={muted ? "x" : "volume"} size={15} />
        </button>
      </div>
      <label className="row small muted">Música <input className="grow" type="range" min={0} max={1} step={0.01} value={music} onChange={(e) => setAudioPrefs({ music: Number(e.target.value) })} /></label>
      <label className="row small muted">Efeitos <input className="grow" type="range" min={0} max={1} step={0.01} value={sfx} onChange={(e) => setAudioPrefs({ sfx: Number(e.target.value) })} /></label>
    </div>
  );
}

export function Jukebox() {
  const tracks = useColl("tracks");
  const role = game.use((s) => s.role);
  const [busy, setBusy] = useState("");
  const [legacy, setLegacy] = useState(false);
  const musicIn = useRef<HTMLInputElement>(null);
  const sfxIn = useRef<HTMLInputElement>(null);
  const sorted = useMemo(() => Object.values(tracks).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)), [tracks]);

  if (role !== "gm") {
    const playing = sorted.filter((t) => t.playing);
    return (
      <div className="side-scroll">
        <Volumes />
        <h4 className="section-title" style={{ margin: "8px 0 0" }}>Tocando agora</h4>
        {playing.length === 0 ? <div className="empty">Silêncio…</div> : playing.map((t) => (
          <div key={t.id} className="list-item"><Icon name={t.kind === "music" ? "music" : "sparkles"} size={15} /><span className="name">{t.name}</span></div>
        ))}
      </div>
    );
  }

  const upload = async (files: FileList | null, kind: Track["kind"]) => {
    if (!files?.length) return;
    try {
      let n = 0;
      for (const f of Array.from(files)) {
        setBusy(`Enviando ${++n}/${files.length}: ${f.name}`);
        const url = await uploadFile(f, f.name);
        api.create("tracks", newTrack(f.name.replace(/\.[^.]+$/, ""), url, kind));
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const play = (t: Track) => {
    const from = t.kind === "music" ? t.pausedAt ?? 0 : 0;
    api.update("tracks", t.id, { playing: true, startedAt: serverNow() - from * 1000 });
  };
  const pause = (t: Track) => api.update("tracks", t.id, { playing: false, pausedAt: localPosition(t.id) });
  const stop = (t: Track) => api.update("tracks", t.id, { playing: false, pausedAt: 0 });

  const row = (t: Track) => (
    <div key={t.id} className={`track ${t.playing ? "on" : ""}`}>
      <button className="icon-btn small" title={t.playing ? (t.kind === "music" ? "Pausar" : "Parar") : "Tocar para todos"} onClick={() => (t.playing ? (t.kind === "music" ? pause(t) : stop(t)) : play(t))}>
        <Icon name={t.playing ? (t.kind === "music" ? "pause" : "stop") : "play"} size={14} />
      </button>
      {t.kind === "music" && (
        <button className="icon-btn small" title="Parar (volta ao início)" onClick={() => stop(t)} disabled={!t.playing && !t.pausedAt}><Icon name="stop" size={12} /></button>
      )}
      <span className="name" title={t.name}>{t.name}</span>
      <button className={`icon-btn small ${t.loop ? "active" : ""}`} title="Repetir" onClick={() => api.update("tracks", t.id, { loop: !t.loop })}><Icon name="repeat" size={13} /></button>
      <input className="vol" type="range" min={0} max={1} step={0.01} value={t.volume} title={`Volume ${Math.round(t.volume * 100)}%`} onChange={(e) => api.update("tracks", t.id, { volume: Number(e.target.value) })} />
      <button className="icon-btn small" title="Remover" onClick={() => confirm(`Remover "${t.name}"?`) && api.remove("tracks", t.id)}><Icon name="trash" size={13} /></button>
    </div>
  );

  const music = sorted.filter((t) => t.kind === "music");
  const sfx = sorted.filter((t) => t.kind === "sfx");
  const anyPlaying = sorted.some((t) => t.playing);

  return (
    <div className="side-scroll">
      <div className="row wrap">
        <button className="btn small" onClick={() => musicIn.current?.click()} disabled={!!busy}><Icon name="upload" size={14} /> Músicas</button>
        <button className="btn small" onClick={() => sfxIn.current?.click()} disabled={!!busy}><Icon name="upload" size={14} /> Efeitos</button>
        <button className="btn small" onClick={() => setLegacy(true)}><Icon name="download" size={14} /> Do DM Dungeon Music</button>
        <input ref={musicIn} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files, "music")} />
        <input ref={sfxIn} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files, "sfx")} />
      </div>
      {busy && <span className="small muted">{busy}</span>}
      {anyPlaying && (
        <button className="btn small danger" onClick={() => sorted.filter((t) => t.playing).forEach(stop)}><Icon name="stop" size={12} /> Parar tudo</button>
      )}
      <h4 className="section-title" style={{ margin: "6px 0 0" }}>Músicas</h4>
      {music.length ? music.map(row) : <div className="empty">Envie músicas ou importe do app antigo.</div>}
      <h4 className="section-title" style={{ margin: "6px 0 0" }}>Efeitos</h4>
      {sfx.length ? sfx.map(row) : <div className="empty">Sons curtos: portas, espadas, trovões…</div>}
      <Volumes />
      {legacy && <LegacyImport onClose={() => setLegacy(false)} />}
    </div>
  );
}

interface LegacyTrack { path: string; name: string; kind: "music" | "sfx"; volume: number; exists: boolean; size: number }

function LegacyImport({ onClose }: { onClose: () => void }) {
  const cid = game.use((s) => s.campaignId);
  const tracks = useColl("tracks");
  const [list, setList] = useState<LegacyTrack[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/legacy/tracks", { headers: { "x-gm-key": gmKey() } })
      .then((r) => r.json())
      .then((l: LegacyTrack[]) => setList(l))
      .catch(() => setError("Não consegui ler a biblioteca antiga."));
  }, []);

  const have = new Set(Object.values(tracks).map((t) => t.name));
  const doImport = async () => {
    if (!list) return;
    setBusy(true);
    try {
      const paths = [...sel];
      const r = await fetch(`/api/campaigns/${cid}/legacy-import`, {
        method: "POST", headers: { "x-gm-key": gmKey(), "content-type": "application/json" }, body: JSON.stringify({ paths }),
      });
      const done: { path: string; url: string }[] = await r.json();
      for (const d of done) {
        const t = list.find((x) => x.path === d.path)!;
        api.create("tracks", newTrack(t.name, d.url, t.kind, Math.max(0.1, t.volume)));
      }
      onClose();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (p: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(p)) n.delete(p);
    else n.add(p);
    return n;
  });
  const avail = (list ?? []).filter((t) => t.exists);
  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
  const total = (list ?? []).filter((t) => sel.has(t.path)).reduce((a, t) => a + t.size, 0);

  return (
    <Modal title="Importar do DM Dungeon Music" onClose={onClose}>
      {error && <span className="error-text">{error}</span>}
      {!list ? <span className="muted">Lendo biblioteca…</span> : list.length === 0 ? (
        <span className="muted">Nenhuma faixa encontrada em ~/.dm_dungeon_music.</span>
      ) : (
        <>
          <div className="row">
            <button className="btn small" onClick={() => setSel(new Set(avail.filter((t) => !have.has(t.name)).map((t) => t.path)))}>Selecionar todas</button>
            <button className="btn small" onClick={() => setSel(new Set())}>Nenhuma</button>
            <span className="spacer" />
            <span className="small muted">{sel.size} faixa(s) · {mb(total)}</span>
          </div>
          <div className="legacy-list">
            {(["music", "sfx"] as const).map((kind) => (
              <div key={kind}>
                <div className="small muted" style={{ margin: "6px 0 2px" }}>{kind === "music" ? "Músicas" : "Efeitos"}</div>
                {list.filter((t) => t.kind === kind).map((t) => (
                  <label key={t.path} className="check small" style={{ opacity: t.exists ? 1 : 0.45 }} title={t.path}>
                    <input type="checkbox" disabled={!t.exists} checked={sel.has(t.path)} onChange={() => toggle(t.path)} />
                    <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    <span className="muted">{t.exists ? (have.has(t.name) ? "já na mesa" : mb(t.size)) : "arquivo sumiu"}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="row">
            <span className="grow small muted">As faixas são copiadas para a pasta da campanha.</span>
            <button className="btn primary" disabled={!sel.size || busy} onClick={doImport}>{busy ? "Copiando…" : "Importar"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
