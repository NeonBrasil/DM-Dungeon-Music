// Compêndio: bestiário e itens (D&D 5e e Star Wars) só para o mestre; magias D&D 5e para todos.
// Mestre arrasta monstros para o mapa (cria a ficha de criatura e um token com vida própria)
// e entrega itens às fichas; todos podem ler e mandar magias para o chat/ficha.
import { useEffect, useMemo, useState } from "react";
import type { Character } from "../../shared/types.ts";
import { COMP_SYSTEMS, type CompSystem, type Item, type Monster } from "../../shared/compendium.ts";
import { api, game, useColl } from "../game.ts";
import { canControl, ui } from "../table/ui.ts";
import { Icon } from "../ui/Icon.tsx";
import { Window } from "../ui/Window.tsx";
import { toast } from "../ui/Toast.tsx";
import { findTemplate } from "../sheets/templates.ts";
import { CREDIT, fmtMod, loadItems, loadMonsters, loadSpells, monsterCharacter, SPELL_CREDIT, type SrdSpell } from "./srd.ts";

const CR_STEPS = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const crValue = (s: string) => (s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : Number(s));

type Tab = "monsters" | "items" | "spells";

export function openSrd(key: string) {
  ui.set((s) => ({ srd: s.srd.includes(key) ? s.srd : [...s.srd, key] }));
}
const closeSrd = (key: string) => ui.set((s) => ({ srd: s.srd.filter((k) => k !== key) }));

/** Cria (uma vez) a ficha de criatura do monstro e devolve o id. */
export function ensureMonsterSheet(m: Monster, sys: CompSystem): string {
  const found = Object.values(game.get().colls.characters).find((c) => c.data.srd === m.id);
  if (found) return found.id;
  const ch = monsterCharacter(m, sys);
  api.create("characters", ch);
  return ch.id;
}

/** Carrega uma lista do servidor (por sistema) e guarda enquanto o painel existe. */
function useList<T>(load: (sys: CompSystem) => Promise<T[]>, sys: CompSystem, on: boolean): T[] | null {
  const [lists, setLists] = useState<Partial<Record<CompSystem, T[]>>>({});
  useEffect(() => {
    if (on && !lists[sys]) load(sys).then((l) => setLists((s) => ({ ...s, [sys]: l }))).catch(() => toast("Não foi possível carregar o compêndio."));
  }, [on, sys]);
  return lists[sys] ?? null;
}

