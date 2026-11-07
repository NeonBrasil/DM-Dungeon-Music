// Estado do criador Nightfall e conversão para os dados da ficha (e de volta, para atualizar depois).
import {
  ATTRS, CLASSES, ERAS, ORIGINS, RACES, allTraits, baseCa, destinyMax, findByName, hpMax, manaMax, mod, sumEffects, totalPoints,
  trainBonus, traitLine, xpNext, type Attr,
} from "./rules.ts";
import { NATIONS, factionName } from "./world.ts";

type Row = Record<string, unknown>;

export interface NfState {
  nome: string;
  jogador: string;
  avatar?: string;
  raca: string;   // id em RACES
  classe: string; // id em CLASSES
  origem: string; // id em ORIGINS ("" = não escolhida, ex.: ficha antiga importada)
  era: string;    // id em ERAS (só para "chegado")
  eraOutra: string; // nome da época quando era = "outra"
  nacao: string;    // id em NATIONS (nativo: onde nasceu; chegado: onde vive agora)
  faccao: string;   // id dentro da nação ("" = nenhuma)
  faccaoOutra: string; // facção escrita à mão (nações com facções demais para listar, ex.: Grokkar)
  nivel: number;
  xp: number;
  alinhamento: string;
  antecedente: string;
  idade: string;
  peso: string;
  atributos: Record<Attr, number>;
  // guardamos o que foi gasto, não o atual: subir de nível ou mexer em CON mantém o dano levado
  dano: number;
  manaGasta: number;
  destinoGasto: number;
  caBonus: number;
  cicatrizes: { name: string; efeito: string }[];
  inventario: string;
  magias: string;
  fraquezasExtra: string;
  ideais: string;
  tracos: string;
  historia: string;
}

const EIGHTS = (): Record<Attr, number> => ({ for: 8, des: 8, con: 8, int: 8, sab: 8, car: 8, sor: 8 });

export function newState(): NfState {
  return {
    nome: "", jogador: "", raca: "", classe: "", origem: "", era: "", eraOutra: "", nacao: "", faccao: "", faccaoOutra: "", nivel: 1, xp: 0, alinhamento: "Neutro", antecedente: "", idade: "", peso: "",
    atributos: EIGHTS(), dano: 0, manaGasta: 0, destinoGasto: 0, caBonus: 0, cicatrizes: [],
    inventario: "", magias: "", fraquezasExtra: "", ideais: "", tracos: "", historia: "",
  };
}

/** Trocar de raça recomeça os atributos pela base dela e solta a classe se for proibida (como no criador antigo). */
export function pickRace(s: NfState, raca: string): NfState {
  const r = RACES[raca];
  if (!r) return s;
  return { ...s, raca, atributos: { ...r.base }, classe: r.proibidas.includes(s.classe) ? "" : s.classe };
}

export function derived(s: NfState) {
  const base = RACES[s.raca]?.base ?? EIGHTS();
  const spent = ATTRS.reduce((n, a) => n + s.atributos[a] - base[a], 0);
  // vantagens e fraquezas (raça, origem, era) com efeito nos números
  const fx = sumEffects(allTraits(s.raca, s.origem, s.era));
  const hp = Math.max(1, hpMax(s.nivel, s.atributos.con) + fx.pv);
  const baseMana = manaMax(s.nivel, s.classe, s.atributos);
  const mana = baseMana > 0 ? Math.max(0, baseMana + fx.mana) : 0;
  const destino = Math.max(0, destinyMax(s.nivel, s.atributos.sor) + fx.destino);
  return {
    base,
    fx,
    pontos: totalPoints(s.nivel),
    livres: totalPoints(s.nivel) - spent,
    hpMax: hp,
    hp: Math.max(0, hp - s.dano),
    manaMax: mana,
    mana: Math.max(0, mana - s.manaGasta),
    destinoMax: destino,
    destino: Math.max(0, destino - s.destinoGasto),
    ca: baseCa(s.atributos.des) + s.caBonus + fx.ca,
    init: mod(s.atributos.des) + fx.init,
    bt: trainBonus(s.nivel),
    xpNext: xpNext(s.nivel),
  };
}

/** Habilidades da classe liberadas até o nível (linhas marcadas como auto: o criador as refaz a cada atualização). */
export function classAbilities(classe: string, nivel: number): Row[] {
  const c = CLASSES[classe];
  if (!c) return [];
  return c.habilidades.filter((h) => h.nivel <= nivel).map((h) => ({
    auto: true,
    name: h.nivel > 1 ? `${h.nome} (nv ${h.nivel})` : h.nome,
    custo: h.custo,
    efeito: h.efeito,
    teste: h.teste ?? "",
    dano: typeof h.dano === "function" ? h.dano(nivel) : h.dano ?? "",
  }));
}

/** "Chegado · Grandes Guerras" / "Nativo da Terra Inferior (Oca)". */
export function originLabel(s: Pick<NfState, "origem" | "era" | "eraOutra">): string {
  const o = ORIGINS[s.origem];
  if (!o) return "";
  if (s.origem !== "chegado") return o.nome;
  const era = s.era === "outra" ? s.eraOutra.trim() || ERAS.outra.nome : ERAS[s.era]?.nome;
  return era ? `Chegado · ${era}` : o.nome;
}

