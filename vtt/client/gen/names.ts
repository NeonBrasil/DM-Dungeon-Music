// Nomes e textos procedurais (pt-BR) para os geradores.
import type { Rng } from "./rng.ts";

type G = "m" | "f" | "mp" | "fp";
const PREP: Record<G, string> = { m: "do", f: "da", mp: "dos", fp: "das" };

export type Theme = "cripta" | "templo" | "prisao" | "covil" | "esgoto" | "mina" | "fortaleza" | "arcano";

export const THEMES: { id: Theme; label: string }[] = [
  { id: "cripta", label: "Cripta" },
  { id: "templo", label: "Templo" },
  { id: "prisao", label: "Prisão" },
  { id: "covil", label: "Covil" },
  { id: "esgoto", label: "Esgoto" },
  { id: "mina", label: "Mina" },
  { id: "fortaleza", label: "Fortaleza" },
  { id: "arcano", label: "Torre arcana" },
];

const PLACES: Record<Theme, [string, G][]> = {
  cripta: [["Cripta", "f"], ["Catacumbas", "fp"], ["Mausoléu", "m"], ["Ossuário", "m"], ["Sepulcro", "m"], ["Tumba", "f"]],
  templo: [["Templo", "m"], ["Santuário", "m"], ["Capela", "f"], ["Mosteiro", "m"], ["Abadia", "f"]],
  prisao: [["Masmorra", "f"], ["Prisão", "f"], ["Calabouço", "m"], ["Cárcere", "m"]],
  covil: [["Covil", "m"], ["Toca", "f"], ["Ninho", "m"], ["Antro", "m"]],
  esgoto: [["Esgotos", "mp"], ["Cisterna", "f"], ["Galerias", "fp"], ["Aqueduto", "m"]],
  mina: [["Minas", "fp"], ["Mina", "f"], ["Escavação", "f"], ["Veios", "mp"]],
  fortaleza: [["Fortaleza", "f"], ["Bastião", "m"], ["Forte", "m"], ["Cidadela", "f"], ["Torre", "f"]],
  arcano: [["Torre", "f"], ["Laboratório", "m"], ["Biblioteca", "f"], ["Observatório", "m"], ["Sanctum", "m"]],
};

const NOUNS: [string, G][] = [
  ["Rei", "m"], ["Rainha", "f"], ["Lich", "m"], ["Bispo", "m"], ["Bruxa", "f"], ["Dragão", "m"], ["Serpente", "f"],
  ["Corvo", "m"], ["Lua", "f"], ["Chama", "f"], ["Mago", "m"], ["Profeta", "m"], ["Barão", "m"], ["Imperatriz", "f"],
  ["Aranha", "f"], ["Lobo", "m"], ["Verme", "m"], ["Deusa", "f"], ["Ordem", "f"], ["Irmandade", "f"], ["Legião", "f"],
  ["Coroa", "f"], ["Olho", "m"], ["Mão", "f"], ["Caveira", "f"], ["Sombra", "f"], ["Eclipse", "m"], ["Abismo", "m"],
];

const ADJ: [string, string][] = [
  ["Esquecido", "Esquecida"], ["Pálido", "Pálida"], ["Rubro", "Rubra"], ["Negro", "Negra"], ["Sem Rosto", "Sem Rosto"],
  ["Louco", "Louca"], ["Afogado", "Afogada"], ["Partido", "Partida"], ["Eterno", "Eterna"], ["Maldito", "Maldita"],
  ["Faminto", "Faminta"], ["Silencioso", "Silenciosa"], ["de Ferro", "de Ferro"], ["Dourado", "Dourada"], ["Cego", "Cega"],
  ["Profano", "Profana"], ["Caído", "Caída"], ["Sangrento", "Sangrenta"], ["de Cinzas", "de Cinzas"], ["Adormecido", "Adormecida"],
];

const adj = (a: [string, string], g: G) => (g === "f" || g === "fp" ? a[1] : a[0]) + (g === "mp" || g === "fp" ? (a[0].includes(" ") ? "" : "s") : "");

