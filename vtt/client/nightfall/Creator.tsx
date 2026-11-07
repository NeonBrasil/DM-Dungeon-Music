// Criador de personagem Nightfall: tela cheia, passo a passo. Cria a ficha ou atualiza uma existente
// (subir de nível, trocar classe, cicatrizes novas…) sem perder ataques e anotações feitos na ficha.
import { useMemo, useState, type ReactNode } from "react";
import { newId } from "../../shared/util.ts";
import { initialsOf } from "../chat/Chat.tsx";
import { api, game, useColl } from "../game.ts";
import { openSheet } from "../table/ui.ts";
import { Icon } from "../ui/Icon.tsx";
import { cropAndUpload } from "../ui/ImageCrop.tsx";
import { toast } from "../ui/Toast.tsx";
import {
  ALIGNMENTS, ATTRS, ATTR_ABBR, ATTR_NAME, BACKGROUNDS, CLASSES, DEATH_RULE, DESTINY_USES, ERAS, GROUPS, LORE, ORIGINS, RACES, SCARS,
  effectLabels, mod, parseTrait, type Attr, type RaceGroup,
} from "./rules.ts";
import { classAbilities, derived, fromData, newState, originLabel, pickRace, toData, type NfState } from "./state.ts";
import { NATIONS, TERRAS, nationLabel, type Terra } from "./world.ts";

const STEPS = ["Raça", "Origem", "Classe", "Atributos", "Destino", "Persona", "História"];
const fmt = (n: number) => (n >= 0 ? `+${n}` : String(n));
const WORDS: Record<string, string> = { atq_hab: "atq. hab.", bt: "treino", nivel: "nível", conj_mod: "mod. chave" };
/** "1d20 + @{des_mod} + @{bt}" → "1d20 + DES + treino" */
const pretty = (f: string) => f.replace(/@\{(\w+)\}/g, (_, k: string) => WORDS[k] ?? ATTR_ABBR[k.replace(/_mod$/, "") as Attr] ?? k);

type Up = (patch: Partial<NfState>) => void;
type Derived = ReturnType<typeof derived>;

