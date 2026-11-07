// Ataque pelo mapa: botão direito num token → ficha resumida do alvo (retrato, nome e condições; nada de
// inventário nem atributos) e, de quem ataca, as armas e magias da própria ficha com alcance, cobertura e
// condições já contados. É só uma prévia: o servidor refaz as contas e resolve.
import { useMemo, useState } from "react";
import {
  type Action, cantAct, conditionEdge, COVER_BONUS, COVER_LABEL, coverBetween, defaultResolve, defenseOf, fmtNum, fromMeters, rangeState,
  type RangeState, rangeText, type Resolve, type Save, SAVE_LABEL, sheetActions, tokenDistance, toMeters,
} from "../../shared/combat.ts";
import { roll } from "../../shared/dice.ts";
import type { FightRef } from "../../shared/protocol.ts";
import { applyMode, type RollMode } from "../../shared/sheet.ts";
import type { Graphic } from "../../shared/types.ts";
import { game, send, useColl } from "../game.ts";
import { findTemplate } from "../sheets/templates.ts";
import { Icon } from "../ui/Icon.tsx";
import { Window } from "../ui/Window.tsx";
import { CONDITION_BY_ID } from "./conditions.ts";
import { canControl, ui } from "./ui.ts";

/** Lutador: token da página ou ficha ("ch:" + id). Ficha dá ataques e CA; PV da ficha vinculada ou da barra do token. */
export function useCombatant(key: string | undefined) {
  const graphics = useColl("graphics");
  const characters = useColl("characters");
  const templates = useColl("templates");
  return useMemo(() => {
    if (!key) return null;
    const g: Graphic | undefined = key.startsWith("ch:") ? undefined : graphics[key];
    const ch = key.startsWith("ch:") ? characters[key.slice(3)] : g?.characterId ? characters[g.characterId] : undefined;
    if (!g && !ch) return null;
    const t = ch ? findTemplate(ch.template, templates) : null;
    const onSheet = !!ch && !g?.unlinked && ch.data.hp !== undefined && Number.isFinite(Number(ch.data.hp));
    return {
      key, g, ch, t, onSheet,
      ref: (g ? { graphicId: g.id } : { characterId: ch!.id }) as FightRef,
      name: g?.name || ch?.name || "Token",
      image: g?.src ?? ch?.avatar,
      hp: onSheet ? { value: Number(ch!.data.hp), max: Number(ch!.data.hp_max ?? ch!.data.hp) } : g?.bar ?? null,
      ca: t && ch ? defenseOf(t, ch.data) : null,
      actions: t && ch ? sheetActions(t, ch.data) : [],
      markers: g?.markers ?? [],
    };
  }, [key, graphics, characters, templates]);
}
export type Combatant = NonNullable<ReturnType<typeof useCombatant>>;

const STATE: Record<RangeState, [string, string]> = {
  melee: ["corpo a corpo", "ok"], normal: ["no alcance", "ok"], long: ["longa distância", "warn"], far: ["fora do alcance", "bad"], unknown: ["", ""],
};
const HOW_LABEL: Record<Resolve, string> = { attack: "Teste de ataque contra a CA", save: "Resistência do alvo", auto: "Acerta sozinho" };