/** Vantagens (+) e fraquezas (−) da origem e da era, para a ficha. */
function originText(s: NfState): string {
  const o = ORIGINS[s.origem];
  if (!o) return "";
  const lines = [originLabel(s)];
  for (const src of [o, s.origem === "chegado" ? ERAS[s.era] : undefined]) {
    for (const v of src?.vantagens ?? []) lines.push(`+ ${traitLine(v)}`);
    for (const v of src?.fraquezas ?? []) lines.push(`− ${traitLine(v)}`);
  }
  return lines.join("\n");
}

/** Dados da ficha "nightfall". Parte dos dados anteriores para não perder ataques, anotações e afins. */
export function toData(s: NfState, prev: Record<string, unknown> = {}): Record<string, unknown> {
  const d = derived(s);
  const race = RACES[s.raca];
  const cls = CLASSES[s.classe];
  const out: Record<string, unknown> = {
    ...prev,
    jogador: s.jogador, raca: race?.nome ?? String(prev.raca ?? ""), classe: cls?.nome ?? String(prev.classe ?? ""),
    nivel: s.nivel, xp: s.xp, alinhamento: s.alinhamento, antecedente: s.antecedente, idade: s.idade, peso: s.peso,
    ...s.atributos,
    hp: d.hp, hp_max: d.hpMax, mana: d.mana, mana_max: d.manaMax, destino: d.destino, destino_max: d.destinoMax,
    ca_bonus: s.caBonus,
    ca_traits: d.fx.ca,
    init_traits: d.fx.init,
    origem: originLabel(s) || String(prev.origem ?? ""),
    nacao: NATIONS[s.nacao]?.nome ?? String(prev.nacao ?? ""),
    faccao: factionName(s.nacao, s.faccao, s.faccaoOutra),
    tracos_origem: originText(s) || String(prev.tracos_origem ?? ""),
    conj_mod: `@{${cls?.chave ?? "int"}_mod}`,
    deslocamento: race?.desloc ?? prev.deslocamento ?? "9 m",
    habilidades: [...classAbilities(s.classe, s.nivel), ...((prev.habilidades as Row[] | undefined) ?? []).filter((r) => !r.auto)],
    cicatrizes: s.cicatrizes,
    attacks: prev.attacks ?? [],
    tracos_raca: race ? race.vantagens.map(traitLine).join("\n") : String(prev.tracos_raca ?? ""),
    fraquezas_raca: race ? race.fraquezas.map(traitLine).join("\n") : String(prev.fraquezas_raca ?? ""),
    fraquezas: s.fraquezasExtra, inventario: s.inventario, magias: s.magias, ideais: s.ideais, tracos: s.tracos, historia: s.historia,
    nf_raca: s.raca, nf_classe: s.classe, nf_origem: s.origem, nf_era: s.era, nf_era_outra: s.eraOutra, nf_nacao: s.nacao, nf_faccao: s.faccao, nf_faccao_outra: s.faccaoOutra,
  };
  for (const a of ATTRS) {
    out[`save_${a}_prof`] = cls?.resist.includes(a) ? 1 : 0;
    out[`save_${a}_extra`] = d.fx.res[a];
  }
  return out;
}

const num = (v: unknown, def = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== undefined && v !== null ? Number(v) : def);
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Lê uma ficha "nightfall" de volta para o criador. */
export function fromData(name: string, avatar: string | undefined, data: Record<string, unknown>): NfState {
  const raca = RACES[str(data.nf_raca)] ? str(data.nf_raca) : findByName(RACES, str(data.raca));
  const classe = CLASSES[str(data.nf_classe)] ? str(data.nf_classe) : findByName(CLASSES, str(data.classe));
  const atributos = EIGHTS();
  for (const a of ATTRS) atributos[a] = num(data[a], RACES[raca]?.base[a] ?? 8);
  return {
    nome: name, jogador: str(data.jogador), avatar, raca, classe,
    origem: ORIGINS[str(data.nf_origem)] ? str(data.nf_origem) : "",
    era: ERAS[str(data.nf_era)] ? str(data.nf_era) : "",
    eraOutra: str(data.nf_era_outra),
    nacao: NATIONS[str(data.nf_nacao)] ? str(data.nf_nacao) : "",
    faccao: NATIONS[str(data.nf_nacao)]?.faccoes[str(data.nf_faccao)] ? str(data.nf_faccao) : "",
    faccaoOutra: str(data.nf_faccao_outra),
    nivel: Math.max(1, Math.min(20, num(data.nivel, 1))), xp: num(data.xp),
    alinhamento: str(data.alinhamento) || "Neutro", antecedente: str(data.antecedente), idade: str(data.idade), peso: str(data.peso),
    atributos,
    dano: Math.max(0, num(data.hp_max) - num(data.hp)),
    manaGasta: Math.max(0, num(data.mana_max) - num(data.mana)),
    destinoGasto: Math.max(0, num(data.destino_max) - num(data.destino)),
    caBonus: num(data.ca_bonus),
    cicatrizes: ((data.cicatrizes as Row[] | undefined) ?? []).map((r) => ({ name: str(r.name), efeito: str(r.efeito) })),
    inventario: str(data.inventario), magias: str(data.magias), fraquezasExtra: str(data.fraquezas),
    ideais: str(data.ideais), tracos: str(data.tracos), historia: str(data.historia),
  };
}
