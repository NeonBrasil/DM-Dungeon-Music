// Compêndio (SRD 5.1): monstros e magias. Mestre arrasta monstros para o mapa (cria a ficha
// de criatura e um token com vida própria); todos podem ler e mandar magias para o chat/ficha.
import { useEffect, useMemo, useState } from "react";
import { api, game, useColl } from "../game.ts";
import { canControl, ui } from "../table/ui.ts";
import { Icon } from "../ui/Icon.tsx";
import { Window } from "../ui/Window.tsx";
import { toast } from "../ui/Toast.tsx";
import { findTemplate } from "../sheets/templates.ts";
import { fmtMod, loadMonsters, loadSpells, monsterCharacter, SRD_CREDIT, type SrdMonster, type SrdSpell } from "./srd.ts";

const CR_STEPS = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const crValue = (s: string) => (s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : Number(s));

export function openSrd(key: string) {
  ui.set((s) => ({ srd: s.srd.includes(key) ? s.srd : [...s.srd, key] }));
}
const closeSrd = (key: string) => ui.set((s) => ({ srd: s.srd.filter((k) => k !== key) }));

/** Cria (uma vez) a ficha de criatura do monstro e devolve o id. */
export function ensureMonsterSheet(m: SrdMonster): string {
  const found = Object.values(game.get().colls.characters).find((c) => c.data.srd === m.id);
  if (found) return found.id;
  const ch = monsterCharacter(m);
  api.create("characters", ch);
  return ch.id;
}

export function Compendium() {
  const role = game.use((s) => s.role);
  const gm = role === "gm";
  const [tab, setTab] = useState<"monsters" | "spells">("monsters");
  const [q, setQ] = useState("");
  const [crMin, setCrMin] = useState("0");
  const [crMax, setCrMax] = useState("30");
  const [level, setLevel] = useState("all");
  const [monsters, setMonsters] = useState<SrdMonster[] | null>(null);
  const [spells, setSpells] = useState<SrdSpell[] | null>(null);

  useEffect(() => {
    if (tab === "monsters" && !monsters) loadMonsters().then(setMonsters);
    if (tab === "spells" && !spells) loadSpells().then(setSpells);
  }, [tab]);

  const needle = q.trim().toLowerCase();
  const mList = useMemo(() => (monsters ?? [])
    .filter((m) => (!needle || m.name.toLowerCase().includes(needle) || m.type.includes(needle)) && m.crNum >= crValue(crMin) && m.crNum <= crValue(crMax))
    .sort((a, b) => a.crNum - b.crNum || a.name.localeCompare(b.name)), [monsters, needle, crMin, crMax]);
  const sList = useMemo(() => (spells ?? [])
    .filter((s) => (!needle || s.name.toLowerCase().includes(needle) || s.classes.some((c) => c.toLowerCase().includes(needle))) && (level === "all" || s.level === Number(level)))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)), [spells, needle, level]);

  return (
    <div className="side-scroll">
      <div className="seg small" style={{ alignSelf: "flex-start" }}>
        <button className={tab === "monsters" ? "on" : ""} onClick={() => setTab("monsters")}>Monstros</button>
        <button className={tab === "spells" ? "on" : ""} onClick={() => setTab("spells")}>Magias</button>
      </div>
      <input className="input" placeholder={tab === "monsters" ? "Buscar (nome em inglês ou tipo)…" : "Buscar (nome ou classe)…"} value={q} onChange={(e) => setQ(e.target.value)} />
      {tab === "monsters" ? (
        <div className="row small muted">
          ND
          <select className="input small" value={crMin} onChange={(e) => setCrMin(e.target.value)}>{CR_STEPS.map((c) => <option key={c}>{c}</option>)}</select>
          até
          <select className="input small" value={crMax} onChange={(e) => setCrMax(e.target.value)}>{CR_STEPS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      ) : (
        <select className="input small" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">Todos os níveis</option>
          <option value="0">Truques</option>
          {Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1}º círculo</option>)}
        </select>
      )}
      {gm && tab === "monsters" && <span className="small muted">Arraste um monstro para o mapa: cria a ficha e um token com vida própria.</span>}
      <div className="list">
        {tab === "monsters" && !monsters && <div className="empty">Carregando…</div>}
        {tab === "spells" && !spells && <div className="empty">Carregando…</div>}
        {tab === "monsters" && mList.slice(0, 200).map((m) => (
          <div
            key={m.id}
            className="list-item"
            draggable={gm}
            onDragStart={(e) => e.dataTransfer.setData("application/x-dm-monster", m.id)}
            onClick={() => openSrd(`m:${m.id}`)}
          >
            <div className="thumb small-cr">{m.cr}</div>
            <div className="name">{m.name}<div className="small muted">{m.size} · {m.type}</div></div>
          </div>
        ))}
        {tab === "spells" && sList.slice(0, 200).map((s) => (
          <div key={s.id} className="list-item" onClick={() => openSrd(`s:${s.id}`)}>
            <div className="thumb small-cr">{s.level || "T"}</div>
            <div className="name">{s.name}<div className="small muted">{s.school}{s.concentration ? " · concentração" : ""}{s.ritual ? " · ritual" : ""}</div></div>
          </div>
        ))}
      </div>
      <span className="small muted" style={{ fontSize: 11 }}>{SRD_CREDIT}</span>
    </div>
  );
}