/** Escolha da arma/magia e do jeito de resolver; manda o ataque. Usado na janela de ataque e na luta preparada. */
export function AttackForm({ me, foe, secret, ca }: { me: Combatant | null; foe: Combatant | null; secret: boolean; ca?: number }) {
  const gm = game.use((s) => s.role) === "gm";
  const graphics = useColl("graphics");
  const pages = useColl("pages");
  const settings = useColl("settings").main;
  const characters = useColl("characters");
  const [key, setKey] = useState("");
  const [how, setHow] = useState<Resolve | "">("");
  const [save, setSave] = useState<Save | "">("");
  const [mode, setMode] = useState<RollMode>("normal");
  const [bonus, setBonus] = useState(0);
  const [area, setArea] = useState<number | null>(null);
  const [toggled, setToggled] = useState<string[]>([]);
  const [force, setForce] = useState(false);
  const [custom, setCustom] = useState({ atk: "0", dmg: "1d6" });

  if (!me) return null;
  const isCustom = gm && (key === "custom" || !me.actions.length);
  const action: Action | undefined = isCustom
    ? { key: "custom", group: "", label: "Ataque", spell: false, test: { kind: "d20", expr: `1d20 + (${custom.atk || 0})` }, dmg: custom.dmg, crit: { min: 20, mult: 2 }, half: true }
    : me.actions.find((a) => a.key === key) ?? me.actions[0];

  // token de quem ataca (ficha sem token: o token dela na página do alvo)
  const aBox = me.g ?? (me.ch && foe?.g ? Object.values(graphics).find((x) => x.kind === "token" && x.characterId === me.ch!.id && x.pageId === foe.g!.pageId) : undefined);
  const page = aBox && foe?.g && aBox.pageId === foe.g.pageId ? pages[aBox.pageId] : undefined;
  const geo = page && aBox && foe?.g
    ? { dist: tokenDistance(aBox, foe.g, page, settings?.diagonal ?? "dnd"), unit: page.unit, cover: aBox.id === foe.g.id ? "none" as const : coverBetween(aBox, foe.g, page) }
    : null;
  const meters = geo ? toMeters(geo.dist, geo.unit) : null;
  const stateOf = (a: Action): RangeState => (meters === null ? "unknown" : rangeState(a.range, meters));

  const canHow = (h: Resolve) => !!action && (h === "attack" ? !!(action.test ?? action.spellTest) : h === "auto" ? !!action.dmg : true);
  const resolve: Resolve = action ? (how && canHow(how) ? how : defaultResolve(action)) : "attack";
  const saveAb: Save = (save || action?.save || "des") as Save;
  const where = action ? stateOf(action) : "unknown";
  const areaVal = area ?? (action?.area && page ? fromMeters(action.area, page.unit) : 0);

  // alvos na área (resistência / acerto automático), a partir do alvo principal
  const inArea = resolve !== "attack" && areaVal > 0 && foe?.g && page
    ? Object.values(graphics).filter((x) => {
      if (x.kind !== "token" || x.pageId !== page.id || x.id === foe.g!.id || (!gm && x.layer !== "tokens")) return false;
      const d = Math.hypot(x.x + x.w / 2 - (foe.g!.x + foe.g!.w / 2), x.y + x.h / 2 - (foe.g!.y + foe.g!.h / 2));
      return d <= (areaVal / page.scale + 0.5) * page.gridSize;
    })
    : [];
  const hitsArea = (x: Graphic) => (x.id === aBox?.id ? toggled.includes(x.id) : !toggled.includes(x.id));
  const nameOf = (x: Graphic) => x.name || (x.characterId && characters[x.characterId]?.name) || "Token";

  // vantagens/desvantagens que o servidor também vai contar
  const edge = conditionEdge(me.markers, foe?.markers ?? [], meters);
  if (where === "long") edge.dis.push("longa distância");
  const test = action?.test ?? action?.spellTest;
  const coverB = geo ? COVER_BONUS[geo.cover] : 0;
  const net = Math.sign(edge.adv.length + (mode === "adv" ? 1 : 0)) - Math.sign(edge.dis.length + (mode === "dis" ? 1 : 0));
  const knownCa = ca ?? foe?.ca ?? null; // jogador não vê a CA de quem não é dele
  const need = gm && resolve === "attack" && test?.kind === "d20" && knownCa !== null
    ? neededRoll(applyMode(test.expr, "normal"), knownCa + coverB - bonus - (me.t?.advantage ? 0 : net * 5))
    : null;

  // o que impede o ataque (o mestre pode ignorar)
  const turns = settings?.turns;
  const cur = turns?.open && turns.entries.length ? turns.entries[turns.current] : undefined;
  const curG = cur?.graphicId ? graphics[cur.graphicId] : undefined;
  const myTurn = !cur || (!!aBox && curG?.id === aBox.id) || (!!me.ch && curG?.characterId === me.ch.id) || (!curG && cur.name === me.name);
  const stop = cantAct(me.markers);
  const has = (a: Action) => (a.cost && me.ch ? Number(me.ch.data[a.cost.field] ?? 0) || 0 : Infinity);
  const blocks = [
    action?.cost && has(action) < action.cost.amount && `sem ${action.cost.label} (tem ${has(action)})`,
    !foe && "escolha o alvo",
    stop && `${me.name} está ${stop}`,
    me.hp && me.hp.value <= 0 && `${me.name} está com 0 PV`,
    where === "far" && `fora do alcance (${action?.rangeText ?? (action?.range ? rangeText(action.range) : "")})`,
    geo?.cover === "total" && "sem linha de visão (parede no caminho)",
    action?.qty !== undefined && action.qty <= 0 && `${action.label} acabou`,
    !gm && !myTurn && `não é a sua vez (vez de ${cur?.name})`,
    !gm && myTurn && cur && turns?.spent?.at === `${turns.round}:${cur.id}` && `você já gastou o turno (${turns.spent.what})`,
  ].filter(Boolean) as string[];
  const blocked = blocks.length > 0 && !(gm && force && foe);

  const go = () => {
    if (!foe || !action) return;
    send({
      t: "attack", from: me.ref, to: foe.ref, secret, how: resolve, mode, bonus,
      ...(isCustom ? { label: `${me.name}: Ataque`, atk: action.test?.kind === "d20" ? action.test.expr : undefined, dmg: custom.dmg } : { use: action.key }),
      ...(resolve === "save" ? { save: saveAb } : {}),
      ...(inArea.length ? { area: areaVal, also: inArea.filter(hitsArea).map((x) => ({ graphicId: x.id })) } : {}),
      ...(gm && force ? { force: true } : {}),
      ...(gm && ca !== undefined ? { ca } : {}),
    });
  };

  const groups = [...new Set(me.actions.map((a) => a.group))];
  return (
    <div className="atk-form">
      {geo && (
        <div className="atk-geo small">
          <span><Icon name="ruler" size={13} /> {fmtNum(geo.dist)} {geo.unit}</span>
          {geo.cover !== "none" && <span className={geo.cover === "total" ? "error-text" : "warn-text"}>{COVER_LABEL[geo.cover]}</span>}
        </div>
      )}
      {!me.actions.length && !gm && <div className="small muted">A ficha de {me.name} não tem armas nem magias com rolagem. Adicione na lista de Ataques (ou Magias) da ficha.</div>}
      <div className="atk-list">
        {groups.map((gr) => (
          <div key={gr}>
            <div className="atk-group">{gr}</div>
            {me.actions.filter((a) => a.group === gr).map((a) => {
              const st = STATE[stateOf(a)];
              const out = (a.qty !== undefined && a.qty <= 0) || (!!a.cost && has(a) < a.cost.amount);
              return (
                <button key={a.key} className={`atk-item ${action?.key === a.key && !isCustom ? "on" : ""} ${st[1] === "bad" || out ? "dim" : ""}`} onClick={() => { setKey(a.key); setHow(""); setArea(null); }}>
                  <b>{a.label}</b>
                  <span className="muted">
                    {a.dmg ? a.dmg.replace(/^\((.*)\)$/, "$1") : "sem dano"}
                    {a.range ? ` · ${a.rangeText ?? rangeText(a.range)}` : ""}
                    {a.qty !== undefined ? ` · ${a.qty} restante${a.qty === 1 ? "" : "s"}` : ""}
                    {a.cost ? ` · custa ${a.cost.label}` : ""}
                  </span>
                  {st[0] && <em className={`atk-badge ${st[1]}`}>{st[0]}</em>}
                </button>
              );
            })}
          </div>
        ))}
        {gm && (
          <button className={`atk-item ${isCustom ? "on" : ""}`} onClick={() => setKey("custom")}><b>Personalizado…</b><span className="muted">acerto e dano à mão</span></button>
        )}
      </div>
      {isCustom && (
        <div className="row">
          <label className="field grow"><span>Bônus de acerto</span><input className="input" value={custom.atk} onChange={(e) => setCustom({ ...custom, atk: e.target.value })} /></label>
          <label className="field grow"><span>Dano</span><input className="input" value={custom.dmg} onChange={(e) => setCustom({ ...custom, dmg: e.target.value })} /></label>
        </div>
      )}
      {action && (
        <>
          <div className="row wrap">
            <select className="input grow" value={resolve} onChange={(e) => setHow(e.target.value as Resolve)}>
              {(["attack", "save", "auto"] as const).map((h) => <option key={h} value={h} disabled={!canHow(h)}>{HOW_LABEL[h]}</option>)}
            </select>
            {resolve === "save" && (
              <select className="input" value={saveAb} onChange={(e) => setSave(e.target.value as Save)} title="Atributo da resistência">
                {(Object.keys(SAVE_LABEL) as Save[]).map((s) => <option key={s} value={s}>{SAVE_LABEL[s]}</option>)}
              </select>
            )}
          </div>
          {resolve === "save" && (
            <div className="small muted">CD {action.dc ?? 10} · {action.half ? "passou: metade do dano" : "passou: nada"}</div>
          )}
          {resolve !== "attack" && foe?.g && page && (
            <div className="atk-area">
              <label className="field"><span>Área (raio, {page.unit})</span>
                <input className="input" type="number" min={0} step={page.scale} value={areaVal} onChange={(e) => setArea(Math.max(0, Number(e.target.value) || 0))} />
              </label>
              {inArea.length > 0 && (
                <div className="atk-also small">
                  <span className="muted">Também na área:</span>
                  {inArea.map((x) => (
                    <label key={x.id} className="check"><input type="checkbox" checked={hitsArea(x)} onChange={() => setToggled(toggled.includes(x.id) ? toggled.filter((i) => i !== x.id) : [...toggled, x.id])} /> {nameOf(x)}</label>
                  ))}
                </div>
              )}
            </div>
          )}
          {resolve === "attack" && (
            <div className="row wrap">
              <div className="seg small" title="Vantagem / desvantagem escolhida (soma às das condições)">
                <button className={mode === "dis" ? "on" : ""} onClick={() => setMode(mode === "dis" ? "normal" : "dis")}>Desv.</button>
                <button className={mode === "adv" ? "on" : ""} onClick={() => setMode(mode === "adv" ? "normal" : "adv")}>Vant.</button>
              </div>
              <label className="row small" title="Bônus ou penalidade da situação">Bônus <input className="input" type="number" style={{ width: 64 }} value={bonus} onChange={(e) => setBonus(Math.trunc(Number(e.target.value) || 0))} /></label>
              {need !== null && <span className={`small ${need > 20 ? "error-text" : "muted"}`}>{need > 20 ? `Impossível: precisaria de ${need}` : need <= 2 ? "Só erra com 1 natural" : `Precisa de ${need}+ no d20`}</span>}
            </div>
          )}
          {resolve === "attack" && (edge.adv.length > 0 || edge.dis.length > 0) && (
            <div className="atk-edge small">
              {edge.adv.length > 0 && <span className="ok-text">Vantagem: {edge.adv.join(", ")}</span>}
              {edge.dis.length > 0 && <span className="warn-text">Desvantagem: {edge.dis.join(", ")}</span>}
              {edge.autoCrit && <span className="ok-text">acerto vira crítico</span>}
            </div>
          )}
        </>
      )}
      {blocks.length > 0 && (
        <div className="atk-blocks small">
          {blocks.map((b) => <span key={b} className="error-text">⛔ {b}</span>)}
          {gm && foe && <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Ignorar (mestre)</label>}
        </div>
      )}
      <button className="btn primary" disabled={!action || blocked} onClick={go}>
        <Icon name="swords" size={14} /> {foe ? `${action?.label ?? "Atacar"} → ${foe.name}` : "Escolha o alvo"}
      </button>
    </div>
  );
}