export function Compendium() {
  const gm = game.use((s) => s.role) === "gm";
  const [tabPick, setTab] = useState<Tab>("monsters");
  const tab: Tab = gm ? tabPick : "spells"; // jogadores só veem as magias
  const [sys, setSysState] = useState<CompSystem>(() => (localStorage.getItem("dm.comp.sys") === "sw" ? "sw" : "dnd"));
  const setSys = (s: CompSystem) => {
    localStorage.setItem("dm.comp.sys", s);
    setSysState(s);
  };
  const [q, setQ] = useState("");
  const [crMin, setCrMin] = useState("0");
  const [crMax, setCrMax] = useState("30");
  const [group, setGroup] = useState("all");
  const [cat, setCat] = useState("all");
  const [level, setLevel] = useState("all");
  const monsters = useList(loadMonsters, sys, gm && tab === "monsters");
  const items = useList(loadItems, sys, gm && tab === "items");
  const [spells, setSpells] = useState<SrdSpell[] | null>(null);

  useEffect(() => {
    if (tab === "spells" && !spells) loadSpells().then(setSpells);
  }, [tab]);
  useEffect(() => {
    setGroup("all");
    setCat("all");
  }, [sys]);

  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => [...new Set((monsters ?? []).map((m) => m.group).filter((g): g is string => !!g))], [monsters]);
  const cats = useMemo(() => [...new Set((items ?? []).map((i) => i.cat))], [items]);
  const mList = useMemo(() => (monsters ?? [])
    .filter((m) => (!needle || m.name.toLowerCase().includes(needle) || m.type.includes(needle))
      && m.crNum >= crValue(crMin) && m.crNum <= crValue(crMax) && (group === "all" || m.group === group))
    .sort((a, b) => a.crNum - b.crNum || a.name.localeCompare(b.name)), [monsters, needle, crMin, crMax, group]);
  const iList = useMemo(() => (items ?? [])
    .filter((i) => (!needle || i.name.toLowerCase().includes(needle) || (i.sub ?? "").toLowerCase().includes(needle)) && (cat === "all" || i.cat === cat))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name)), [items, needle, cat]);
  const sList = useMemo(() => (spells ?? [])
    .filter((s) => (!needle || s.name.toLowerCase().includes(needle) || s.classes.some((c) => c.toLowerCase().includes(needle))) && (level === "all" || s.level === Number(level)))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)), [spells, needle, level]);

  return (
    <div className="side-scroll">
      {gm && (
        <>
          <div className="seg small" style={{ alignSelf: "flex-start" }}>
            <button className={tab === "monsters" ? "on" : ""} onClick={() => setTab("monsters")}>Bestiário</button>
            <button className={tab === "items" ? "on" : ""} onClick={() => setTab("items")}>Itens</button>
            <button className={tab === "spells" ? "on" : ""} onClick={() => setTab("spells")}>Magias</button>
          </div>
          {tab !== "spells" && (
            <div className="seg small" style={{ alignSelf: "flex-start" }}>
              {COMP_SYSTEMS.map(([id, label]) => <button key={id} className={sys === id ? "on" : ""} onClick={() => setSys(id)}>{label}</button>)}
            </div>
          )}
        </>
      )}
      {!gm && <h4 className="section-title" style={{ margin: 0 }}>Magias (D&amp;D 5e)</h4>}
      <input
        className="input"
        placeholder={tab === "monsters" ? (sys === "dnd" ? "Buscar (nome em inglês ou tipo)…" : "Buscar (nome ou tipo)…") : tab === "items" ? "Buscar item…" : "Buscar (nome ou classe)…"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {tab === "monsters" && (
        <>
          {groups.length > 0 && (
            <select className="input small" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">Todas as pastas</option>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
          )}
          <div className="row small muted">
            ND
            <select className="input small" value={crMin} onChange={(e) => setCrMin(e.target.value)}>{CR_STEPS.map((c) => <option key={c}>{c}</option>)}</select>
            até
            <select className="input small" value={crMax} onChange={(e) => setCrMax(e.target.value)}>{CR_STEPS.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <span className="small muted">Só você vê. Arraste para o mapa: cria a ficha e um token com vida própria.</span>
        </>
      )}
      {tab === "items" && (
        <>
          <select className="input small" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">Todas as pastas</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
          <span className="small muted">Só você vê. Clique para ver e entregar a uma ficha.</span>
        </>
      )}
      {tab === "spells" && (
        <select className="input small" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">Todos os níveis</option>
          <option value="0">Truques</option>
          {Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1}º círculo</option>)}
        </select>
      )}
      <div className="list">
        {((tab === "monsters" && !monsters) || (tab === "items" && !items) || (tab === "spells" && !spells)) && <div className="empty">Carregando…</div>}
        {tab === "monsters" && mList.slice(0, 200).map((m) => (
          <div
            key={m.id}
            className="list-item"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("application/x-dm-monster", `${sys}:${m.id}`)}
            onClick={() => openSrd(`m:${sys}:${m.id}`)}
          >
            <div className="thumb small-cr">{m.cr}</div>
            <div className="name">{m.name}<div className="small muted">{m.size} · {m.type}</div></div>
          </div>
        ))}
        {tab === "items" && iList.slice(0, 300).map((i) => (
          <div key={i.id} className="list-item" onClick={() => openSrd(`i:${sys}:${i.id}`)}>
            <div className="thumb small-cr"><Icon name={i.dmg && i.abil ? "swords" : i.ac ? "square" : "cards"} size={15} /></div>
            <div className="name">{i.name}<div className="small muted">{[i.sub ?? i.cat, i.cost].filter(Boolean).join(" · ")}</div></div>
          </div>
        ))}
        {tab === "spells" && sList.slice(0, 200).map((s) => (
          <div key={s.id} className="list-item" onClick={() => openSrd(`s:${s.id}`)}>
            <div className="thumb small-cr">{s.level || "T"}</div>
            <div className="name">{s.name}<div className="small muted">{s.school}{s.concentration ? " · concentração" : ""}{s.ritual ? " · ritual" : ""}</div></div>
          </div>
        ))}
      </div>
      <span className="small muted" style={{ fontSize: 11 }}>{tab === "spells" ? SPELL_CREDIT : CREDIT[sys]}</span>
    </div>
  );
}

// ─── Janelas de bloco de estatísticas / item / magia ─────────────────────────

/** k: "m:<sistema>:<id>" (monstro), "i:<sistema>:<id>" (item) ou "s:<id>" (magia). */
export function SrdWindow({ k }: { k: string }) {
  const [item, setItem] = useState<Monster | Item | SrdSpell | null>(null);
  const [kind, a, b] = k.split(":");
  const sys = a as CompSystem;
  useEffect(() => {
    const pick = (list: (Monster | Item | SrdSpell)[], id: string) => setItem(list.find((x) => x.id === id) ?? null);
    const done = kind === "m" ? loadMonsters(sys).then((l) => pick(l, b))
      : kind === "i" ? loadItems(sys).then((l) => pick(l, b))
      : loadSpells().then((l) => pick(l, a));
    done.catch(() => closeSrd(k));
  }, [k]);
  if (!item) return null;
  return (
    <Window title={item.name} width={460} height={560} onClose={() => closeSrd(k)}>
      {kind === "m" ? <MonsterBlock m={item as Monster} sys={sys} /> : kind === "i" ? <ItemBlock it={item as Item} /> : <SpellBlock s={item as SrdSpell} />}
    </Window>
  );
}

