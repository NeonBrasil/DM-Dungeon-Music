// Chat com rolagens: /r, /gr, /w, /me, /desc, [[inline]] e bandeja de dados.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg, RollResult } from "../../shared/types.ts";
import { COC_LABEL } from "../../shared/dice.ts";
import { api, game, useColl } from "../game.ts";
import { canControl, ui } from "../table/ui.ts";
import { Icon } from "../ui/Icon.tsx";
import { prepareText } from "./prepare.ts";
import { dicePrefs, rolling, setDice3d } from "../dice3d/watch.ts";
import { cardUrl } from "../table/board/cards.ts";

const DICE = [4, 6, 8, 10, 12, 20, 100];
const fmtMod = (n: number) => (n > 0 ? `+${n}` : n < 0 ? String(n) : "");

export function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, color, src, online, size }: { name: string; color: string; src?: string; online?: boolean; size?: number }) {
  return (
    <div
      className="avatar"
      title={name}
      style={{ background: src ? `url("${src}") center/cover` : color, width: size, height: size }}
    >
      {!src && initialsOf(name)}
      {online && <span className="online" />}
    </div>
  );
}

function rollFlags(r: RollResult): { crit: boolean; fumble: boolean } {
  let crit = false;
  let fumble = false;
  for (const s of r.segs) {
    if (s.k !== "dice" || s.sides !== 20) continue;
    for (const d of s.rolls) {
      if (d.drop) continue;
      if (d.v === 20) crit = true;
      if (d.v === 1) fumble = true;
    }
  }
  if (r.coc) {
    crit = r.coc.level === "critical" || r.coc.level === "extreme";
    fumble = r.coc.level === "fumble" || r.coc.level === "failure";
  }
  return { crit, fumble };
}

export function RollDetail({ r }: { r: RollResult }) {
  if (r.coc) {
    const { tens, units, target } = r.coc;
    return (
      <span>
        dezenas {tens.map((t, i) => <span key={i} className="die">{String(t / 10)}0</span>)} unidade <span className="die">{units}</span>
        {" "}· alvo {target} / {Math.floor(target / 2)} / {Math.floor(target / 5)}
      </span>
    );
  }
  return (
    <span>
      {r.segs.map((s, i) =>
        s.k === "txt" ? (
          <Fragment key={i}>{s.v}</Fragment>
        ) : (
          <Fragment key={i}>
            {s.src} (
            {s.rolls.map((d, j) => {
              const cls = ["die"];
              if (d.drop) cls.push("drop");
              else if (s.sides > 1 && d.v === s.sides) cls.push("max");
              else if (s.sides > 1 && d.v === 1) cls.push("min");
              return <span key={j} className={cls.join(" ")}>{s.sides === 0 ? (d.v > 0 ? "+" : d.v < 0 ? "−" : "0") : d.v}</span>;
            })}
            )
          </Fragment>
        ),
      )}
    </span>
  );
}

function RollCard({ r, label, id }: { r: RollResult; label?: string; id?: string }) {
  const busy = rolling.use((s) => !!id && s.ids.includes(id));
  const { crit, fumble } = rollFlags(r);
  if (busy) {
    return (
      <div className="roll-card">
        {label && <div className="roll-label">{label}</div>}
        <div className="roll-line"><div className="roll-detail">🎲 rolando…</div><div className="roll-total">…</div></div>
      </div>
    );
  }
  return (
    <div className="roll-card">
      {label && <div className="roll-label">{label}</div>}
      <div className="roll-line">
        <div className="roll-detail">
          <div className="mono" style={{ color: "var(--text)", fontSize: 12, marginBottom: 2 }}>{r.expr}</div>
          <RollDetail r={r} />
        </div>
        <div className={`roll-total ${crit && !fumble ? "crit" : ""} ${fumble && !crit ? "fumble" : ""}`}>{r.total}</div>
      </div>
      {r.coc && (
        <div className="coc-level" style={{ color: crit ? "#7dffb0" : fumble ? "#ff9a9a" : "#ffd978", marginTop: 4 }}>
          {COC_LABEL[r.coc.level]}
        </div>
      )}
    </div>
  );
}

function RichText({ m }: { m: ChatMsg }) {
  const text = m.text ?? "";
  if (!m.inline?.length) return <>{text}</>;
  const parts = text.split(/\[\[(\d+)\]\]/);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const r = m.inline![Number(p)];
        if (!r) return null;
        const { crit, fumble } = rollFlags(r);
        const title = `${r.expr} = ${r.segs.map((s) => (s.k === "txt" ? s.v : `(${s.rolls.filter((d) => !d.drop).map((d) => d.v).join(",")})`)).join("")}`;
        return (
          <span key={i} className="inline-roll" title={title} style={crit ? { color: "#7dffb0" } : fumble ? { color: "#ff9a9a" } : undefined}>
            {r.total}
          </span>
        );
      })}
    </>
  );
}

/** Carta mostrada no chat: a mesma face do tabuleiro (ou texto, se o baralho sumiu). */
function ChatCard({ c }: { c: NonNullable<ChatMsg["card"]> }) {
  const decks = useColl("decks");
  const deck = c.deckId ? decks[c.deckId] : undefined;
  const card = deck?.cards.find((x) => x.id === c.cardId);
  const src = c.image ?? (deck && card ? cardUrl(deck, card) : "");
  return (
    <div className="chat-card">
      {src ? <img src={src} alt={c.name} /> : <div className="chat-card-face">{c.rank} {c.suit}</div>}
      <div className="col" style={{ gap: 2 }}>
        <b>{c.name}</b>
        <span className="muted small">{c.deck}</span>
        {c.text && <span className="small">{c.text}</span>}
      </div>
    </div>
  );
}