/** Quanto o d20 precisa mostrar para o total alcançar a CA; null se o bônus tiver outros dados (ex.: 1d20 + 1d4). */
export function neededRoll(atk: string, ca: number): number | null {
  const rest = atk.replace(/\b\d*d20(k[hl]?\d*)?\b/i, "0");
  if (/\dd|\bd\d/i.test(rest)) return null;
  try {
    return ca - roll(rest, () => 1).total;
  } catch {
    return null;
  }
}

/** Últimos resultados que envolvem estes lutadores (ataques, resistências e danos). */
export function FightLog({ names }: { names: (string | undefined)[] }) {
  const chat = useColl("chat");
  const known = names.filter(Boolean) as string[];
  const lines = Object.values(chat)
    .map((m) => ({ m, text: m.label ?? (m.kind === "system" ? m.text : undefined) }))
    .filter(({ m, text }) => (m.kind === "roll" || m.kind === "system") && text && known.some((n) => text.includes(n))
      && (text.includes(" → ") || text.startsWith("Dano em") || text.includes("resistência") || text.includes("protegido")))
    .sort((p, q) => p.m.ts - q.m.ts)
    .slice(-6);
  if (!lines.length) return <div className="small muted">O resultado aparece aqui, no chat e sobre os tokens.</div>;
  return (
    <div className="fight-log">
      {lines.map(({ m, text }) => (
        <div key={m.id} className={/errou|falha|falhou|Falha|Desastre/.test(text!) && !text!.includes("Dano") ? "miss" : text!.startsWith("Dano") || text!.includes("Dano em") ? "dmg" : "hit"}>
          <b>{m.roll?.total ?? ""}</b> {text}
        </div>
      ))}
    </div>
  );
}