export function NightfallCreator({ id, initial, onClose }: { id?: string; initial?: Partial<NfState>; onClose: () => void }) {
  const ch = useColl("characters")[id ?? ""];
  const [s, setS] = useState<NfState>(() => (ch ? fromData(ch.name, ch.avatar, ch.data) : { ...newState(), ...initial }));
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const d = derived(s);
  const up: Up = (patch) => {
    setS((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  const close = () => {
    if (dirty && !confirm("Sair sem salvar as mudanças?")) return;
    onClose();
  };

  const save = () => {
    if ((!s.raca || !s.classe) && !confirm("O personagem ainda não tem raça ou classe. Salvar assim mesmo?")) return;
    const name = s.nome.trim() || "Sem nome";
    if (ch) {
      api.update("characters", ch.id, { name, ...(s.avatar !== ch.avatar ? { avatar: s.avatar } : {}), data: toData(s, ch.data) });
      toast(`${name} atualizado.`);
    } else {
      const cid = newId();
      const { role, playerId } = game.get();
      api.create("characters", {
        id: cid, name, template: "nightfall", data: toData(s), ...(s.avatar ? { avatar: s.avatar } : {}),
        controlledBy: role === "gm" ? [] : [playerId!], shared: false,
      });
      openSheet(cid);
    }
    onClose();
  };

  const warnings: string[] = [];
  if (!s.raca) warnings.push("Escolha uma raça.");
  if (!s.origem) warnings.push("Escolha a origem: nativo de Nightfall ou chegado de outro tempo.");
  if (s.origem === "chegado" && !s.era) warnings.push("Escolha de que tempo o personagem caiu.");
  if ((s.origem === "superior" || s.origem === "inferior") && !s.nacao) warnings.push("Escolha a nação onde o personagem nasceu.");
  if (!s.classe) warnings.push("Escolha uma classe.");
  if (s.raca && s.classe && RACES[s.raca].proibidas.includes(s.classe)) warnings.push(`${CLASSES[s.classe].nome} é proibido para ${RACES[s.raca].nome}.`);
  if (d.livres > 0) warnings.push(`Sobram ${d.livres} ponto(s) de atributo.`);
  if (d.livres < 0) warnings.push(`${-d.livres} ponto(s) de atributo além do permitido.`);

  const body = [
    <Origin key="o" s={s} up={up} setS={(n) => { setS(n); setDirty(true); }} editing={!!ch} />,
    <OriginStep key="t" s={s} up={up} />,
    <ClassStep key="c" s={s} up={up} />,
    <Attributes key="a" s={s} d={d} up={up} />,
    <Destiny key="d" s={s} d={d} up={up} />,
    <Persona key="p" s={s} up={up} />,
    <Story key="h" s={s} up={up} />,
  ][step];

  return (
    <div className="nf">
      <header className="nf-head">
        <div className="nf-brand">
          <span className="nf-moon" />
          <div>
            <h1>Nightfall</h1>
            <small>{ch ? `Atualizando ${ch.name}` : "Criação de personagem"}</small>
          </div>
        </div>
        <nav className="nf-steps">
          {STEPS.map((t, i) => (
            <button key={t} className={i === step ? "on" : ""} onClick={() => setStep(i)}><b>{i + 1}</b>{t}</button>
          ))}
        </nav>
        <button className="icon-btn" onClick={close} title="Fechar"><Icon name="x" size={18} /></button>
      </header>
      <div className="nf-body">
        <main className="nf-stage">{body}</main>
        <Preview s={s} d={d} warnings={warnings} />
      </div>
      <footer className="nf-foot">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="chevronLeft" size={14} /> Voltar</button>
        <span className="spacer" />
        {step < STEPS.length - 1 && <button className="btn" onClick={() => setStep(step + 1)}>Avançar <Icon name="chevronRight" size={14} /></button>}
        <button className="btn primary" onClick={save}>{ch ? "Salvar alterações" : "Criar personagem"}</button>
      </footer>
    </div>
  );
}

// ─── Passo 1: identidade e raça ─────────────────────────────────────────────

function Origin({ s, up, setS, editing }: { s: NfState; up: Up; setS: (n: NfState) => void; editing: boolean }) {
  const [group, setGroup] = useState<RaceGroup | "">("");
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const races = Object.entries(RACES).filter(([, r]) => (!group || r.grupo === group) && r.nome.toLowerCase().includes(q.toLowerCase()));
  const r = RACES[s.raca];

  const choose = (raca: string) => {
    if (raca === s.raca) return;
    if (editing && s.raca && !confirm("Trocar a raça recomeça os atributos pela base da nova raça. Continuar?")) return;
    setS(pickRace(s, raca));
  };

  return (
    <>
      <div className="row" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <button
          className="nf-avatar" title="Escolher retrato"
          style={s.avatar ? { backgroundImage: `url("${s.avatar}")` } : undefined}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async () => {
              const f = input.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                const url = await cropAndUpload(f, { aspect: 1, size: 512 });
                if (url) up({ avatar: url });
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setUploading(false);
              }
            };
            input.click();
          }}
        >
          {!s.avatar && <Icon name={uploading ? "refresh" : "image"} size={26} />}
        </button>
        <div className="col grow" style={{ minWidth: 220 }}>
          <label className="field"><span>Nome do personagem</span>
            <input className="input nf-big" value={s.nome} placeholder="Ex.: Mirela, a Última Vela" onChange={(e) => up({ nome: e.target.value })} />
          </label>
          <label className="field"><span>Jogador</span>
            <input className="input" value={s.jogador} onChange={(e) => up({ jogador: e.target.value })} />
          </label>
        </div>
      </div>

      <h2 className="nf-h">Raça</h2>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <div className="nf-chips">
          <button className={`nf-chip ${!group ? "on" : ""}`} onClick={() => setGroup("")}>Todas</button>
          {GROUPS.map(([g, label]) => <button key={g} className={`nf-chip ${group === g ? "on" : ""}`} onClick={() => setGroup(g)}>{label}</button>)}
        </div>
        <input className="input" style={{ maxWidth: 200 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="nf-grid">
        {races.map(([rid, race]) => {
          const best = [...ATTRS].sort((a, b) => race.base[b] - race.base[a]).slice(0, 2);
          return (
            <button key={rid} className={`nf-card ${s.raca === rid ? "on" : ""}`} onClick={() => choose(rid)}>
              <span className="nf-tag">{GROUPS.find(([g]) => g === race.grupo)![1]}</span>
              <b>{race.nome}</b>
              <small>{best.map((a) => `${ATTR_ABBR[a]} ${race.base[a]}`).join(" · ")} · {race.desloc}</small>
            </button>
          );
        })}
      </div>
      {r && (
        <div className="nf-detail">
          <h3>{r.nome}</h3>
          <div>
            <div className="nf-sub">Vantagens</div>
            <TraitList items={r.vantagens} />
          </div>
          <div>
            <div className="nf-sub">Fraquezas</div>
            <TraitList items={r.fraquezas} bad />
          </div>
          <div className="nf-span">
            <div className="nf-sub">Atributos base · deslocamento {r.desloc}</div>
            <div className="nf-chips">{ATTRS.map((a) => <span key={a} className="nf-chip">{ATTR_ABBR[a]} {r.base[a]}</span>)}</div>
          </div>
          {r.proibidas.length > 0 && <div className="nf-span nf-warn">Não pode ser: {r.proibidas.map((c) => CLASSES[c]?.nome ?? c).join(", ")}</div>}
        </div>
      )}
    </>
  );
}

/** Vantagens/fraquezas com o efeito nos números em destaque. */
function TraitList({ items, bad }: { items: string[]; bad?: boolean }) {
  return (
    <ul className={`nf-list ${bad ? "bad" : "good"}`}>
      {items.map((v) => {
        const { text, effect } = parseTrait(v);
        return <li key={v}>{text}{effectLabels(effect).map((l) => <span key={l} className="nf-fx">{l}</span>)}</li>;
      })}
    </ul>
  );
}

// ─── Passo 2: origem (nativo ou chegado), era, nação e facção ───────────────

function NationPicker({ s, up }: { s: NfState; up: Up }) {
  const native = s.origem === "superior" || s.origem === "inferior";
  const [tab, setTab] = useState<Terra>(native ? (s.origem as Terra) : NATIONS[s.nacao]?.terra ?? "superior");
  const terra: Terra = native ? (s.origem as Terra) : tab;
  const list = Object.entries(NATIONS).filter(([, n]) => n.terra === terra);
  const n = NATIONS[s.nacao];
  const pick = (id: string) => up({ nacao: id, faccao: "", faccaoOutra: "" });
  return (
    <>
      <h2 className="nf-h">{native ? "Sua nação" : "Onde vive agora"}</h2>
      {!native && (
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <div className="nf-chips">
            {(["superior", "inferior"] as Terra[]).map((t) => (
              <button key={t} className={`nf-chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{TERRAS[t].nome}</button>
            ))}
          </div>
          <span className="small muted">Opcional: quem acabou de cair pode ainda não ter lugar nenhum.</span>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 0 }}>{TERRAS[terra].resumo}</p>
      <div className="nf-map">
        <img src={TERRAS[terra].mapa} alt={TERRAS[terra].nome} draggable={false} />
        {list.map(([id, x]) => (
          <button key={id} className={`nf-pin ${s.nacao === id ? "on" : ""} ${x.rotulo ? "named" : ""}`} style={{ left: `${x.pos[0]}%`, top: `${x.pos[1]}%` }} title={x.nome} onClick={() => pick(id)}>
            {x.rotulo && x.nome}
          </button>
        ))}
      </div>
      <div className="nf-chips" style={{ marginTop: 10 }}>
        {list.map(([id, x]) => <button key={id} className={`nf-chip ${s.nacao === id ? "on" : ""}`} onClick={() => pick(id)}>{x.nome}</button>)}
        {s.nacao && <button className="nf-chip" onClick={() => up({ nacao: "", faccao: "", faccaoOutra: "" })}>Nenhuma</button>}
      </div>
      {n && (
        <div className="nf-detail">
          <h3>{n.nome}{n.genero && <span className="muted small"> · {n.genero}</span>}</h3>
          <p className="nf-span" style={{ margin: 0 }}>{n.resumo}</p>
          {n.detalhes && (
            <dl className="nf-span nf-dl">
              <dt>Tecnologia</dt><dd>{n.detalhes.tecnologia}</dd>
              <dt>Governo</dt><dd>{n.detalhes.governo}</dd>
              <dt>Habitantes</dt><dd>{n.detalhes.habitantes}</dd>
              <dt>Horror</dt><dd>{n.detalhes.horror}</dd>
            </dl>
          )}
          {Object.keys(n.faccoes).length > 0 && (
            <div className="nf-span">
              <div className="nf-sub">Facção</div>
              <div className="nf-chips">
                <button className={`nf-chip ${!s.faccao ? "on" : ""}`} onClick={() => up({ faccao: "" })}>Nenhuma</button>
                {Object.entries(n.faccoes).map(([fid, f]) => (
                  <button key={fid} className={`nf-chip ${s.faccao === fid ? "on" : ""}`} title={f.resumo} onClick={() => up({ faccao: fid })}>{f.nome}</button>
                ))}
              </div>
              {n.faccoes[s.faccao]?.resumo && <p className="small muted" style={{ margin: "6px 0 0" }}>{n.faccoes[s.faccao].resumo}</p>}
            </div>
          )}
          {n.faccaoLivre && (
            <label className="field nf-span">
              <span>Facção</span>
              <input className="input" value={s.faccaoOutra} placeholder={n.faccaoLivre} onChange={(e) => up({ faccaoOutra: e.target.value })} />
            </label>
          )}
        </div>
      )}
    </>
  );
}

function OriginStep({ s, up }: { s: NfState; up: Up }) {
  const o = ORIGINS[s.origem];
  const e = s.origem === "chegado" ? ERAS[s.era] : undefined;
  const missing = e ? e.equipamento.filter((x) => !s.inventario.split("\n").some((l) => l.trim() === x)) : [];
  return (
    <>
      <p className="nf-lore">{LORE}</p>
      <h2 className="nf-h">De onde você vem</h2>
      <div className="nf-grid nf-grid-wide">
        {Object.entries(ORIGINS).map(([id, x]) => (
          <button
            key={id} className={`nf-card ${s.origem === id ? "on" : ""}`}
            // nativo da Superior não pode ter nação da Inferior (e vice-versa): troca de origem solta a nação errada
            onClick={() => up({ origem: id, ...(id !== "chegado" && NATIONS[s.nacao] && NATIONS[s.nacao].terra !== id ? { nacao: "", faccao: "" } : {}) })}
          >
            <span className="nf-tag">{id === "chegado" ? "de fora" : "nativo"}</span>
            <b>{x.nome}</b>
            <small>{x.lema}</small>
          </button>
        ))}
      </div>
      {o && (
        <div className="nf-detail">
          <h3>{o.nome}</h3>
          <div><div className="nf-sub">Vantagens</div><TraitList items={o.vantagens} /></div>
          <div><div className="nf-sub">Fraquezas</div><TraitList items={o.fraquezas} bad /></div>
        </div>
      )}
      {s.origem === "chegado" && (
        <>
          <h2 className="nf-h">De que tempo você caiu</h2>
          <div className="nf-grid">
            {Object.entries(ERAS).map(([id, x]) => (
              <button key={id} className={`nf-card ${s.era === id ? "on" : ""}`} onClick={() => up({ era: id })}>
                <span className="nf-tag">{x.genero || "à sua escolha"}</span>
                <b>{x.nome}</b>
                <small>{x.periodo}</small>
              </button>
            ))}
          </div>
          {e && (
            <div className="nf-detail">
              {s.era === "outra"
                ? <input className="input nf-big nf-span" value={s.eraOutra} placeholder="Que época? Ex.: Japão feudal, Atlântida, 2099…" onChange={(ev) => up({ eraOutra: ev.target.value })} />
                : <h3>{e.nome} <span className="muted small">· {e.periodo} · {e.genero}</span></h3>}
              <p className="nf-span muted" style={{ margin: 0, fontStyle: "italic" }}>{e.lema}</p>
              {e.vantagens.length > 0 && <div><div className="nf-sub">Vantagem da era</div><TraitList items={e.vantagens} /></div>}
              {e.fraquezas.length > 0 && <div><div className="nf-sub">Fraqueza da era</div><TraitList items={e.fraquezas} bad /></div>}
              {e.equipamento.length > 0 && (
                <div className="nf-span">
                  <div className="nf-sub">Trouxe consigo</div>
                  <div className="row wrap">
                    <div className="nf-chips">{e.equipamento.map((x) => <span key={x} className="nf-chip">{x}</span>)}</div>
                    <button className="btn small" disabled={!missing.length} onClick={() => up({ inventario: [s.inventario.trim(), ...missing].filter(Boolean).join("\n") })}>
                      {missing.length ? "Pôr no inventário" : "Já está no inventário"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {s.origem && <NationPicker key={s.origem} s={s} up={up} />}
    </>
  );
}

// ─── Passo 3: classe e habilidades ──────────────────────────────────────────

function AbilityList({ classe, nivel }: { classe: string; nivel: number }) {
  return (
    <div>
      {CLASSES[classe].habilidades.map((h) => {
        const dano = typeof h.dano === "function" ? h.dano(nivel) : h.dano;
        return (
          <div key={h.nome} className={`nf-abil ${h.nivel > nivel ? "locked" : ""}`}>
            <div className="nf-lvl">Nv {h.nivel}</div>
            <div>
              <b>{h.nome}</b> <span className="muted small">· {h.custo}</span>
              {h.teste && <span className="nf-dice" title="Teste">{pretty(h.teste)}</span>}
              {dano && <span className="nf-dice" title="Dano / cura">{pretty(dano)}</span>}
            </div>
            <p>{h.efeito}</p>
          </div>
        );
      })}
    </div>
  );
}

function ClassStep({ s, up }: { s: NfState; up: Up }) {
  const race = RACES[s.raca];
  const c = CLASSES[s.classe];
  return (
    <>
      <h2 className="nf-h">Classe</h2>
      {!race && <p className="nf-warn">Escolha a raça antes: algumas classes são proibidas para certas raças.</p>}
      <div className="nf-grid">
        {Object.entries(CLASSES).map(([cid, cl]) => {
          const banned = race?.proibidas.includes(cid);
          return (
            <button key={cid} className={`nf-card ${s.classe === cid ? "on" : ""}`} disabled={banned} onClick={() => up({ classe: cid })} title={banned ? `Proibido para ${race!.nome}` : undefined}>
              <span className="nf-tag">{cl.mana ? `Mana · ${ATTR_ABBR[cl.chave]}` : `Sem mana · ${ATTR_ABBR[cl.chave]}`}</span>
              <b>{cl.nome}</b>
              <small>{banned ? `Proibido para ${race!.nome}` : cl.lema}</small>
            </button>
          );
        })}
      </div>
      {c && (
        <div className="nf-detail">
          <h3>{c.nome}</h3>
          <p className="nf-span muted" style={{ margin: 0, fontStyle: "italic" }}>{c.lema}</p>
          <div className="nf-span nf-chips">
            <span className="nf-chip">Atributo-chave: {ATTR_NAME[c.chave]}</span>
            <span className="nf-chip">{c.mana ? "Usa mana" : "Não usa mana"}</span>
            <span className="nf-chip">Resistências treinadas: {c.resist.map((a) => ATTR_ABBR[a]).join(" e ")}</span>
          </div>
          <div className="nf-span"><AbilityList classe={s.classe} nivel={s.nivel} /></div>
        </div>
      )}
    </>
  );
}

// ─── Passo 3: atributos ─────────────────────────────────────────────────────

function Attributes({ s, d, up }: { s: NfState; d: Derived; up: Up }) {
  const set = (a: (typeof ATTRS)[number], delta: number) => {
    const v = s.atributos[a] + delta;
    if (v < 1 || v > 20 || (delta > 0 && d.livres < 1)) return;
    up({ atributos: { ...s.atributos, [a]: v } });
  };
  const c = CLASSES[s.classe];
  return (
    <>
      <div className={`nf-banner ${d.livres < 0 ? "bad" : ""}`}>
        <div><span className="muted small">Pontos livres</span><br /><b>{d.livres}</b></div>
        <div className="grow small muted">
          {d.pontos} no total: 4 da criação + 1 nos níveis 3, 6, 9, 12, 15 e 18. Cada ponto vale +1; baixar um atributo devolve o ponto.
        </div>
        <button className="btn small" disabled={!s.raca} onClick={() => up({ atributos: { ...d.base } })}>Recomeçar pela base da raça</button>
      </div>
      <div className="nf-attrs">
        {ATTRS.map((a) => {
          const m = mod(s.atributos[a]);
          return (
            <div key={a} className="nf-attr">
              <h4>{ATTR_NAME[a]}</h4>
              <div className="row">
                <button className="icon-btn" disabled={s.atributos[a] <= 1} onClick={() => set(a, -1)}><Icon name="minus" size={16} /></button>
                <span className="v">{s.atributos[a]}</span>
                <button className="icon-btn" disabled={d.livres < 1 || s.atributos[a] >= 20} onClick={() => set(a, 1)}><Icon name="plus" size={16} /></button>
              </div>
              <div className={`m ${m >= 0 ? "pos" : "neg"}`}>{fmt(m)}</div>
              <div className="small muted">base {d.base[a]}</div>
            </div>
          );
        })}
      </div>
      <h2 className="nf-h">Números de combate</h2>
      <div className="nf-two">
        <Rule label="Pontos de vida" value={d.hpMax} text={`7 + mod. de Constituição, +3 por nível${d.fx.pv ? ` (traços ${d.fx.pv > 0 ? "+" : ""}${d.fx.pv})` : ""}.`} />
        <Rule label="Classe de armadura" value={d.ca} text={`10 + mod. de Destreza + bônus de armadura${d.fx.ca ? ` (traços ${d.fx.ca > 0 ? "+" : ""}${d.fx.ca})` : ""}.`} />
        <Rule label="Mana" value={c?.mana ? d.manaMax : "—"} text={c?.mana ? `3 + mod. de ${ATTR_NAME[c.chave]}, +2 por nível.` : "Só classes conjuradoras usam mana."} />
        <Rule label="Destino" value={d.destinoMax} text={`1 + mod. de Sorte (se positivo), +1 a cada 5 níveis${d.fx.destino ? ` (traços ${d.fx.destino > 0 ? "+" : ""}${d.fx.destino})` : ""}.`} />
        <Rule label="Bônus de treino" value={fmt(d.bt)} text="Soma em resistências treinadas, ataques e habilidades. Sobe a cada 4 níveis." />
        <Rule label="Testes" value="d20" text="d20 + mod. do atributo (+ treino quando couber). Vantagem: role 2d20 e fique com o maior." />
      </div>
    </>
  );
}

function Rule({ label, value, text }: { label: string; value: ReactNode; text: string }) {
  return (
    <div className="nf-box row" style={{ alignItems: "flex-start" }}>
      <b className="nf-rule-v">{value}</b>
      <div><b>{label}</b><div className="small muted">{text}</div></div>
    </div>
  );
}

// ─── Passo 4: nível, recursos, destino e cicatrizes ─────────────────────────

function Destiny({ s, d, up }: { s: NfState; d: Derived; up: Up }) {
  const [pick, setPick] = useState("");
  const level = (n: number) => up({ nivel: Math.max(1, Math.min(20, n)) });
  const pct = d.xpNext > 0 ? Math.min(100, (s.xp / d.xpNext) * 100) : 100;
  const scars = (next: NfState["cicatrizes"]) => up({ cicatrizes: next });
  return (
    <>
      <h2 className="nf-h">Nível</h2>
      <div className="row wrap" style={{ gap: 16 }}>
        <div className="row">
          <button className="icon-btn" onClick={() => level(s.nivel - 1)} disabled={s.nivel <= 1}><Icon name="minus" size={16} /></button>
          <span className="nf-level">{s.nivel}</span>
          <button className="icon-btn" onClick={() => level(s.nivel + 1)} disabled={s.nivel >= 20}><Icon name="plus" size={16} /></button>
        </div>
        <label className="field" style={{ width: 140 }}><span>XP atual</span>
          <input className="input" type="number" min={0} value={s.xp} onChange={(e) => up({ xp: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <div className="grow" style={{ minWidth: 200 }}>
          <div className="small muted">{d.xpNext > 0 ? `Próximo nível: ${d.xpNext.toLocaleString("pt-BR")} XP` : "Nível máximo"}</div>
          <div className="nf-xp"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      <h2 className="nf-h">Estado atual</h2>
      <div className="nf-attrs">
        <Current label="PV" max={d.hpMax} value={d.hp} onChange={(v) => up({ dano: d.hpMax - v })} />
        {d.manaMax > 0 && <Current label="Mana" max={d.manaMax} value={d.mana} onChange={(v) => up({ manaGasta: d.manaMax - v })} />}
        <Current label="Destino" max={d.destinoMax} value={d.destino} onChange={(v) => up({ destinoGasto: d.destinoMax - v })} />
        <div className="nf-attr">
          <h4>Bônus de armadura</h4>
          <input className="input" type="number" value={s.caBonus} onChange={(e) => up({ caBonus: Number(e.target.value) || 0 })} />
          <div className="small muted">CA final {d.ca}</div>
        </div>
      </div>

      <div className="nf-two" style={{ marginTop: 18 }}>
        <div className="nf-box">
          <b className="nf-moonlit">Pontos de Destino</b>
          <ul className="nf-list good" style={{ marginTop: 6 }}>{DESTINY_USES.map((u) => <li key={u}>{u}</li>)}</ul>
          <div className="small muted" style={{ marginTop: 6 }}>Recupera 1 por sessão. O mestre pode dar mais por cenas memoráveis.</div>
        </div>
        <div className="nf-box">
          <b className="nf-moonlit">Morte e cicatrizes</b>
          <p style={{ margin: "6px 0 0" }}>{DEATH_RULE}</p>
        </div>
      </div>

      <h2 className="nf-h">Cicatrizes</h2>
      {s.cicatrizes.length === 0 && <p className="muted small">Nenhuma cicatriz. Ainda.</p>}
      {s.cicatrizes.map((c, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <input className="input" style={{ maxWidth: 220 }} value={c.name} placeholder="Cicatriz" onChange={(e) => scars(s.cicatrizes.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
          <input className="input grow" value={c.efeito} placeholder="Efeito" onChange={(e) => scars(s.cicatrizes.map((x, k) => (k === i ? { ...x, efeito: e.target.value } : x)))} />
          <button className="icon-btn small" title="Remover" onClick={() => scars(s.cicatrizes.filter((_, k) => k !== i))}><Icon name="x" size={14} /></button>
        </div>
      ))}
      <div className="row">
        <select className="input" style={{ maxWidth: 360 }} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Tabela de cicatrizes (d20)…</option>
          {SCARS.map(([n, e], i) => <option key={n} value={i}>{i + 1}. {n} — {e}</option>)}
          <option value="custom">Outra (escrever)</option>
        </select>
        <button
          className="btn" disabled={!pick}
          onClick={() => {
            const [name, efeito] = pick === "custom" ? ["", ""] : SCARS[Number(pick)];
            scars([...s.cicatrizes, { name, efeito }]);
            setPick("");
          }}
        >
          <Icon name="plus" size={14} /> Adicionar
        </button>
      </div>
    </>
  );
}

function Current({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="nf-attr">
      <h4>{label}</h4>
      <div className="row">
        <input className="input nf-cur" type="number" min={0} max={max} value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
        <span className="muted">/ {max}</span>
      </div>
    </div>
  );
}

// ─── Passo 5 e 6: persona e história ────────────────────────────────────────

function Persona({ s, up }: { s: NfState; up: Up }) {
  const r = RACES[s.raca];
  return (
    <>
      <h2 className="nf-h">Alinhamento</h2>
      <div className="nf-align">
        {ALIGNMENTS.map((a) => <button key={a} className={`nf-chip ${s.alinhamento === a ? "on" : ""}`} onClick={() => up({ alinhamento: a })}>{a}</button>)}
      </div>
      <h2 className="nf-h">Quem é você</h2>
      <div className="nf-two">
        <label className="field"><span>Antecedente</span>
          <input className="input" list="nf-backgrounds" value={s.antecedente} placeholder="Nobre caído, Coveiro, Ex-cultista…" onChange={(e) => up({ antecedente: e.target.value })} />
          <datalist id="nf-backgrounds">{BACKGROUNDS.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <div className="row">
          <label className="field grow"><span>Idade</span><input className="input" value={s.idade} onChange={(e) => up({ idade: e.target.value })} /></label>
          <label className="field grow"><span>Peso</span><input className="input" value={s.peso} onChange={(e) => up({ peso: e.target.value })} /></label>
        </div>
        <Area label="Ideais" value={s.ideais} placeholder="O que ele defende? O que nunca faria?" onChange={(v) => up({ ideais: v })} />
        <Area label="Traços de personalidade" value={s.tracos} placeholder="Manias, jeito de falar, medos…" onChange={(v) => up({ tracos: v })} />
      </div>
      <h2 className="nf-h">Fraquezas</h2>
      {r && <div style={{ marginBottom: 10 }}><TraitList items={r.fraquezas} bad /></div>}
      <Area label="Outras fraquezas" value={s.fraquezasExtra} placeholder="Medo de altura, dívida com a guilda, vício em jogo…" onChange={(v) => up({ fraquezasExtra: v })} />
    </>
  );
}

function Story({ s, up }: { s: NfState; up: Up }) {
  return (
    <>
      <h2 className="nf-h">Bagagem</h2>
      <div className="nf-two">
        <Area label="Inventário" value={s.inventario} rows={7} placeholder={"Espada longa\nCapa de viagem\n50 peças de ouro"} onChange={(v) => up({ inventario: v })} />
        <Area label="Magias e anotações de poder" value={s.magias} rows={7} placeholder="Magias conhecidas, rituais, pactos…" onChange={(v) => up({ magias: v })} />
      </div>
      <h2 className="nf-h">História</h2>
      <Area label="" value={s.historia} rows={12} placeholder="De onde veio? O que perdeu? Por que ainda anda quando a noite cai?" onChange={(v) => up({ historia: v })} />
    </>
  );
}

function Area({ label, value, onChange, placeholder, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ─── Resumo ao lado ─────────────────────────────────────────────────────────

function Preview({ s, d, warnings }: { s: NfState; d: Derived; warnings: string[] }) {
  const race = RACES[s.raca];
  const cls = CLASSES[s.classe];
  const abilities = useMemo(() => classAbilities(s.classe, s.nivel).length, [s.classe, s.nivel]);
  return (
    <aside className="nf-preview">
      <div className="nf-portrait" style={s.avatar ? { backgroundImage: `url("${s.avatar}")` } : undefined}>{!s.avatar && initialsOf(s.nome || "?")}</div>
      <div>
        <h2 className="nf-name">{s.nome || "Sem nome"}</h2>
        <div className="muted small">{[race?.nome, cls?.nome, `Nível ${s.nivel}`].filter(Boolean).join(" · ")}</div>
        {s.origem && <div className="small nf-moonlit">{originLabel(s)}</div>}
        {s.nacao && <div className="small muted">{nationLabel(s.nacao, s.faccao, s.faccaoOutra)}</div>}
      </div>
      <div className="nf-stats">
        <Stat label="PV" value={`${d.hp}/${d.hpMax}`} />
        <Stat label="CA" value={d.ca} />
        <Stat label="Mana" value={d.manaMax ? `${d.mana}/${d.manaMax}` : "—"} />
        <Stat label="Destino" value={`${d.destino}/${d.destinoMax}`} />
        <Stat label="Treino" value={fmt(d.bt)} />
        <Stat label="Habilid." value={abilities} />
      </div>
      <div className="nf-stats" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {ATTRS.map((a) => (
          <div key={a} className="nf-stat" style={{ padding: "6px 2px" }}>
            <span>{ATTR_ABBR[a]}</span>
            <b style={{ fontSize: 15 }}>{s.atributos[a]}</b>
            <div className={`small ${mod(s.atributos[a]) >= 0 ? "pos" : "neg"}`}>{fmt(mod(s.atributos[a]))}</div>
          </div>
        ))}
      </div>
      {cls && <div className="small muted">Resistências treinadas: {cls.resist.map((a) => ATTR_NAME[a]).join(" e ")}</div>}
      {effectLabels(d.fx).length > 0 && (
        <div>
          <div className="nf-sub">Efeitos de vantagens e fraquezas</div>
          <div className="nf-chips">{effectLabels(d.fx).map((l) => <span key={l} className="nf-fx">{l}</span>)}</div>
        </div>
      )}
      {s.cicatrizes.length > 0 && <div className="small"><b>Cicatrizes:</b> {s.cicatrizes.map((c) => c.name).filter(Boolean).join(", ")}</div>}
      {warnings.map((w) => <div key={w} className="nf-warn">⚠ {w}</div>)}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="nf-stat"><span>{label}</span><b>{value}</b></div>;
}