function Message({ m }: { m: ChatMsg }) {
  const players = useColl("players");
  const time = new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (m.kind === "desc") {
    return (
      <div className="msg desc">
        <div className="msg-text"><RichText m={m} /></div>
      </div>
    );
  }
  const whisperTo = m.whisper
    ? m.label && m.kind === "text"
      ? `para ${m.label}`
      : m.whisper.filter((w) => w !== m.from).map((w) => (w === "gm" ? "Mestre" : players[w]?.name ?? "?")).join(", ")
    : null;
  const cls = ["msg", m.kind, m.whisper && m.kind !== "system" ? "whisper" : ""].join(" ");
  return (
    <div className={cls}>
      {m.kind !== "system" && <Avatar name={m.name} color={m.color} src={m.avatar} />}
      <div className="msg-body">
        {m.kind !== "system" && (
          <div className="msg-head">
            <b style={{ color: m.color }}>{m.name}</b>
            {whisperTo && <span className="muted">(secreto {whisperTo.startsWith("para") ? whisperTo : `→ ${whisperTo}`})</span>}
            <span className="spacer" />
            <time>{time}</time>
          </div>
        )}
        {m.kind === "roll" && m.roll ? (
          <RollCard r={m.roll} label={m.label} id={m.id} />
        ) : (
          <div className="msg-text">
            {m.kind === "emote" && <>{m.name} </>}
            <RichText m={m} />
            {m.card && <ChatCard c={m.card} />}
          </div>
        )}
      </div>
    </div>
  );
}

export function Chat() {
  const chat = useColl("chat");
  const characters = useColl("characters");
  const role = game.use((s) => s.role);
  const playerId = game.use((s) => s.playerId);
  const players = useColl("players");
  const speakAs = ui.use((s) => s.speakAs);
  const [text, setText] = useState("");
  const [secret, setSecret] = useState(false);
  const [mod, setMod] = useState(0); // somado aos dados rápidos; fica até zerar
  const dice3d = dicePrefs.use((s) => s.on);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const history = useRef<string[]>([]);
  const histPos = useRef(-1);

  const msgs = useMemo(() => Object.values(chat).sort((a, b) => a.ts - b.ts), [chat]);
  const myChars = useMemo(() => Object.values(characters).filter((c) => canControl(c.controlledBy)), [characters, role, playerId]);

  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  const as = speakAs && characters[speakAs] ? speakAs : undefined;
  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    history.current.unshift(t);
    histPos.current = -1;
    setText("");
    const ready = await prepareText(t);
    if (ready) api.chat(ready, as);
  };

  const myName = role === "gm" ? "Mestre" : players[playerId ?? ""]?.name ?? "Eu";

  return (
    <div className="side-body">
      <div
        className="chat-log"
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {msgs.length === 0 && <div className="empty">Nenhuma mensagem. Digite <b>/r 1d20+5</b> para rolar.</div>}
        {msgs.map((m) => <Message key={m.id} m={m} />)}
      </div>
      <div className="chat-input">
        <div className="dice-tray">
          {DICE.map((d) => (
            <button key={d} className="btn" title={`Rolar 1d${d}${fmtMod(mod)}`} onClick={() => api.roll(`1d${d}${fmtMod(mod)}`, { gm: secret, as })}>
              d{d}
            </button>
          ))}
        </div>
        <div className="dice-tray">
          <span className="small muted" style={{ alignSelf: "center" }}>Mod.</span>
          {[-2, -1].map((n) => <button key={n} className="btn" onClick={() => setMod(mod + n)}>{n}</button>)}
          <button className={`btn ${mod ? "active" : ""}`} style={{ minWidth: 38 }} title="Somado aos dados acima · clique para zerar" onClick={() => setMod(0)}>
            {fmtMod(mod) || "±0"}
          </button>
          {[1, 2].map((n) => <button key={n} className="btn" onClick={() => setMod(mod + n)}>+{n}</button>)}
          <label className="check small muted" title="Só você e o mestre veem">
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> secreto
          </label>
          <label className="check small muted" title="Dados 3D rolando na tela">
            <input type="checkbox" checked={dice3d} onChange={(e) => setDice3d(e.target.checked)} /> 3D
          </label>
        </div>
        <div className="row">
          <select className="input" style={{ width: "auto", flex: 1 }} value={as ?? ""} onChange={(e) => ui.set({ speakAs: e.target.value })}>
            <option value="">Como: {myName}</option>
            {myChars.map((c) => <option key={c.id} value={c.id}>Como: {c.name}</option>)}
          </select>
        </div>
        <div className="row">
          <textarea
            className="input"
            placeholder="Mensagem, /r 2d6+3, /gr, /w nome, /me…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              } else if (e.key === "ArrowUp" && !text.includes("\n") && history.current.length) {
                e.preventDefault();
                histPos.current = Math.min(histPos.current + 1, history.current.length - 1);
                setText(history.current[histPos.current]);
              } else if (e.key === "ArrowDown" && histPos.current >= 0) {
                e.preventDefault();
                histPos.current -= 1;
                setText(histPos.current >= 0 ? history.current[histPos.current] : "");
              }
            }}
          />
          <button className="icon-btn" onClick={sendText} title="Enviar">
            <Icon name="send" />
          </button>
        </div>
      </div>
    </div>
  );
}