function MonsterBlock({ m, sys }: { m: Monster; sys: CompSystem }) {
  const gm = game.use((s) => s.role) === "gm";
  const rollAs = (expr: string, label: string) => api.roll(expr, { label: `${m.name}: ${label}`, gm });
  const line = (label: string, v?: string) => (v ? <div><b>{label}</b> {v}</div> : null);
  return (
    <div className="statblock">
      <i>{m.size} {m.type}, {m.alignment}{m.group ? ` · ${m.group}` : ""}</i>
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
            ensureMonsterSheet(m, sys);
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

/** Arma (tem atributo) vira linha de ataque; o resto vai para o campo de equipamento. */
function ItemBlock({ it }: { it: Item }) {
  const characters = useColl("characters");
  const templates = useColl("templates");
  const weapon = !!(it.abil && it.dmg);
  const field = weapon ? "attacks" : "equipment";
  const has = (c: Character) => findTemplate(c.template, templates).sections.some((s) => s.fields.some((f) => f.id === field));
  const targets = useMemo(() => Object.values(characters).filter(has).sort((a, b) => a.name.localeCompare(b.name)), [characters, templates, field]);
  const [target, setTarget] = useState("");
  const stats = [
    it.dmg && `${it.dmg}${it.dmgType ? ` ${it.dmgType}` : ""}`,
    it.ac && `CA ${it.ac}`,
    it.props,
  ].filter(Boolean).join(" · ");

  const give = () => {
    const ch = characters[target] ?? targets[0];
    if (!ch) return;
    if (weapon) {
      const mod = `@{${it.abil}_mod}`;
      const rows = (ch.data.attacks as Record<string, unknown>[] | undefined) ?? [];
      api.update("characters", ch.id, { "data.attacks": [...rows, { name: it.name, atk: `${mod} + @{pb}`, dmg: `${it.dmg} + ${mod}`, kind: it.dmgType ?? "" }] });
    } else {
      const prev = String(ch.data.equipment ?? "").trimEnd();
      const entry = it.ac ? `${it.name} (CA ${it.ac})` : it.name;
      api.update("characters", ch.id, { "data.equipment": prev ? `${prev}\n${entry}` : entry });
    }
    toast(`${it.name} → ${ch.name}`);
  };
  const toChat = () => {
    const desc = it.desc ? ` ${it.desc.length > 600 ? `${it.desc.slice(0, 600)}…` : it.desc}` : "";
    api.chat(`/desc ${it.name}${it.sub ? ` (${it.sub})` : ""}${stats ? ` — ${stats}.` : "."}${desc}`);
  };

  return (
    <div className="statblock">
      <i>{[it.sub ?? it.cat, it.rarity].filter(Boolean).join(", ")}</i>
      <hr />
      {it.dmg && <div><b>{weapon ? "Dano" : "Efeito"}</b> {it.dmg}{it.dmgType ? ` ${it.dmgType}` : ""}</div>}
      {it.ac && <div><b>Classe de armadura</b> {it.ac}</div>}
      {it.props && <div><b>Propriedades</b> {it.props}</div>}
      {it.cost && <div><b>Preço</b> {it.cost}</div>}
      {it.weight && <div><b>Peso</b> {it.weight}</div>}
      {it.desc && <hr />}
      {it.desc?.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
      <div className="row wrap" style={{ marginTop: 10 }}>
        {it.dmg && <button className="btn small" onClick={() => api.roll(it.dmg!, { label: `${it.name}${it.dmgType ? ` (${it.dmgType})` : ""}`, gm: true })}><Icon name="dice" size={14} /> {it.dmg}</button>}
        <button className="btn small" onClick={toChat}>Mostrar no chat</button>
      </div>
      {targets.length > 0 ? (
        <div className="row wrap" style={{ marginTop: 6 }}>
          <select className="input small" style={{ width: "auto" }} value={target || targets[0].id} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn small primary" onClick={give}>{weapon ? "Dar como ataque" : "Pôr no equipamento"}</button>
        </div>
      ) : (
        <span className="small muted">Nenhuma ficha com {weapon ? "ataques" : "campo de equipamento"} (D&amp;D 5e ou SW5e).</span>
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
