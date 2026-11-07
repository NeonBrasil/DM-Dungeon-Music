// Luta preparada (mestre): dois lutadores lado a lado. O ataque escolhido vai para o servidor, que rola contra a CA
// do alvo e, se acertar, já tira o PV; a barra desce e o número aparece sobre o token (Board) e aqui no painel.
import { useEffect, useRef, useState } from "react";
import { api, useColl } from "../game.ts";
import { Icon } from "../ui/Icon.tsx";
import { Window } from "../ui/Window.tsx";
import { AttackForm, type Combatant, FightLog, useCombatant } from "./AttackWindow.tsx";
import { ui, useViewPage } from "./ui.ts";

const setHp = (c: Combatant, v: number) => {
  if (c.onSheet) api.update("characters", c.ch!.id, { "data.hp": v });
  else if (c.g?.bar) api.update("graphics", c.g.id, { "bar.value": v });
};

export function FightPanel() {
  const fight = ui.use((s) => s.fight);
  const graphics = useColl("graphics");
  const characters = useColl("characters");
  const page = useViewPage();
  const [secret, setSecret] = useState(false);
  const [caFix, setCaFix] = useState<Record<string, number>>({}); // CA ajustada à mão, por lutador
  const a = useCombatant(fight?.a);
  const b = useCombatant(fight?.b);
  if (!fight) return null;

  const tokens = Object.values(graphics).filter((g) => g.kind === "token" && g.pageId === page?.id);
  const options = [
    ...tokens.map((g) => [g.id, g.name || (g.characterId && characters[g.characterId]?.name) || "Token sem nome"] as const),
    ...Object.values(characters).map((c) => [`ch:${c.id}`, `Ficha: ${c.name}`] as const),
  ];
  const pick = (side: "a" | "b", v: string) => ui.set({ fight: { ...fight, [side]: v || undefined } });
  const side = (k: "a" | "b") => {
    const ref = fight[k];
    const other = k === "a" ? fight.b : fight.a;
    return {
      me: k === "a" ? a : b, foe: k === "a" ? b : a, value: ref ?? "", options, secret,
      ca: ref && caFix[ref] !== undefined ? caFix[ref] : (k === "a" ? a : b)?.ca ?? 10,
      foeCa: other && caFix[other] !== undefined ? caFix[other] : undefined,
      onPick: (v: string) => pick(k, v),
      onCa: (v: number) => ref && setCaFix({ ...caFix, [ref]: v }),
    };
  };

  return (
    <Window title={<><Icon name="swords" size={15} /> Luta preparada</>} width={760} height={640} onClose={() => ui.set({ fight: null })}>
      <div className="fight">
        <div className="row wrap">
          <span className="small muted grow">Acerta quando o total do ataque alcança a CA do alvo — nem o 20 natural passa de uma CA maior. 1 natural sempre erra. Alcance, cobertura e condições contam sozinhos.</span>
          <label className="check small"><input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> Rolagens só para o mestre</label>
        </div>
        <div className="fight-grid">
          <Side {...side("a")} />
          <div className="fight-vs">VS</div>
          <Side {...side("b")} />
        </div>
        <FightLog names={[a?.name, b?.name]} />
      </div>
    </Window>
  );
}

function Side({ me, foe, value, options, onPick, secret, ca, foeCa, onCa }: {
  me: Combatant | null; foe: Combatant | null; value: string; options: (readonly [string, string])[]; onPick: (v: string) => void;
  secret: boolean; ca: number; foeCa: number | undefined; onCa: (v: number) => void;
}) {
  const [amount, setAmount] = useState(1);
  const float = useHpFloat(me?.hp?.value);
  if (!me) {
    return (
      <div className="fight-side">
        <FighterSelect value={value} options={options} onPick={onPick} />
      </div>
    );
  }
  const adjust = (delta: number) => me.hp && setHp(me, Math.max(0, Math.min(me.hp.max || Infinity, me.hp.value + delta)));
  const pct = me.hp && me.hp.max > 0 ? Math.max(0, Math.min(100, (me.hp.value / me.hp.max) * 100)) : 0;

  return (
    <div className="fight-side">
      <FighterSelect value={value} options={options} onPick={onPick} />
      <div className="fight-who">
        <div className="fight-pic" style={me.image ? { backgroundImage: `url("${me.image}")` } : undefined}>{!me.image && me.name.slice(0, 2)}</div>
        <div className="grow">
          <b>{me.name}</b>
          {me.hp ? (
            <div className="fight-hp">
              <div className="fight-bar"><i className={pct > 50 ? "ok" : pct > 25 ? "mid" : "low"} style={{ width: `${pct}%` }} /></div>
              <span>{me.hp.value}/{me.hp.max} PV</span>
              {float && <em key={float.key} className={`fight-float ${float.delta < 0 ? "neg" : "pos"}`}>{float.delta > 0 ? `+${float.delta}` : float.delta}</em>}
            </div>
          ) : <div className="small muted">Sem PV (a ficha não tem PV e o token não tem barra)</div>}
        </div>
      </div>
      <label className="field">
        <span>CA {me.ca === null ? "(a ficha não tem; ajuste aqui)" : "(da ficha; pode ajustar)"}</span>
        <input className="input" type="number" value={ca} onChange={(e) => onCa(Number(e.target.value) || 0)} />
      </label>
      <AttackForm key={me.key} me={me} foe={foe} secret={secret} ca={foeCa ?? (foe && foe.ca === null ? 10 : undefined)} />
      <div className="row">
        <input className="input" type="number" min={1} style={{ width: 70 }} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} />
        <button className="btn small" disabled={!me.hp} onClick={() => adjust(-amount)}>Dano</button>
        <button className="btn small" disabled={!me.hp} onClick={() => adjust(amount)}>Cura</button>
      </div>
    </div>
  );
}

function FighterSelect({ value, options, onPick }: { value: string; options: (readonly [string, string])[]; onPick: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">Escolher lutador…</option>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

/** Número que sobe e some quando o PV muda. */
function useHpFloat(hp: number | undefined) {
  const prev = useRef(hp);
  const [float, setFloat] = useState<{ delta: number; key: number } | null>(null);
  useEffect(() => {
    if (hp !== undefined && prev.current !== undefined && hp !== prev.current) setFloat({ delta: hp - prev.current, key: Date.now() });
    prev.current = hp;
  }, [hp]);
  return float;
}