// ─── Janelas de bloco de estatísticas / magia ────────────────────────────────

export function SrdWindow({ k }: { k: string }) {
  const [item, setItem] = useState<SrdMonster | SrdSpell | null>(null);
  const kind = k.slice(0, 1);
  const id = k.slice(2);
  useEffect(() => {
    (kind === "m" ? loadMonsters() : loadSpells()).then((list: (SrdMonster | SrdSpell)[]) => setItem(list.find((x) => x.id === id) ?? null));
  }, [k]);
  if (!item) return null;
  return (
    <Window title={item.name} width={460} height={560} onClose={() => closeSrd(k)}>
      {kind === "m" ? <MonsterBlock m={item as SrdMonster} /> : <SpellBlock s={item as SrdSpell} />}
    </Window>
  );
}

function MonsterBlock({ m }: { m: SrdMonster }) {
  const gm = game.use((s) => s.role) === "gm";
  const rollAs = (expr: string, label: string) => api.roll(expr, { label: `${m.name}: ${label}`, gm });
  const line = (label: string, v?: string) => (v ? <div><b>{label}</b> {v}</div> : null);
  return (
    <div className="statblock">
      <i>{m.size} {m.type}, {m.alignment}</i>
      <hr />
      {line("Classe de armadura", `${m.ac}${m.acNote ? ` (${m.acNote})` : ""}`)}
      <div>
        <b>Pontos de vida</b> {m.hp} ({m.hd}){" "}
        {gm && <button className="btn small" onClick={() => rollAs(m.hd.replace(/\s/g, ""), "pontos de vida")}>rolar</button>}
      </div>
      {line("Deslocamento", m.speed)}
      <hr />
      <div className="abil">
        {["FOR", "DES", "CON", "INT", "SAB", "CAR"].map((a, i) => (
          <button key={a} className="abil-cell" onClick={() => rollAs(`1d20 ${fmtMod(m.abil[i])}`, `teste de ${a}`)} title="Rolar">
            <b>{a}</b>
            <span>{m.abil[i]} ({fmtMod(m.abil[i])})</span>
          </button>
        ))}
      </div>
      <hr />
      {line("Testes de resistência", m.saves)}
      {line("Perícias", m.skills)}
      {line("Vulnerabilidades", m.vuln)}
      {line("Resistências", m.resist)}
      {line("Imunidades", m.immune)}
      {line("Imune a condições", m.condImmune)}
      {line("Sentidos", m.senses)}
      {line("Idiomas", m.languages)}
      {line("Nível de desafio", `${m.cr} (${m.xp} XP) · proficiência +${m.pb}`)}
      {m.traits.length > 0 && <hr />}
      {m.traits.map((t) => <p key={t.name}><b><i>{t.name}.</i></b> {t.desc}</p>)}
      {m.actions.length > 0 && <h4>Ações</h4>}
      {m.actions.map((a) => (
        <p key={a.name}>
          <b><i>{a.name}.</i></b> {a.desc}{" "}
          {a.atk !== undefined && <button className="btn small" onClick={() => rollAs(`1d20 + ${a.atk}`, `${a.name} (ataque)`)}>ataque</button>}{" "}
          {a.dmg && <button className="btn small" onClick={() => rollAs(a.dmg!, `${a.name} (dano)`)}>dano</button>}
        </p>
      ))}
      {m.reactions.length > 0 && <h4>Reações</h4>}
      {m.reactions.map((t) => <p key={t.name}><b><i>{t.name}.</i></b> {t.desc}</p>)}
      {m.legendary.length > 0 && <h4>Ações lendárias</h4>}
      {m.legendary.map((t) => <p key={t.name}><b><i>{t.name}.</i></b> {t.desc}</p>)}
      {gm && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small primary" onClick={() => {
            ensureMonsterSheet(m);
            toast(`Ficha de ${m.name} no diário.`);
          }}>
            <Icon name="book" size={14} /> Criar ficha
          </button>
          <span className="small muted">ou arraste da lista para o mapa</span>
        </div>
      )}
    </div>
  );
}