/** Janela aberta pelo botão direito num token: o alvo resumido e o ataque de quem eu controlo. */
export function AttackWindow() {
  const st = ui.use((s) => s.attack);
  const gm = game.use((s) => s.role) === "gm";
  const graphics = useColl("graphics");
  const characters = useColl("characters");
  const [secret, setSecret] = useState(false);
  const target = st ? graphics[st.target] : undefined;
  // quem pode atacar: meus tokens na página do alvo (mestre: todos) e minhas fichas sem token lá
  const tokens = Object.values(graphics).filter((g) => g.kind === "token" && g.pageId === target?.pageId && g.id !== target?.id
    && (gm || canControl(g.controlledBy) || (!!g.characterId && canControl(characters[g.characterId]?.controlledBy))));
  const options: [string, string][] = [
    ...tokens.map((g) => [g.id, g.name || (g.characterId && characters[g.characterId]?.name) || "Token sem nome"] as [string, string]),
    ...Object.values(characters)
      .filter((c) => !gm && canControl(c.controlledBy) && !tokens.some((g) => g.characterId === c.id))
      .map((c) => [`ch:${c.id}`, `${c.name} (sem token)`] as [string, string]),
  ];
  const fromKey = st?.from && options.some(([k]) => k === st.from) ? st.from : options[0]?.[0];
  const foe = useCombatant(st?.target);
  const me = useCombatant(fromKey);
  if (!st) return null;
  const close = () => ui.set({ attack: null });
  const pct = foe?.hp && foe.hp.max > 0 ? Math.max(0, Math.min(100, (foe.hp.value / foe.hp.max) * 100)) : 0;

  return (
    <Window title={<><Icon name="swords" size={15} /> Ataque</>} width={440} height={640} onClose={close}>
      <div className="fight atk-win">
        {foe ? (
          <div className="fight-who atk-target">
            <div className="fight-pic" style={foe.image ? { backgroundImage: `url("${foe.image}")` } : undefined}>{!foe.image && foe.name.slice(0, 2)}</div>
            <div className="grow">
              <b>{foe.name}</b>
              <div className="atk-conds">
                {foe.markers.map((id) => {
                  const c = CONDITION_BY_ID.get(id.split(":")[0]);
                  return <span key={id} title={c?.label ?? id}>{c?.icon ?? "•"} {c?.label ?? id}</span>;
                })}
              </div>
              {gm && foe.hp && (
                <div className="fight-hp">
                  <div className="fight-bar"><i className={pct > 50 ? "ok" : pct > 25 ? "mid" : "low"} style={{ width: `${pct}%` }} /></div>
                  <span>{foe.hp.value}/{foe.hp.max} PV{foe.ca !== null ? ` · CA ${foe.ca}` : ""}</span>
                </div>
              )}
            </div>
          </div>
        ) : <div className="small muted">O alvo saiu do mapa.</div>}
        <label className="field">
          <span>Quem ataca</span>
          <select className="input" value={fromKey ?? ""} onChange={(e) => ui.set({ attack: { ...st, from: e.target.value } })}>
            {!options.length && <option value="">Você não tem personagem nesta página</option>}
            {options.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <AttackForm key={fromKey} me={me} foe={foe} secret={secret} />
        <label className="check small"><input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> Rolagens só para o mestre</label>
        <FightLog names={[me?.name, foe?.name]} />
      </div>
    </Window>
  );
}
