// Baralhos: criar (comum, tarô, personalizado), comprar, dar cartas, jogar na mesa e a mão de cada um.
import { useMemo, useRef, useState } from "react";
import type { Card, Deck } from "../../shared/types.ts";
import type { C2S } from "../../shared/protocol.ts";
import { api, game, send, uploadFile, useColl } from "../game.ts";
import { EditField } from "../ui/EditField.tsx";
import { Icon } from "../ui/Icon.tsx";
import { toast } from "../ui/Toast.tsx";
import { Modal } from "../ui/Window.tsx";
import { cardUrl, customDeck, standardDeck, tarotDeck } from "./board/cards.ts";
import { boardCenter, useViewPage } from "./ui.ts";

type DeckMsg = Omit<Extract<C2S, { t: "deck" }>, "t" | "deckId">;

function addDeck(deck: Deck) {
  api.create("decks", deck);
  send({ t: "deck", op: "shuffle", deckId: deck.id });
}

/** Onde a carta cai na mesa: centro da visão, com um leve espalhamento. */
function tableSpot(gs: number, cols: number, rows: number): { x: number; y: number } {
  const [cx, cy] = boardCenter.get() ?? [(cols * gs) / 2, (rows * gs) / 2];
  const j = () => (Math.random() - 0.5) * gs * 0.6;
  return { x: Math.round(cx - gs * 0.7 + j()), y: Math.round(cy - gs + j()) };
}

export function Cards() {
  const decks = useColl("decks");
  const gm = game.use((s) => s.role) === "gm";
  const [custom, setCustom] = useState(false);
  const list = useMemo(() => Object.values(decks).sort((a, b) => a.name.localeCompare(b.name)), [decks]);
  return (
    <div className="side-scroll">
      {gm && (
        <div className="row wrap">
          <span className="muted small">Novo baralho:</span>
          <button className="btn small" onClick={() => addDeck(standardDeck())}>Comum (54)</button>
          <button className="btn small" onClick={() => addDeck(tarotDeck())}>Tarô (22)</button>
          <button className="btn small" onClick={() => setCustom(true)}>Personalizado…</button>
        </div>
      )}
      {list.length === 0 && <div className="empty">{gm ? "Nenhum baralho ainda." : "O mestre ainda não criou baralhos."}</div>}
      {list.map((d) => <DeckBox key={d.id} deck={d} />)}
      {!gm && list.length > 0 && <div className="drop-hint">Arraste uma carta da mão para o tabuleiro. Duplo clique na carta da mesa vira ela.</div>}
      {custom && <CustomDeck onClose={() => setCustom(false)} />}
    </div>
  );
}