const SYL_A = ["Al", "Bar", "Cal", "Dor", "El", "Fen", "Gar", "Hal", "Ir", "Kar", "Lan", "Mor", "Nor", "Or", "Pel", "Quel", "Ros", "Sel", "Tor", "Ul", "Val", "Vel", "Zan", "Bri", "Cor", "Dar", "Est", "Gri", "Mal", "Tar"];
const SYL_B = ["a", "e", "i", "o", "u", "ar", "en", "or", "ia", "an", "el", "ur", "is"];
const SYL_C = ["dor", "mar", "via", "nia", "rim", "thal", "gard", "lia", "mon", "ros", "ten", "vel", "dur", "ria", "nar", "bel", "ford", "sul"];

export function properName(rng: Rng): string {
  const n = rng.pick(SYL_A) + (rng.chance(0.6) ? rng.pick(SYL_B) : "") + rng.pick(SYL_C);
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

export interface Title { title: string; bare: string; g: G }

const ART: Record<G, string> = { m: "O", f: "A", mp: "Os", fp: "As" };
const EM: Record<G, string> = { m: "no", f: "na", mp: "nos", fp: "nas" };

export function dungeonTitle(rng: Rng, theme: Theme): Title {
  const [place, g] = rng.pick(PLACES[theme]);
  const r = rng.next();
  if (r < 0.6) {
    const [noun, ng] = rng.pick(NOUNS);
    const t = `${place} ${PREP[ng]} ${noun} ${adj(rng.pick(ADJ), ng)}`;
    return { title: t, bare: t, g };
  }
  if (r < 0.8) {
    const t = `${place} de ${properName(rng)}`;
    return { title: t, bare: t, g };
  }
  const bare = `${place} ${adj(rng.pick(ADJ), g)}`;
  return { title: `${ART[g]} ${bare}`, bare, g };
}

/** "da Cripta…", "no Forte…", "a Torre…" conforme o gênero. */
function withPrep(prep: "de" | "em" | "o", t: Title): string {
  const p = prep === "de" ? PREP[t.g] : prep === "em" ? EM[t.g] : ART[t.g].toLowerCase();
  return `${p} ${t.bare}`;
}

/** Baralho: sorteia sem repetir até esgotar a lista. */
export class Deck {
  private pools = new Map<string, string[]>();
  private rng: Rng;
  constructor(rng: Rng) {
    this.rng = rng;
  }
  draw(key: string, list: readonly string[]): string {
    let pool = this.pools.get(key);
    if (!pool || !pool.length) {
      pool = this.rng.shuffle([...list]);
      this.pools.set(key, pool);
    }
    return pool.pop()!;
  }
}

// ─── Conteúdo das salas ──────────────────────────────────────────────────────

export const ROOM_NAMES: Record<Theme, string[]> = {
  cripta: ["Câmara Funerária", "Ossuário", "Capela Mortuária", "Galeria de Nichos", "Sala dos Embalsamadores", "Antecâmara", "Cripta Menor", "Sala das Oferendas"],
  templo: ["Nave", "Altar Menor", "Sacristia", "Claustro", "Sala de Purificação", "Dormitório dos Acólitos", "Câmara do Oráculo", "Relicário"],
  prisao: ["Guarita", "Celas", "Câmara de Tortura", "Arsenal", "Refeitório dos Guardas", "Sala do Carcereiro", "Solitária", "Depósito de Correntes"],
  covil: ["Toca", "Despensa", "Ninho", "Pilha de Ossos", "Poço de Lixo", "Câmara de Vigia", "Canil", "Sala de Banquete"],
  esgoto: ["Cisterna", "Câmara de Válvulas", "Túnel Inundado", "Esconderijo de Contrabandistas", "Grade de Escoamento", "Ninho de Ratos", "Reservatório", "Passagem Antiga"],
  mina: ["Galeria", "Poço Desmoronado", "Depósito de Ferramentas", "Veio Exposto", "Fundição", "Alojamento dos Mineiros", "Câmara de Explosivos", "Gruta Natural"],
  fortaleza: ["Salão Principal", "Quartel", "Armaria", "Despensa", "Capela", "Cozinha", "Aposentos do Capitão", "Sala de Guerra"],
  arcano: ["Biblioteca", "Laboratório", "Câmara de Invocação", "Observatório", "Depósito de Componentes", "Cela do Familiar", "Sala de Experimentos", "Escritório"],
};

const MONSTERS: Record<Theme, string[]> = {
  cripta: ["esqueletos", "zumbis", "carniçais", "ratos gigantes", "sombras"],
  templo: ["cultistas", "acólitos fanáticos", "gárgulas", "diabretes", "guardas do templo"],
  prisao: ["guardas", "cães de guerra", "prisioneiros desesperados", "hobgoblins", "ratos gigantes"],
  covil: ["goblins", "kobolds", "lobos", "orcs", "gnolls"],
  esgoto: ["ratos gigantes", "homens-rato", "contrabandistas", "uma gosma cinzenta", "crocodilos"],
  mina: ["kobolds", "anões duergar", "besouros de fogo", "um ankheg", "aranhas gigantes"],
  fortaleza: ["bandidos", "hobgoblins", "mercenários", "cães de caça", "batedores orcs"],
  arcano: ["homúnculos", "armaduras animadas", "elementais menores", "aprendizes renegados", "livros voadores"],
};

const SOLO: Record<Theme, string[]> = {
  cripta: ["um espectro", "um wight", "uma múmia", "um cubo gelatinoso"],
  templo: ["um sacerdote corrompido", "uma estátua viva", "um demônio menor"],
  prisao: ["um ogro carcereiro", "um mímico disfarçado de baú", "um torturador"],
  covil: ["um urso-coruja", "um troll", "um lobo atroz"],
  esgoto: ["um otyugh", "um enxame de ratos", "uma gosma ocre"],
  mina: ["um verme da terra", "um golem de pedra", "um basilisco"],
  fortaleza: ["um cavaleiro renegado", "um ogro mercenário", "um mago de batalha"],
  arcano: ["um golem de carne", "um mago louco", "um elemental de fogo"],
};

const BOSS: Record<Theme, string[]> = {
  cripta: ["um lich enfraquecido", "o antigo rei, agora um wight", "uma banshee presa ao próprio túmulo"],
  templo: ["o sumo sacerdote corrompido", "um demônio aprisionado sob o altar", "a avatar de um deus esquecido"],
  prisao: ["o diretor da prisão, um vampiro", "um prisioneiro que se tornou algo pior", "um carcereiro meio-gigante"],
  covil: ["o chefe goblin e seu lobo atroz", "um dragão jovem", "uma bruxa da noite"],
  esgoto: ["o rei dos homens-rato", "um aboleth jovem", "o líder dos contrabandistas"],
  mina: ["um verme púrpura jovem", "o mestre-forja duergar", "um elemental da terra enlouquecido"],
  fortaleza: ["o capitão mercenário", "um cavaleiro da morte", "o barão traidor"],
  arcano: ["o arquimago enlouquecido", "um devorador de mentes", "o simulacro do antigo mestre"],
};

const FLAVOR: Record<Theme, string[]> = {
  cripta: [
    "Nichos nas paredes guardam ossos amarelados.", "O ar cheira a incenso velho e terra úmida.", "Uma inscrição pede silêncio aos vivos.",
    "Velas derretidas cobrem um pequeno altar.", "Teias espessas pendem do teto.", "Pegadas recentes cruzam a poeira do chão.",
  ],
  templo: [
    "Vitrais quebrados lançam cores estranhas no chão.", "Bancos de pedra estão virados e rachados.", "Um cântico distante ecoa sem origem.",
    "Símbolos sagrados foram raspados das paredes.", "Uma fonte seca tem moedas antigas no fundo.", "Cheiro de enxofre se mistura ao incenso.",
  ],
  prisao: [
    "Correntes enferrujadas pendem das paredes.", "Riscos contando dias cobrem uma parede inteira.", "Um balde de água suja está no canto.",
    "Instrumentos de tortura repousam numa mesa.", "Um mapa de rondas está pregado na porta.", "Ouve-se choro abafado vindo de longe.",
  ],
  covil: [
    "O chão está coberto de ossos roídos.", "Um fedor animal impregna tudo.", "Peles e trapos formam camas improvisadas.",
    "Uma fogueira ainda fumega.", "Desenhos tribais em sangue decoram a parede.", "Restos de uma caravana saqueada se amontoam.",
  ],
  esgoto: [
    "Água escura corre num canal pelo meio da sala.", "Grades enferrujadas dão para túneis menores.", "O fedor é quase insuportável.",
    "Ratos fogem em todas as direções.", "Uma passarela de madeira podre cruza a água.", "Caixotes de contrabando estão empilhados no seco.",
  ],
  mina: [
    "Trilhos tortos cruzam o chão.", "Escoras de madeira rangem sob o peso da rocha.", "Um veio de minério brilha na parede.",
    "Picaretas e lanternas abandonadas estão espalhadas.", "Poeira cai do teto a cada passo.", "Uma carroça virada bloqueia parte da passagem.",
  ],
  fortaleza: [
    "Estandartes rasgados pendem das paredes.", "Mesas compridas ainda têm restos de comida.", "Armas estão alinhadas em suportes.",
    "Uma lareira enorme domina a parede norte.", "Barris de vinho foram abertos às pressas.", "Um mapa da região está aberto sobre a mesa.",
  ],
  arcano: [
    "Estantes vão do chão ao teto, cheias de tomos.", "Um círculo arcano brilha fracamente no chão.", "Frascos borbulham sobre uma bancada.",
    "Um modelo do céu gira sozinho no teto.", "Pergaminhos queimados cobrem o chão.", "Cheiro de ozônio e ervas secas.",
  ],
};

const TREASURE = [
  "um baú trancado com {n} peças de ouro", "uma espada antiga com runas", "um anel de prata sob uma pedra solta", "um pergaminho de magia",
  "duas poções de cura", "um ídolo de jade", "gemas engastadas na parede ({n} po)", "um mapa para um nível inferior", "uma bolsa com {n} peças de prata",
  "um amuleto que brilha no escuro", "uma armadura ornamentada", "um diário com segredos do lugar", "um cálice de ouro cravejado ({n} po)",
  "uma varinha com poucas cargas", "um escudo com o brasão de uma casa extinta", "um frasco de óleo alquímico", "uma chave de ferro com dentes estranhos",
  "um colar de pérolas negras ({n} po)", "botas élficas gastas", "um tomo de orações antigas",
];

const TRAPS = [
  "placa de pressão que dispara dardos envenenados", "fosso coberto com estacas", "lâmina pendular no batente da porta",
  "gás sonífero ao abrir a porta", "glifo explosivo no chão", "teto que desaba parcialmente", "sala que inunda lentamente", "agulha envenenada na fechadura",
];

const HOOK_START = [
  "Os aldeões juram que luzes estranhas brilham à noite perto {de}.",
  "Um mercador pagará bem a quem recuperar {objeto}, perdido {em}.",
  "Desde {evento}, ninguém que entrou {em} voltou.",
  "Um mapa rasgado revela a localização {de}, esquecida há séculos.",
  "Um velho moribundo confessou ter selado {o} com as próprias mãos.",
  "A guilda dos exploradores oferece uma recompensa por um mapa completo {de}.",
];
const HOOK_OBJ = ["o relicário de uma família nobre", "um tomo proibido", "a coroa do antigo rei", "uma criança desaparecida", "o selo da guilda", "uma relíquia sagrada"];
const HOOK_EVT = ["o terremoto do último inverno", "a lua de sangue", "a morte do velho guardião", "a chegada dos cultistas", "a última tempestade"];

const n = (rng: Rng, s: string) => s.replace("{n}", String(rng.int(2, 30) * 10));

export function dungeonHook(rng: Rng, theme: Theme, t: Title): { hook: string; boss: string } {
  const boss = rng.pick(BOSS[theme]);
  const start = rng.pick(HOOK_START)
    .replace("{de}", withPrep("de", t))
    .replace("{em}", withPrep("em", t))
    .replace("{o}", withPrep("o", t))
    .replace("{objeto}", rng.pick(HOOK_OBJ))
    .replace("{evento}", rng.pick(HOOK_EVT));
  return { hook: `${start} Lá no fundo, aguarda ${boss}.`, boss };
}

export interface RoomText { name: string; text: string; trap: boolean }

export function roomText(deck: Deck, rng: Rng, theme: Theme, opts: { entrance: boolean; boss: string | null; area: number }): RoomText {
  const treasure = () => n(rng, deck.draw("t", TREASURE));
  if (opts.entrance) {
    return { name: "Entrada", text: `${deck.draw("f", FLAVOR[theme])} Marcas de quem passou por aqui antes levam para o interior.`, trap: false };
  }
  const name = deck.draw("r", ROOM_NAMES[theme]);
  const parts: string[] = [deck.draw("f", FLAVOR[theme])];
  let trap = false;
  if (opts.boss) {
    parts.push(`Aqui está ${opts.boss}.`);
    parts.push(`Tesouro: ${treasure()} e ${treasure()}.`);
    return { name: `${name} (covil do chefe)`, text: parts.join(" "), trap };
  }
  const roll = rng.next();
  if (roll < 0.35) {
    const many = opts.area >= 16 || rng.chance(0.6);
    const who = many ? `${rng.int(2, 6)} ${deck.draw("m", MONSTERS[theme])}` : deck.draw("s", SOLO[theme]);
    parts.push(`${who.charAt(0).toUpperCase()}${who.slice(1)} ${many ? "estão" : "está"} aqui.`);
    if (rng.chance(0.5)) parts.push(`Tesouro: ${treasure()}.`);
  } else if (roll < 0.52) {
    trap = true;
    parts.push(`Armadilha: ${deck.draw("a", TRAPS)}.`);
    if (rng.chance(0.4)) parts.push(`Tesouro: ${treasure()}.`);
  } else if (roll < 0.65) {
    parts.push(`Tesouro escondido: ${treasure()}.`);
  }
  return { name, text: parts.join(" "), trap };
}

// ─── Cidades e regiões ───────────────────────────────────────────────────────

const PT_PREFIX = ["Vila", "Porto", "Santa", "São", "Monte", "Pedra", "Vale", "Ponte", "Forte", "Campo"];
const PT_SUFFIX: Record<string, string[]> = {
  f: ["Nova", "Velha", "Rubra", "Branca", "Funda", "Alta", "Sombria", "Dourada", "do Norte", "da Serra", "dos Corvos", "Real"],
  m: ["Novo", "Velho", "Rubro", "Branco", "Fundo", "Alto", "Sombrio", "Dourado", "do Norte", "da Serra", "dos Corvos", "Real"],
};
const GENDER: Record<string, "m" | "f"> = { Vila: "f", Porto: "m", Santa: "f", São: "m", Monte: "m", Pedra: "f", Vale: "m", Ponte: "f", Forte: "m", Campo: "m" };
const SAINTS: Record<string, string[]> = { Santa: ["Brígida", "Luzia", "Helena", "Clara", "Isolda"], São: ["Benedito", "Aurélio", "Tomé", "Lázaro", "Jorge"] };

export function cityName(rng: Rng): string {
  if (rng.chance(0.5)) return properName(rng);
  const pre = rng.pick(PT_PREFIX);
  if (SAINTS[pre]) return `${pre} ${rng.pick(SAINTS[pre])}`;
  return `${pre} ${rng.pick(PT_SUFFIX[GENDER[pre]])}`;
}

export function caveName(rng: Rng): string {
  return rng.pick([`Gruta de ${properName(rng)}`, "Cavernas dos Ecos", "Gruta do Verme", `Cavernas de ${properName(rng)}`, "Fenda dos Sussurros", "Covil Subterrâneo"]);
}

export function regionName(rng: Rng): string {
  const r = rng.next();
  if (r < 0.35) return `Terras de ${properName(rng)}`;
  if (r < 0.6) return `Costa ${rng.pick(["Partida", "Sombria", "das Brumas", "do Sal", "Dourada", "dos Naufrágios"])}`;
  if (r < 0.8) return `Reino de ${properName(rng)}`;
  return `Marca ${rng.pick(["do Norte", "Esquecida", "de Ferro", "das Cinzas", "Selvagem"])}`;
}

export function seaName(rng: Rng): string {
  return rng.pick([`Mar de ${properName(rng)}`, "Mar das Brumas", "Mar Cinzento", `Baía de ${properName(rng)}`, "Mar dos Lamentos", "Estreito das Serpentes"]);
}

export function mountainName(rng: Rng): string {
  return rng.pick([`Montes ${rng.pick(["Cinzentos", "Partidos", "do Trovão", "Gelados", "de Ferro"])}`, `Serra de ${properName(rng)}`, `Picos de ${properName(rng)}`]);
}

export function forestName(rng: Rng): string {
  return rng.pick([`Floresta de ${properName(rng)}`, `Bosque ${rng.pick(["Sombrio", "dos Sussurros", "Antigo", "das Fadas", "Negro"])}`, `Mata ${rng.pick(["Fechada", "dos Lobos", "Velha"])}`]);
}

export const WARD_NAMES: Record<string, string> = {
  market: "Mercado", castle: "Castelo", temple: "Catedral", craftsmen: "Artesãos", merchants: "Mercadores",
  patriciate: "Nobres", slum: "Cortiços", military: "Quartel", park: "Jardins", harbour: "Porto", gate: "Portão",
};