function SpellBlock({ s }: { s: SrdSpell }) {
  const characters = useColl("characters");
  const templates = useColl("templates");
  const mine = Object.values(characters).filter((c) => canControl(c.controlledBy)
    && findTemplate(c.template, templates).sections.some((sec) => sec.fields.some((f) => f.type === "list" && f.id === "spells")));
  const [target, setTarget] = useState("");
  const header = `${s.level ? `${s.level}º círculo` : "Truque"} de ${s.school}${s.ritual ? " (ritual)" : ""}`;
  const toChat = () => api.chat(`/desc ${s.name} — ${header}. ${s.time}, alcance ${s.range}, ${s.duration}.`);
  const addToSheet = () => {
    const ch = characters[target || mine[0]?.id];
    if (!ch) return;
    const rows = (ch.data.spells as Record<string, unknown>[] | undefined) ?? [];
    api.update("characters", ch.id, { "data.spells": [...rows, { name: s.name, level: s.level, dmg: s.dmg ?? "", notes: `${s.school} · ${s.time} · ${s.range}${s.concentration ? " · concentração" : ""}` }] });
    toast(`${s.name} adicionada a ${ch.name}.`);
  };
  return (
    <div className="statblock">
      <i>{header}</i>
      <hr />
      <div><b>Tempo de conjuração</b> {s.time}</div>
      <div><b>Alcance</b> {s.range}{s.aoe ? ` (${s.aoe})` : ""}</div>
      <div><b>Componentes</b> {s.components}{s.material ? ` (${s.material})` : ""}</div>
      <div><b>Duração</b> {s.concentration ? "Concentração, " : ""}{s.duration}</div>
      <div><b>Classes</b> {s.classes.join(", ")}</div>
      <hr />
      {s.desc.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
      {s.higher && <p><b><i>Em círculos maiores.</i></b> {s.higher}</p>}
      <div className="row wrap" style={{ marginTop: 10 }}>
        {s.dmg && <button className="btn small" onClick={() => api.roll(s.dmg!, { label: `${s.name}${s.dmgType ? ` (${s.dmgType})` : ""}` })}><Icon name="dice" size={14} /> {s.dmg}</button>}
        {game.get().role === "gm" && <button className="btn small" onClick={toChat}>Descrever no chat</button>}
        {mine.length > 0 && (
          <>
            <select className="input small" style={{ width: "auto" }} value={target} onChange={(e) => setTarget(e.target.value)}>
              {mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn small" onClick={addToSheet}>Adicionar à ficha</button>
          </>
        )}
      </div>
    </div>
  );
}