function DeckBox({ deck }: { deck: Deck }) {
  const gm = game.use((s) => s.role) === "gm";
  const me = game.use((s) => s.playerId) ?? "gm";
  const players = useColl("players");
  const page = useViewPage();
  const [sel, setSel] = useState<{ owner: string; cardId: string } | null>(null);
  const op = (o: DeckMsg) => send({ t: "deck", deckId: deck.id, ...o });
  const spot = () => (page ? { pageId: page.id, ...tableSpot(page.gridSize, page.cols, page.rows) } : {});
  const who = (id: string) => (id === "gm" ? "Mestre" : players[id]?.name ?? "?");
  const pile = gm ? deck.pile.length : deck.pileCount ?? 0;
  const counts = gm ? Object.fromEntries(Object.entries(deck.hands).map(([k, v]) => [k, v.length])) : deck.handCounts ?? {};
  const others = Object.entries(counts).filter(([k, n]) => k !== me && n > 0);
  // mestre vê todas as mãos; jogador, só a dele
  const hands: [string, string[]][] = gm
    ? [[me, deck.hands[me] ?? []], ...Object.entries(deck.hands).filter(([k, v]) => k !== me && v.length)]
    : [[me, deck.hands[me] ?? []]];
  const selCard = sel ? deck.cards.find((c) => c.id === sel.cardId) : undefined;
  const act = (o: DeckMsg) => {
    op(o);
    setSel(null);
  };

  return (
    <div className="deck-box">
      <div className="row">
        <img className="deck-back" src={cardUrl(deck)} alt="" />
        <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
          {gm ? <EditField value={deck.name} onCommit={(v) => api.update("decks", deck.id, { name: v || "Baralho" })} /> : <b>{deck.name}</b>}
          <span className="muted small">
            Monte {pile} · Descarte {deck.discard.length}
            {others.length > 0 && <> · {others.map(([k, n]) => `${who(k)} ${n}`).join(", ")}</>}
          </span>
        </div>
        {gm && (
          <button className="icon-btn small" title="Apagar baralho" onClick={() => confirm(`Apagar o baralho "${deck.name}"? As cartas na mesa somem.`) && api.remove("decks", deck.id)}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
      <div className="row wrap">
        <button className="btn small" disabled={!pile} onClick={() => op({ op: "draw" })} title="Pega a carta do topo para a sua mão">Comprar</button>
        <button className="btn small" disabled={!pile} onClick={() => op({ op: "drawTable", faceUp: true, ...spot() })} title="Vira a carta do topo na mesa">Na mesa</button>
        {gm && (
          <select className="input small" style={{ width: "auto" }} value="" disabled={!pile} onChange={(e) => e.target.value && op({ op: "draw", to: e.target.value })} title="Dá a carta do topo para um jogador">
            <option value="">Dar para…</option>
            {Object.values(players).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {gm && <button className="btn small" onClick={() => op({ op: "shuffle" })} title="Devolve o descarte ao monte e embaralha">Embaralhar</button>}
        {gm && <button className="btn small" onClick={() => op({ op: "reset" })} title="Recolhe tudo (mesa, mãos e descarte) e embaralha">Recolher</button>}
      </div>
      {hands.map(([owner, ids]) => (
        <div key={owner} className="hand">
          <span className="muted small">{owner === me ? "Sua mão" : `Mão de ${who(owner)}`} ({ids.length})</span>
          {ids.length > 0 && (
            <div className="hand-cards">
              {ids.map((id) => {
                const c = deck.cards.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <img
                    key={id}
                    src={cardUrl(deck, c)}
                    title={c.name}
                    alt={c.name}
                    className={sel?.cardId === id ? "active" : ""}
                    draggable={owner === me}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-dm-card", JSON.stringify({ deckId: deck.id, cardId: id }));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setSel(sel?.cardId === id ? null : { owner, cardId: id })}
                  />
                );
              })}
            </div>
          )}
          {sel && selCard && sel.owner === owner && (
            <div className="col" style={{ gap: 6 }}>
              <b className="small">{selCard.name}</b>
              {selCard.text && <span className="small muted">{selCard.text}</span>}
              <div className="row wrap">
                {owner === me && <button className="btn small" onClick={() => act({ op: "play", cardId: sel.cardId, faceUp: true, ...spot() })}>Jogar</button>}
                {owner === me && <button className="btn small" onClick={() => act({ op: "play", cardId: sel.cardId, faceUp: false, ...spot() })}>Jogar virada</button>}
                {owner === me && <button className="btn small" onClick={() => act({ op: "show", cardId: sel.cardId })}>Mostrar no chat</button>}
                <button className="btn small" onClick={() => act({ op: "discard", cardId: sel.cardId, to: owner })}>Descartar</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CustomDeck({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("Meu baralho");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const imgs = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);

  const create = async () => {
    const cards: Omit<Card, "id">[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const i = t.indexOf("|");
      cards.push(i < 0 ? { name: t } : { name: t.slice(0, i).trim(), text: t.slice(i + 1).trim() });
    }
    if (!cards.length && !files.length) return toast("Adicione ao menos uma carta.");
    setBusy(true);
    try {
      for (const f of files) cards.push({ name: f.name.replace(/\.[^.]+$/, ""), image: await uploadFile(f, f.name) });
      const deck = customDeck(name.trim() || "Baralho", cards);
      if (back) deck.back = await uploadFile(back, back.name);
      addDeck(deck);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Baralho personalizado" onClose={onClose}>
      <label className="field"><span>Nome</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">
        <span>Cartas de texto — uma por linha, "Nome | descrição"</span>
        <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Emboscada | 1d4 goblins atacam\nTesouro | 2d6 x 10 po\nNada acontece"} />
      </label>
      <div className="row wrap">
        <button className="btn small" onClick={() => imgs.current?.click()}><Icon name="upload" size={14} /> Cartas com imagem</button>
        <span className="muted small">{files.length ? `${files.length} imagem(ns)` : "uma carta por imagem"}</span>
        <input ref={imgs} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </div>
      <div className="row wrap">
        <button className="btn small" onClick={() => backInput.current?.click()}><Icon name="upload" size={14} /> Verso</button>
        <span className="muted small">{back ? back.name : "opcional"}</span>
        <input ref={backInput} type="file" accept="image/*" hidden onChange={(e) => setBack(e.target.files?.[0] ?? null)} />
      </div>
      <div className="row">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={create}>{busy ? "Enviando…" : "Criar e embaralhar"}</button>
      </div>
    </Modal>
  );
}
