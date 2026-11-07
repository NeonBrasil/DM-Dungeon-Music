// Nightfall: regras e conteúdo do sistema (raças, classes, habilidades, cicatrizes).
// As contas de PV, CA, Mana, atributos e pontos são as mesmas do criador antigo,
// então fichas antigas importadas mantêm os números.

export type Attr = "for" | "des" | "con" | "int" | "sab" | "car" | "sor";
export const ATTRS: Attr[] = ["for", "des", "con", "int", "sab", "car", "sor"];
export const ATTR_NAME: Record<Attr, string> = {
  for: "Força", des: "Destreza", con: "Constituição", int: "Inteligência", sab: "Sabedoria", car: "Carisma", sor: "Sorte",
};
export const ATTR_ABBR: Record<Attr, string> = { for: "FOR", des: "DES", con: "CON", int: "INT", sab: "SAB", car: "CAR", sor: "SOR" };

export type RaceGroup = "originais" | "fantasia" | "sombrias" | "folclore" | "comicas" | "punk";
export const GROUPS: [RaceGroup, string][] = [
  ["originais", "Originais"], ["fantasia", "Fantasia clássica"], ["sombrias", "Sombrias"], ["folclore", "Folclore e anime"], ["comicas", "Cômicas"],
  ["punk", "Punk e máquinas"],
];

// ─── Efeitos de vantagens e fraquezas ───────────────────────────────────────
// Um traço pode terminar com marcadores que mexem nos números: "Casco natural [ca+2]",
// "Frágil [pv-1]", "Ágil [init+1]", "Teimoso [res.sab+1]", "Sortudo [destino+1]", "[mana+1]".

export interface Effect {
  ca?: number;
  pv?: number;
  init?: number;
  destino?: number;
  mana?: number;
  res?: Partial<Record<Attr, number>>;
}

const TAG = /\s*\[(ca|pv|init|destino|mana|res\.(?:for|des|con|int|sab|car|sor))([+-]\d+)\]/g;

/** Separa o texto do traço dos marcadores de efeito. */
export function parseTrait(s: string): { text: string; effect: Effect } {
  const effect: Effect = {};
  const text = s.replace(TAG, (_, k: string, v: string) => {
    const n = Number(v);
    if (k.startsWith("res.")) effect.res = { ...effect.res, [k.slice(4)]: (effect.res?.[k.slice(4) as Attr] ?? 0) + n };
    else effect[k as "ca"] = (effect[k as "ca"] ?? 0) + n;
    return "";
  }).trim();
  return { text, effect };
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

/** "CA +2", "Res. CON +2", "Iniciativa −1"… */
export function effectLabels(e: Effect): string[] {
  const out: string[] = [];
  if (e.ca) out.push(`CA ${sign(e.ca)}`);
  if (e.pv) out.push(`PV ${sign(e.pv)}`);
  if (e.init) out.push(`Iniciativa ${sign(e.init)}`);
  if (e.destino) out.push(`Destino ${sign(e.destino)}`);
  if (e.mana) out.push(`Mana ${sign(e.mana)}`);
  for (const [a, v] of Object.entries(e.res ?? {})) if (v) out.push(`Res. ${ATTR_ABBR[a as Attr]} ${sign(v)}`);
  return out;
}

/** Texto do traço para a ficha: "Casco natural — CA +2". */
export function traitLine(s: string): string {
  const { text, effect } = parseTrait(s);
  const labels = effectLabels(effect);
  return labels.length ? `${text} — ${labels.join(", ")}` : text;
}

export function sumEffects(traits: string[]): Required<Omit<Effect, "res">> & { res: Record<Attr, number> } {
  const out = { ca: 0, pv: 0, init: 0, destino: 0, mana: 0, res: { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0, sor: 0 } };
  for (const t of traits) {
    const { effect: e } = parseTrait(t);
    out.ca += e.ca ?? 0;
    out.pv += e.pv ?? 0;
    out.init += e.init ?? 0;
    out.destino += e.destino ?? 0;
    out.mana += e.mana ?? 0;
    for (const [a, v] of Object.entries(e.res ?? {})) out.res[a as Attr] += v ?? 0;
  }
  return out;
}

export interface Race {
  nome: string;
  grupo: RaceGroup;
  desloc: string;
  vantagens: string[];
  fraquezas: string[];
  proibidas: string[];
  base: Record<Attr, number>;
}

const b = (f: number, d: number, c: number, i: number, s: number, ca: number, so: number): Record<Attr, number> =>
  ({ for: f, des: d, con: c, int: i, sab: s, car: ca, sor: so });

export const RACES: Record<string, Race> = {
  // ─── Originais (iguais ao criador antigo) ───
  humano: { nome: "Humano", grupo: "originais", desloc: "9 m", vantagens: ["Versátil: +10% XP em todas atividades", "Pode ser qualquer classe"], fraquezas: ["Sem especialização racial"], proibidas: [], base: b(8, 8, 8, 8, 8, 8, 8) },
  elfo: { nome: "Elfo", grupo: "originais", desloc: "10,5 m", vantagens: ["Visão no escuro", "Imune a sono mágico", "+15% XP em magia arcana"], fraquezas: ["Fisicamente fraco [res.for-1]", "Sensível a ferro frio", "Arrogante com outras raças"], proibidas: ["barbaro", "guerreiro"], base: b(5, 10, 6, 10, 9, 8, 7) },
  anao: { nome: "Anão", grupo: "originais", desloc: "7,5 m", vantagens: ["Resistência a veneno [res.con+2]", "Visão no escuro", "Especialista em forja"], fraquezas: ["Baixa velocidade", "Teimoso", "Não confia em magia"], proibidas: ["mago", "feiticeiro", "bardo"], base: b(10, 6, 11, 7, 9, 6, 6) },
  orc: { nome: "Orc", grupo: "originais", desloc: "9 m", vantagens: ["Força brutal", "Resistência à dor [pv+2]", "Fúria de batalha dura mais"], fraquezas: ["Burro [res.int-1]", "Impulsivo", "Mal visto em cidades", "Cultura anti-intelectual"], proibidas: ["mago", "clerigo", "paladino"], base: b(12, 8, 11, 4, 6, 5, 5) },
  gnomo: { nome: "Gnomo", grupo: "originais", desloc: "7,5 m", vantagens: ["Mestre inventor", "+20% XP em conhecimento arcano", "Resistência mental [res.int+1] [res.sab+1]"], fraquezas: ["Fisicamente frágil [pv-1]", "Curioso demais (pode causar problemas)", "Facilmente distraído"], proibidas: ["barbaro", "guerreiro", "paladino"], base: b(4, 9, 7, 11, 8, 7, 9) },
  kobold: { nome: "Kobold", grupo: "originais", desloc: "9 m", vantagens: ["Furtividade superior", "Trabalho em grupo (+1 ataque com aliados próximos)", "🎩 Lenda diz que 3 kobolds conseguem se disfarçar de humano..."], fraquezas: ["Extremamente fraco [res.for-1]", "Covarde quando sozinho", "Fraco sob luz solar", "Odiado por dragões"], proibidas: ["paladino", "guerreiro", "barbaro"], base: b(3, 12, 5, 8, 7, 6, 10) },
  dragonato: { nome: "Draconato", grupo: "originais", desloc: "9 m", vantagens: ["Sopro de dragão", "Resistência a elemento", "Presença intimidadora"], fraquezas: ["Arrogante", "Sem cauda (menos equilíbrio) [res.des-1]", "Lento para confiar"], proibidas: ["ladino"], base: b(11, 7, 9, 8, 8, 10, 6) },
  meio_elfo: { nome: "Meio-Elfo", grupo: "originais", desloc: "9 m", vantagens: ["Adaptável", "Carismático", "Herança élfica parcial"], fraquezas: ["Não aceito completamente por nenhuma raça", "Conflito de identidade"], proibidas: [], base: b(7, 9, 7, 9, 7, 10, 8) },
  halfling: { nome: "Halfling", grupo: "originais", desloc: "7,5 m", vantagens: ["Sortudo (re-rolar 1s) [destino+1]", "Corajoso [res.sab+1]", "Furtivo"], fraquezas: ["Muito pequeno e fraco [res.for-1]", "Alcance limitado em combate", "Facilmente intimidado por criaturas grandes"], proibidas: ["barbaro", "guerreiro"], base: b(5, 11, 8, 8, 8, 9, 12) },
  tiefling: { nome: "Tiefling", grupo: "originais", desloc: "9 m", vantagens: ["Magia infernal inata", "Resistência ao fogo", "Visão no escuro"], fraquezas: ["Temido e odiado por mortais", "Herança demoníaca (tentações)", "Marcas visíveis (chifres, cauda)"], proibidas: ["paladino", "clerigo", "druida"], base: b(7, 8, 7, 10, 6, 11, 7) },
  goblin: { nome: "Goblin", grupo: "originais", desloc: "10,5 m", vantagens: ["Extremamente ágil [init+1]", "Fuga rápida quando ferido", "Sobrevivente nato"], fraquezas: ["Covarde", "Baixa inteligência", "Mal visto em cidades", "Cleptomaníaco compulsivo"], proibidas: ["paladino", "clerigo", "mago", "druida"], base: b(5, 13, 7, 6, 5, 4, 9) },
  centauro: { nome: "Centauro", grupo: "originais", desloc: "15 m", vantagens: ["Velocidade muito alta", "Carga devastadora", "Conexão com natureza"], fraquezas: ["Não consegue subir escadas", "Dificuldade em edifícios", "Precisa comer MUITO", "Não cabe em portas"], proibidas: ["ladino", "monge", "mago", "feiticeiro"], base: b(11, 6, 11, 6, 9, 7, 5) },
  tabaxi: { nome: "Tabaxi (Gato Bípede)", grupo: "originais", desloc: "10,5 m", vantagens: ["Agilidade felina [init+1]", "Garras naturais", "Sempre cai de pé [res.des+1]"], fraquezas: ["Distrai-se facilmente", "Não resiste a coisas brilhantes", "Terror de pepinos", "Ódio de água"], proibidas: ["barbaro", "paladino"], base: b(6, 13, 7, 8, 6, 9, 8) },
  tortle: { nome: "Tortle (Tartaruga)", grupo: "originais", desloc: "6 m", vantagens: ["Casco natural (armadura grátis) [ca+2]", "Respiração subaquática", "Extremamente sábio"], fraquezas: ["MUITO lento [init-1]", "Não nada rápido", "Pode virar de barriga pra cima e ficar preso", "Viciado em alface"], proibidas: ["monge", "barbaro", "ladino", "bardo"], base: b(9, 3, 13, 8, 11, 6, 7) },
  kenku: { nome: "Kenku (Corvo)", grupo: "originais", desloc: "9 m", vantagens: ["Mímico perfeito de sons/vozes", "Pode planar curtas distâncias", "Memória fotográfica"], fraquezas: ["NÃO PODE FALAR (só imitar)", "Sem criatividade (amaldiçoado)", "Cleptomaníaco", "Atrai má sorte"], proibidas: ["bardo", "paladino", "feiticeiro"], base: b(5, 12, 7, 9, 9, 5, 6) },
  slimefolk: { nome: "Slimefolk (Pessoa-Limo)", grupo: "originais", desloc: "6 m", vantagens: ["Corpo maleável", "Imune a veneno [res.con+2]", "Regeneração lenta", "Passa por gretas"], fraquezas: ["Deixa rastro de limo por onde passa", "Derrete no calor", "Ninguém quer tocar em você", "Cheiro horrível"], proibidas: ["paladino", "bardo", "monge"], base: b(6, 10, 12, 6, 7, 2, 9) },
  mimic: { nome: "Mimic Domesticado", grupo: "originais", desloc: "6 m", vantagens: ["Transforma-se em objetos", "Mordida poderosa", "Adesivo natural", "Pode fingir ser um baú"], fraquezas: ["Fome constante", "Às vezes transforma sem querer", "BANIDO de todas as lojas", "Precisa dormir 18h/dia"], proibidas: ["paladino", "clerigo", "mago", "bardo", "monge"], base: b(10, 5, 13, 4, 6, 2, 11) },
  fada: { nome: "Fada", grupo: "originais", desloc: "3 m (voo 9 m)", vantagens: ["Voa naturalmente", "Magia natural", "Pequena demais para acertar facilmente [ca+2]"], fraquezas: ["EXTREMAMENTE frágil [pv-2]", "Ferro frio = morte", "Leva tudo pessoalmente", "Viciada em açúcar"], proibidas: ["guerreiro", "barbaro", "paladino", "monge"], base: b(2, 14, 3, 10, 9, 11, 12) },
  esqueleto: { nome: "Esqueleto Consciente", grupo: "originais", desloc: "9 m", vantagens: ["Não precisa comer/dormir", "Imune a veneno/doenças [res.con+2]", "Pode desmontar e remontar", "Piadas de ossos são sempre engraçadas"], fraquezas: ["Necromantes tentam controlá-lo", "Clérigos te atacam de vista", "Cai aos pedaços facilmente [pv-1]", "Sem órgãos (problemas médicos únicos)"], proibidas: ["clerigo", "paladino", "druida", "monge"], base: b(7, 12, 5, 8, 7, 3, 10) },

  // ─── Fantasia clássica ───
  aasimar: { nome: "Aasimar", grupo: "fantasia", desloc: "9 m", vantagens: ["Luz celestial: cura 1d4 com um toque, 1x por dia", "Resistência a dano radiante e necrótico", "Visão no escuro"], fraquezas: ["Vigiado (e cobrado) por um guia celestial", "Mortos-vivos e diabos o sentem de longe", "Culpa enorme ao agir mal [res.sab-1]"], proibidas: ["necromante", "bruxo"], base: b(8, 7, 8, 8, 10, 12, 7) },
  golias: { nome: "Golias", grupo: "fantasia", desloc: "9 m", vantagens: ["Constituição de montanha: carrega o dobro [pv+2]", "Resistência ao frio", "Aguenta o tranco: reduz 1d6 de um golpe, 1x por descanso"], fraquezas: ["Grande demais para lugares apertados", "Competitivo até com os aliados", "Odeia depender dos outros"], proibidas: ["ladino", "assassino"], base: b(12, 6, 12, 6, 8, 6, 6) },
  firbolg: { nome: "Firbolg", grupo: "fantasia", desloc: "9 m", vantagens: ["Fala com animais e plantas", "Some de vista por um instante, 1x por descanso", "Força de gigante pacífico"], fraquezas: ["Tímido com multidões", "Detesta caçada esportiva e desperdício", "Ingênuo com dinheiro"], proibidas: ["assassino", "necromante", "pirata"], base: b(10, 6, 9, 7, 11, 7, 7) },
  minotauro: { nome: "Minotauro", grupo: "fantasia", desloc: "9 m", vantagens: ["Chifres: uma investida derruba o alvo", "Nunca se perde em labirintos", "Intimidador só de existir"], fraquezas: ["Medo de altura e de lugares muito abertos", "Quebra coisas sem querer [res.des-1]", "Fúria cega quando encurralado"], proibidas: ["ladino", "mago", "bardo"], base: b(13, 6, 11, 5, 7, 6, 6) },
  hobgoblin: { nome: "Hobgoblin", grupo: "fantasia", desloc: "9 m", vantagens: ["Disciplina militar: +2 ao ajudar um aliado", "Visão no escuro", "Treinado com armas e armaduras [ca+1]"], fraquezas: ["Rígido com regras e hierarquia", "Despreza fraqueza", "Não admite os próprios erros"], proibidas: ["bardo", "druida"], base: b(9, 8, 9, 9, 7, 6, 6) },
  bugbear: { nome: "Bugbear", grupo: "fantasia", desloc: "9 m", vantagens: ["Braços longos: alcance extra corpo a corpo", "Ataque surpresa brutal", "Furtivo apesar do tamanho"], fraquezas: ["Preguiçoso fora de combate", "Assusta crianças e lojistas", "Péssimo em etiqueta"], proibidas: ["paladino", "clerigo", "bardo"], base: b(11, 10, 9, 6, 7, 5, 6) },
  genasi: { nome: "Genasi (Elemental)", grupo: "fantasia", desloc: "9 m", vantagens: ["Escolha um elemento: fogo, água, ar ou terra", "Resistência ao seu elemento", "Truque elemental inato"], fraquezas: ["O humor muda com o clima", "Sofre mais com o elemento oposto", "Chamado de aberração pelos supersticiosos"], proibidas: ["paladino"], base: b(8, 9, 9, 9, 8, 8, 7) },
  homem_lagarto: { nome: "Homem-Lagarto", grupo: "fantasia", desloc: "9 m", vantagens: ["Mordida e escamas grossas [ca+1]", "Prende a respiração por 15 minutos", "Caçador frio e prático"], fraquezas: ["Não entende emoções alheias", "Considera tudo potencial comida", "Sangue frio: fica lento no gelo [init-1]"], proibidas: ["bardo", "paladino"], base: b(10, 8, 10, 6, 10, 4, 6) },

  // ─── Sombrias ───
  dhampir: { nome: "Dhampir", grupo: "sombrias", desloc: "9 m", vantagens: ["Mordida que drena: cura metade do dano causado", "Visão no escuro", "Escala paredes como aranha [res.des+1]"], fraquezas: ["Sede de sangue em combate", "Sol do meio-dia: desvantagem no primeiro turno", "Caçadores de vampiro não perguntam antes"], proibidas: ["paladino", "clerigo"], base: b(8, 11, 7, 9, 8, 10, 6) },
  licantropo: { nome: "Licantropo", grupo: "sombrias", desloc: "10,5 m", vantagens: ["Forma híbrida (garras, +2 FOR), 1x por descanso", "Faro e audição de lobo [init+1]", "Regenera 1 PV por turno na forma de fera"], fraquezas: ["Lua cheia: perde o controle", "Prata fere em dobro", "Cães e cavalos entram em pânico"], proibidas: ["mago", "bardo", "paladino"], base: b(11, 9, 10, 6, 8, 5, 6) },
  retornado: { nome: "Retornado", grupo: "sombrias", desloc: "9 m", vantagens: ["Voltou da morte com um propósito", "Sempre sabe a direção de quem o matou", "Não precisa respirar [res.con+1]"], fraquezas: ["Corpo frio e pálido", "Se esquecer o propósito, começa a apodrecer", "Animais o evitam"], proibidas: ["clerigo", "druida"], base: b(9, 8, 11, 8, 9, 5, 5) },
  changeling: { nome: "Changeling", grupo: "sombrias", desloc: "9 m", vantagens: ["Muda o rosto à vontade", "Imita vozes que já ouviu", "Lê intenções: +2 ao desconfiar de alguém"], fraquezas: ["Crise de identidade", "Ninguém confia depois que descobre", "Já esqueceu o próprio rosto verdadeiro"], proibidas: ["paladino"], base: b(6, 10, 7, 9, 8, 12, 7) },
  cria_sombra: { nome: "Cria da Sombra", grupo: "sombrias", desloc: "9 m", vantagens: ["Passo sombrio: teleporta 9 m entre sombras", "Invisível na escuridão total", "Imune a medo [res.sab+2]"], fraquezas: ["Enfraquece sob luz forte", "Apático: perde cor e emoções com o tempo", "A própria sombra às vezes age sozinha"], proibidas: ["clerigo", "paladino", "bardo"], base: b(7, 12, 7, 9, 9, 6, 7) },
  sangue_bruxa: { nome: "Sangue-de-Bruxa", grupo: "sombrias", desloc: "9 m", vantagens: ["Mau-olhado: o alvo tem desvantagem no próximo teste", "Sente quando alguém mente sobre magia", "Resistência a encantamentos"], fraquezas: ["Marca de bruxa no corpo", "Gatos pretos a seguem por toda parte", "Inquisidores a caçam"], proibidas: ["paladino", "clerigo"], base: b(6, 8, 8, 10, 10, 9, 7) },

  // ─── Folclore e anime ───
  kitsune: { nome: "Kitsune", grupo: "folclore", desloc: "10,5 m", vantagens: ["Fogo-raposa: chamas azuis que iluminam ou queimam (1d6)", "Ilusões simples à vontade", "Ganha caudas (e poder) com a idade"], fraquezas: ["Brincalhona até nas horas erradas", "Cães a farejam de longe", "Promessa quebrada a enfraquece"], proibidas: ["barbaro", "gladiador"], base: b(5, 11, 6, 10, 9, 11, 8) },
  oni: { nome: "Oni", grupo: "folclore", desloc: "9 m", vantagens: ["Força demoníaca", "Usa clavas enormes sem penalidade", "Regenera 1 PV por turno enquanto estiver de pé"], fraquezas: ["Grita quando mente", "Feijão torrado arremessado o faz fugir", "Temperamento explosivo"], proibidas: ["monge", "bardo", "ladino"], base: b(12, 6, 11, 6, 6, 7, 5) },
  tengu: { nome: "Tengu", grupo: "folclore", desloc: "9 m (planar)", vantagens: ["Asas: plana e dá saltos enormes", "Mestre de esgrima nato [init+1]", "Vê através de ilusões simples"], fraquezas: ["Arrogante e vaidoso", "Vingativo quando enganado", "Solta penas quando fica nervoso"], proibidas: ["barbaro", "alquimista"], base: b(7, 12, 7, 8, 10, 7, 7) },
  kappa: { nome: "Kappa", grupo: "folclore", desloc: "7,5 m (nado 12 m)", vantagens: ["Nadador perfeito [res.for+1]", "Braço forte para agarrar e derrubar", "Conhece os remédios do rio"], fraquezas: ["Se a água do prato na cabeça derramar, fica fraco", "Obrigado a retribuir uma reverência", "Viciado em pepino"], proibidas: ["paladino", "gladiador"], base: b(10, 8, 10, 7, 9, 5, 7) },
  saci: { nome: "Saci", grupo: "folclore", desloc: "10,5 m", vantagens: ["Redemoinho: some e reaparece a 9 m, 1x por descanso", "Dá qualquer nó e desfaz qualquer trança", "Pula com uma perna mais que muitos com duas"], fraquezas: ["Quem pegar o gorro vermelho manda nele", "Não atravessa água corrente", "Não resiste a pregar uma peça"], proibidas: ["paladino", "samurai", "guerreiro"], base: b(5, 13, 6, 8, 8, 9, 11) },
  curupira: { nome: "Curupira", grupo: "folclore", desloc: "10,5 m", vantagens: ["Pés virados: rastreadores seguem para o lado errado", "Protetor da mata: animais o ajudam", "Assobio que confunde: desvantagem no próximo teste do alvo"], fraquezas: ["Fúria com quem destrói a floresta", "Desconfortável em cidades", "Distraído por fumo e cachaça oferecidos"], proibidas: ["inventor", "pirata", "necromante"], base: b(8, 11, 8, 7, 11, 6, 8) },

  // ─── Cômicas ───
  cogumelo: { nome: "Cogumelo-Pessoa", grupo: "comicas", desloc: "7,5 m", vantagens: ["Esporos: conversa sem falar com quem os respirou", "Regenera membros (devagar: semanas)", "Imune a veneno [res.con+2]"], fraquezas: ["Nascem cogumelos onde dorme", "Sol forte resseca", "Sempre tem alguém querendo te cozinhar"], proibidas: ["paladino", "samurai", "gladiador"], base: b(6, 6, 12, 8, 11, 4, 8) },
  gargula: { nome: "Gárgula Preguiçosa", grupo: "comicas", desloc: "6 m (voo 9 m)", vantagens: ["Vira pedra: CA altíssima enquanto não se mexe", "Não precisa comer", "Voa (mal, mas voa)"], fraquezas: ["Dorme o dia inteiro", "Pombos a tratam como estátua", "Afunda na água como pedra [init-1]"], proibidas: ["monge", "ladino", "bardo"], base: b(11, 4, 13, 6, 8, 4, 6) },
  pato: { nome: "Pato Aventureiro", grupo: "comicas", desloc: "7,5 m (voo curto)", vantagens: ["Nada, voa (um pouco) e anda: o pacote completo", "Penas impermeáveis [res.con+1]", "QUACK intimidador: assusta animais pequenos"], fraquezas: ["Ninguém leva a sério", "Pão é fraqueza absoluta", "Raposas o perseguem por instinto"], proibidas: ["gladiador", "samurai"], base: b(4, 11, 7, 8, 9, 9, 11) },
  golem_biscoito: { nome: "Golem de Biscoito", grupo: "comicas", desloc: "9 m", vantagens: ["Quebrou? Cola com glacê", "Cheiro bom acalma criaturas", "Não sente dor [pv+2]"], fraquezas: ["Derrete na chuva", "Crianças tentam morder", "Formigas."], proibidas: ["monge", "barbaro", "druida"], base: b(8, 7, 9, 7, 7, 10, 8) },

  // ─── Punk e máquinas (gente que Nightfall fabricou, mutou ou cuspiu de outro tempo) ───
  ciborgue: { nome: "Ciborgue", grupo: "punk", desloc: "9 m", vantagens: ["Corpo reforçado com placas [ca+1]", "Conversa direto com máquinas e terminais", "Olho ótico: zoom e visão no escuro"], fraquezas: ["Pulso eletromagnético desliga você por 1 turno", "Precisa de manutenção: óleo, peças, bateria [pv-1]"], proibidas: ["druida", "andarilho"], base: b(10, 9, 10, 9, 6, 6, 6) },
  androide: { nome: "Androide", grupo: "punk", desloc: "9 m", vantagens: ["Não respira, não come, não dorme", "Memória perfeita [res.int+1]", "Fala qualquer língua que já ouviu"], fraquezas: ["Não entende emoções [res.car-1]", "Água no circuito: curto e faísca"], proibidas: ["clerigo", "bruxo", "druida"], base: b(9, 9, 9, 11, 7, 5, 6) },
  mutante: { nome: "Mutante Atômico", grupo: "punk", desloc: "9 m", vantagens: ["Carne radioativa que se refaz [pv+2]", "Brilha no escuro (literalmente)", "Imune a radiação [res.con+1]"], fraquezas: ["Instável: ganha uma mutação nova a cada lua cheia", "Contadores Geiger enlouquecem perto de você"], proibidas: ["paladino"], base: b(10, 8, 11, 7, 7, 5, 8) },
  infectado: { nome: "Infectado", grupo: "punk", desloc: "9 m", vantagens: ["Meio-zumbi: não sente dor [pv+3]", "Mortos-vivos te tratam como um deles", "Mordida que infecta quem falhar em CON"], fraquezas: ["Fome de carne crua [res.sab-1]", "Sobreviventes atiram primeiro e perguntam depois"], proibidas: ["paladino", "clerigo", "bardo"], base: b(11, 7, 12, 6, 6, 4, 7) },
  automato: { nome: "Autômato a Vapor", grupo: "punk", desloc: "7,5 m", vantagens: ["Caldeira e couraça de latão [ca+1]", "Braços hidráulicos: força de prensa [res.for+1]", "Não sente frio nem calor"], fraquezas: ["Precisa de carvão e água todo dia", "Chia, range e solta vapor: furtividade péssima [init-1]"], proibidas: ["monge", "ladino", "assassino", "bardo"], base: b(12, 5, 12, 7, 6, 5, 6) },
  morlock: { nome: "Morlock (Terra Oca)", grupo: "punk", desloc: "9 m", vantagens: ["Olhos de abismo: enxerga no escuro total", "Pele de pedra-fungo [ca+1]", "Conhece os túneis entre a Terra Superior e a Inferior"], fraquezas: ["A luz do céu da Superior cega [init-1]", "Desconfia de quem vem de cima"], proibidas: ["pistoleiro", "netrunner"], base: b(11, 9, 11, 6, 8, 4, 6) },
};

// ─── Classes e habilidades ──────────────────────────────────────────────────
// Fórmulas usam os campos da ficha: @{for_mod}…@{sor_mod}, @{bt} (bônus de treino),
// @{conj_mod} (atributo-chave da classe) e @{atq_hab} (= @{bt} + @{conj_mod}).

export interface Ability {
  nome: string;
  nivel: number;
  custo: string;
  efeito: string;
  teste?: string;
  dano?: string | ((nivel: number) => string);
}

export interface ClassDef {
  nome: string;
  lema: string;
  chave: Attr;      // atributo das habilidades (e da mana, se usar)
  mana: boolean;
  resist: [Attr, Attr];
  habilidades: Ability[];
}

const H = (nome: string, nivel: number, custo: string, efeito: string, teste?: string, dano?: Ability["dano"]): Ability => ({ nome, nivel, custo, efeito, teste, dano });
const SPELL = "1d20 + @{atq_hab}";
const step = (n: number, a: string, b5: string, b11: string, b17: string) => (n >= 17 ? b17 : n >= 11 ? b11 : n >= 5 ? b5 : a);

export const CLASSES: Record<string, ClassDef> = {
  guerreiro: {
    nome: "Guerreiro", lema: "Aço, disciplina e a última pessoa de pé.", chave: "for", mana: false, resist: ["for", "con"],
    habilidades: [
      H("Retomar Fôlego (Second Wind)", 1, "1/descanso", "Ação bônus: recupera PV.", undefined, "1d10 + @{nivel}"),
      H("Surto de Ação (Action Surge)", 1, "1/descanso", "Ganha uma ação extra neste turno."),
      H("Estilo de Luta (Fighting Style)", 1, "passiva", "Escolha um: Defesa (+1 CA), Duelo (+2 de dano com uma arma), Arqueria (+2 em ataques à distância) ou Proteção (desvantagem num ataque contra aliado ao lado)."),
      H("Ataque Extra", 5, "passiva", "Ataca duas vezes quando usa a ação de atacar."),
      H("Indomável", 10, "1/descanso", "Rerrola um teste de resistência que falhou."),
      H("Lenda do Campo de Batalha", 15, "1/sessão", "Por 1 minuto: crítico em 19–20 e +2 em todos os ataques."),
    ],
  },
  mago: {
    nome: "Mago", lema: "Quem estuda as estrelas aprende a apagá-las.", chave: "int", mana: true, resist: ["int", "sab"],
    habilidades: [
      H("Conjuração Arcana (Arcane Spellcasting)", 1, "0+ mana", "Lança magias arcanas. Raio Arcano (truque, sem custo): ataque à distância de 36 m.", SPELL, (n) => `${step(n, "1", "2", "3", "4")}d10`),
      H("Recuperação Arcana (Arcane Recovery)", 1, "1/dia", "Num descanso curto, recupera mana igual à metade do nível (mín. 1)."),
      H("Conjuração Ritual (Ritual Casting)", 1, "+10 min", "Lança magias de ritual sem gastar mana, levando 10 minutos a mais."),
      H("Bola de Fogo", 5, "3 mana", "Explosão de 6 m de raio a até 45 m. Resistência de DES contra a CD: metade do dano se passar.", undefined, "6d6"),
      H("Contramágica", 10, "2 mana, reação", "Anula uma magia sendo lançada a até 18 m. Magias poderosas exigem teste.", SPELL),
      H("Parar o Tempo", 15, "6 mana", "Você age sozinho por 1d4 + 1 turnos. Acaba se afetar outra criatura.", undefined, "1d4 + 1"),
    ],
  },
  clerigo: {
    nome: "Clérigo", lema: "A fé é uma tocha — e também um martelo.", chave: "sab", mana: true, resist: ["sab", "car"],
    habilidades: [
      H("Canalizar Divindade (Channel Divinity)", 1, "1/descanso", "Expulsar mortos-vivos: os que falharem na resistência de SAB fogem por 1 minuto."),
      H("Cura Divina (Healing Word)", 1, "1 mana", "Cura um aliado a até 18 m.", undefined, "1d8 + @{conj_mod}"),
      H("Domínio Divino (Divine Domain)", 1, "passiva", "Escolha: Vida (+2 nas curas), Guerra (ataque extra 1/descanso), Luz (clarão que cega) ou Tempestade (trovão como reação)."),
      H("Chama Sagrada Ampliada", 5, "2 mana", "Fogo radiante desce sobre um alvo. Resistência de DES.", undefined, "3d8"),
      H("Intervenção Divina", 10, "1/semana", "Pede ajuda direta ao deus: role d100; se tirar até o seu nível, o mestre descreve o milagre.", "1d100"),
      H("Ressurreição", 15, "7 mana", "Traz de volta alguém morto há até 10 dias. Quem volta ganha uma Cicatriz."),
    ],
  },
  ladino: {
    nome: "Ladino", lema: "Toda porta tem um segredo. Todo bolso também.", chave: "des", mana: false, resist: ["des", "int"],
    habilidades: [
      H("Ataque Furtivo (Sneak Attack)", 1, "1/turno", "Dano extra quando tem vantagem ou um aliado está ao lado do alvo.", undefined, (n) => `${Math.ceil(n / 2)}d6`),
      H("Especialista (Expertise)", 1, "passiva", "Em duas áreas à sua escolha (ex.: furtividade, fechaduras), soma o dobro do bônus de treino.", "1d20 + @{des_mod} + 2 * @{bt}"),
      H("Ação Ardilosa (Cunning Action)", 1, "ação bônus", "Correr, desengajar ou esconder-se como ação bônus."),
      H("Esquiva Sobrenatural", 5, "reação", "Reduz à metade o dano de um ataque que você consegue ver."),
      H("Evasão", 10, "passiva", "Em áreas com resistência de DES: sucesso = nenhum dano, falha = metade."),
      H("Golpe de Sorte", 15, "1/descanso", "Transforma um erro em acerto, ou uma falha em um 20 natural."),
    ],
  },
  paladino: {
    nome: "Paladino", lema: "Um juramento dito em voz alta pesa mais que armadura.", chave: "car", mana: true, resist: ["sab", "car"],
    habilidades: [
      H("Cura pelas Mãos (Lay on Hands)", 1, "reserva diária", "Reserva de cura = 5 × nível por dia. Toque e gaste quanto quiser."),
      H("Golpe Divino (Divine Smite)", 1, "2 mana", "Ao acertar corpo a corpo, soma dano radiante (+1d8 contra mortos-vivos e demônios).", undefined, "2d8"),
      H("Juramento Sagrado (Sacred Oath)", 1, "passiva", "Escolha: Devoção, Vingança ou Anciões. Quebrar o juramento tira os poderes até se redimir."),
      H("Aura de Proteção", 5, "passiva", "Você e aliados a 3 m somam seu mod. de CAR (mín. +1) em resistências."),
      H("Aura de Coragem", 10, "passiva", "Você e aliados a 3 m não podem ser amedrontados."),
      H("Avatar Sagrado", 15, "1/dia", "Por 1 minuto: asas de luz, voo, e inimigos a 9 m têm desvantagem contra você."),
    ],
  },
  ranger: {
    nome: "Ranger", lema: "A trilha fala com quem sabe calar.", chave: "sab", mana: true, resist: ["for", "des"],
    habilidades: [
      H("Inimigo Favorito (Favored Enemy)", 1, "passiva", "Escolha um tipo de criatura: +2 de dano e vantagem para rastreá-la."),
      H("Explorador Natural (Natural Explorer)", 1, "passiva", "No terreno favorito o grupo não se perde, anda furtivo em ritmo normal e acha o dobro de comida."),
      H("Consciência Primordial (Primeval Awareness)", 1, "1 mana", "Por 1 minuto, sente aberrações, celestiais, elementais, fadas, demônios e mortos-vivos a 1,5 km."),
      H("Marca do Caçador", 5, "1 mana", "Marca um alvo: +1d6 de dano contra ele e vantagem para encontrá-lo.", undefined, "1d6"),
      H("Chuva de Flechas", 10, "3 mana", "Todos num cilindro de 6 m fazem resistência de DES.", undefined, "4d8"),
      H("Matador de Monstros", 15, "passiva", "Contra o inimigo favorito, crítico em 18–20."),
    ],
  },
  barbaro: {
    nome: "Bárbaro", lema: "A raiva é uma fogueira. Você é a lenha.", chave: "for", mana: false, resist: ["for", "con"],
    habilidades: [
      H("Fúria (Rage)", 1, "2/descanso", "Por 1 minuto: +2 de dano corpo a corpo, resistência a dano físico e vantagem em testes de FOR."),
      H("Ataque Imprudente (Reckless Attack)", 1, "à vontade", "Vantagem nos ataques deste turno — mas ataques contra você também têm vantagem.", "2d20kh1 + @{for_mod} + @{bt}"),
      H("Sentido de Perigo (Danger Sense)", 1, "passiva", "Vantagem em resistência de DES contra o que você vê (armadilhas, magias)."),
      H("Ataque Extra e Passo Veloz", 5, "passiva", "Ataca duas vezes e corre 3 m a mais."),
      H("Crítico Brutal", 10, "passiva", "Críticos somam mais um dado de dano.", undefined, "1d12"),
      H("Fúria Implacável", 15, "1/descanso", "Ao cair a 0 PV em fúria: teste de CON CD 10. Se passar, fica com 1 PV.", "1d20 + @{con_mod}"),
    ],
  },
  bardo: {
    nome: "Bardo", lema: "Toda lenda começou com alguém contando mentiras bonitas.", chave: "car", mana: true, resist: ["des", "car"],
    habilidades: [
      H("Inspiração de Bardo (Bardic Inspiration)", 1, "1 mana", "Um aliado ganha um dado para somar a um teste.", undefined, (n) => `1d${step(n, "6", "8", "10", "12")}`),
      H("Pau pra Toda Obra (Jack of All Trades)", 1, "passiva", "Soma metade do bônus de treino em testes nos quais não é treinado."),
      H("Canção de Descanso (Song of Rest)", 1, "descanso curto", "Aliados que descansarem ouvindo você recuperam PV extra.", undefined, "1d6"),
      H("Palavras Cortantes", 5, "1 mana, reação", "Subtrai seu dado de inspiração de um ataque, teste ou dano inimigo."),
      H("Segredos Mágicos", 10, "passiva", "Aprende duas magias de qualquer lista, até de outras classes."),
      H("Canção da Noite Eterna", 15, "4 mana", "Todos que ouvirem a 9 m fazem resistência de SAB ou ficam encantados por 1 minuto."),
    ],
  },
  druida: {
    nome: "Druida", lema: "A floresta não perdoa. Ela recicla.", chave: "sab", mana: true, resist: ["int", "sab"],
    habilidades: [
      H("Forma Selvagem (Wild Shape)", 1, "2/descanso", "Vira um animal que já viu. A fera tem PV próprios; ao zerar, você volta à forma normal."),
      H("Druídico (Druidic)", 1, "passiva", "Fala a língua secreta dos druidas e deixa mensagens escondidas na natureza."),
      H("Magia da Natureza (Nature Magic)", 1, "1 mana", "Espinhos, raízes ou relâmpago num alvo a 18 m.", SPELL, "1d8"),
      H("Chamar Relâmpago", 5, "3 mana", "Por 10 minutos, derruba um raio por turno (resistência de DES).", undefined, "3d10"),
      H("Forma Elemental", 10, "4 mana", "Vira um elemental de fogo, água, ar ou terra por 1 hora."),
      H("Corpo Atemporal", 15, "passiva", "Envelhece 1 ano a cada 10 e ignora venenos e doenças."),
    ],
  },
  monge: {
    nome: "Monge", lema: "O corpo é a arma. O silêncio, a bainha.", chave: "sab", mana: true, resist: ["for", "des"],
    habilidades: [
      H("Artes Marciais (Martial Arts)", 1, "passiva", "Golpes desarmados usam DES e dão um ataque bônus por turno.", "1d20 + @{des_mod} + @{bt}", (n) => `1d${step(n, "4", "6", "8", "10")} + @{des_mod}`),
      H("Pontos de Ki (Ki Points)", 1, "1 mana", "Rajada de golpes (2 ataques desarmados), passo do vento (correr/desengajar) ou defesa paciente (esquivar)."),
      H("Defesa sem Armadura (Unarmored Defense)", 1, "passiva", "Sem armadura, soma o mod. de SAB à CA (anote em Bônus de armadura)."),
      H("Golpe Atordoante", 5, "1 mana", "Ao acertar, o alvo faz resistência de CON ou fica atordoado até o fim do seu próximo turno."),
      H("Pureza Corporal", 10, "passiva", "Imune a doenças e venenos."),
      H("Palma Vibrante", 15, "3 mana", "Toque marcado. Quando quiser, o alvo faz resistência de CON: falha = 0 PV; sucesso = sofre o dano.", undefined, "10d10"),
    ],
  },
  feiticeiro: {
    nome: "Feiticeiro", lema: "Não estudou a magia. Nasceu com ela, e ela cobra aluguel.", chave: "car", mana: true, resist: ["con", "car"],
    habilidades: [
      H("Metamagia (Metamagic)", 1, "+1 a 3 mana", "Molda a magia: alcance dobrado, acelerada (ação bônus), gêmea (dois alvos) ou cuidadosa (aliados passam)."),
      H("Pontos de Feitiçaria (Sorcery Points)", 1, "1/descanso", "Ação bônus: recupera um pouco de mana.", undefined, "1d4"),
      H("Origem Feiticeira (Sorcerous Origin)", 1, "passiva", "Escolha: Linhagem Dracônica (+1 CA, escamas), Magia Selvagem (efeito caótico ao tirar 1) ou Alma Sombria (vê no escuro mágico)."),
      H("Explosão Caótica", 5, "2 mana", "Ataque à distância. Se os dois dados de dano derem igual, a energia salta para outro alvo.", SPELL, "2d8"),
      H("Magia Instintiva", 10, "1/descanso", "Lança uma magia de até 3 mana sem gastar mana."),
      H("Tempestade Arcana", 15, "6 mana", "Todos num raio de 12 m fazem resistência de DES.", undefined, "8d8"),
    ],
  },
  bruxo: {
    nome: "Bruxo", lema: "Todo poder tem um dono. O seu tem nome — e cobra.", chave: "car", mana: true, resist: ["sab", "car"],
    habilidades: [
      H("Invocações Místicas (Eldritch Invocations)", 1, "passiva", "Escolha dois dons: ver no escuro mágico, falar com feras, Rajada Agonizante (+CAR no dano) ou disfarce à vontade."),
      H("Magia de Pacto (Pact Magic)", 1, "1 mana", "Rajada Mística: feixe de energia a até 36 m.", SPELL, (n) => `${step(n, "1", "2", "3", "4")}d10`),
      H("Patrono Transcendental (Otherworldly Patron)", 1, "passiva", "Escolha: Corruptor (PV temporários ao matar), Arquifada (encantar/amedrontar) ou Grande Antigo (telepatia). O patrono cobra favores."),
      H("Maldição", 5, "1 mana", "Amaldiçoa um alvo: +1d6 de dano contra ele e desvantagem num atributo à escolha.", undefined, "1d6"),
      H("Abraço Sombrio", 10, "2 mana", "Tentáculos ou correntes prendem um alvo (resistência de FOR).", undefined, "3d6"),
      H("Preço do Pacto", 15, "1/sessão", "O patrono intervém: recupera toda a mana, mas o mestre anota um favor devido."),
    ],
  },
  necromante: {
    nome: "Necromante", lema: "A morte é só uma porta. Você tem a chave.", chave: "int", mana: true, resist: ["con", "int"],
    habilidades: [
      H("Erguer Mortos (Raise Undead)", 1, "2 mana", "Ergue um zumbi ou esqueleto de um cadáver próximo. Obedece até o fim do dia (máx. de servos = metade do nível, mín. 1)."),
      H("Drenar Vida (Life Drain)", 1, "1 mana", "Toque necrótico: você cura metade do dano causado.", SPELL, "2d6"),
      H("Maestria da Morte (Death Magic Mastery)", 1, "passiva", "Resistência a dano necrótico e vantagem contra medo."),
      H("Exército Sombrio", 5, "4 mana", "Ergue vários mortos-vivos de uma vez.", undefined, "1d4 + 1"),
      H("Toque do Ceifador", 10, "3 mana", "Resistência de CON: se falhar, sofre o dano e não pode ser curado até o seu próximo turno.", undefined, "6d8"),
      H("Lich Incompleto", 15, "passiva", "Ao morrer, volta 1d4 dias depois num corpo pútrido — e ganha uma Cicatriz.", undefined, "1d4"),
    ],
  },
  alquimista: {
    nome: "Alquimista", lema: "Tudo é veneno. A dose decide quem acorda.", chave: "int", mana: true, resist: ["con", "int"],
    habilidades: [
      H("Fabricar Poções (Craft Potions)", 1, "descanso longo", "Prepara 2 poções: cura, força (+2 FOR por 1 hora) ou visão no escuro.", undefined, "2d4 + @{conj_mod}"),
      H("Misturas Explosivas (Explosive Concoctions)", 1, "1 mana", "Frasco arremessado explode em 3 m (resistência de DES).", undefined, (n) => `${1 + Math.floor(n / 4)}d6`),
      H("Transmutação (Transmutation)", 1, "2 mana", "Transforma um material em outro do mesmo tamanho por 1 hora (chumbo em ferro, madeira em pedra…)."),
      H("Ácido Corrosivo", 5, "2 mana", "Ataque à distância; o alvo perde 2 de CA até o fim do combate.", SPELL, "3d6"),
      H("Elixir Maior", 10, "1/dia", "Cura completa e remove uma condição — ou dá voo por 10 minutos."),
      H("Opus Magnum", 15, "1 vez na vida", "Cria a Pedra Filosofal: transforma qualquer coisa em ouro ou adia uma morte."),
    ],
  },
  inventor: {
    nome: "Inventor/Engenhoqueiro", lema: "Se não existe, você monta. Se explodir, era protótipo.", chave: "int", mana: false, resist: ["con", "int"],
    habilidades: [
      H("Engenhocas (Craft Gadgets)", 1, "1/descanso", "Monta um aparelho: gancho, granada de fumaça, lanterna mecânica ou abridor de fechaduras."),
      H("Companheiro Mecânico (Mechanical Companion)", 1, "passiva", "Um ajudante de metal (PV = 5 × nível) que obedece comandos simples e ataca no seu turno.", "1d20 + @{int_mod} + @{bt}", "1d8 + @{int_mod}"),
      H("Reparos de Emergência (Emergency Repairs)", 1, "ação", "Conserta um objeto, uma armadura ou o companheiro.", undefined, "2d6 + @{int_mod}"),
      H("Torreta", 5, "1/descanso", "Monta uma torreta que dispara uma vez por turno durante 1 minuto.", "1d20 + @{int_mod} + @{bt}", "2d8"),
      H("Armadura Arcana", 10, "passiva", "+2 de CA (anote em Bônus de armadura) e nunca é desarmado."),
      H("Obra-Prima", 15, "1/sessão", "Uma invenção absurda resolve um problema da cena (com aprovação do mestre)."),
    ],
  },
  assassino: {
    nome: "Assassino", lema: "Não existe luta justa. Existe luta terminada.", chave: "des", mana: false, resist: ["des", "int"],
    habilidades: [
      H("Mestre do Ataque Furtivo (Sneak Attack Master)", 1, "1/turno", "Dano extra contra alvos surpresos ou distraídos.", undefined, (n) => `${Math.ceil(n / 2)}d6`),
      H("Especialista em Venenos (Poison Expert)", 1, "1 dose", "Aplica veneno na lâmina: resistência de CON ou fica envenenado por 1 minuto.", undefined, "2d6"),
      H("Golpe Mortal (Death Strike)", 1, "1/descanso", "Contra um alvo surpreso, o acerto vira crítico automático."),
      H("Disfarce Perfeito", 5, "1 dia de preparo", "Assume outra identidade convincente por até uma semana."),
      H("Lâmina Fantasma", 10, "1/descanso", "Some nas sombras e reaparece atrás de um alvo a 18 m, com vantagem no ataque."),
      H("Marca da Morte", 15, "1/sessão", "Um alvo surpreso faz resistência de CON CD 20 ou cai a 0 PV."),
    ],
  },
  samurai: {
    nome: "Samurai", lema: "A lâmina sai da bainha uma vez. É o bastante.", chave: "for", mana: false, resist: ["for", "sab"],
    habilidades: [
      H("Espírito de Luta (Fighting Spirit)", 1, "3/dia", "Vantagem nos ataques do turno e 5 PV temporários."),
      H("Golpe Rápido (Rapid Strike)", 1, "1/turno", "Abre mão de uma vantagem para fazer um ataque extra."),
      H("Força Antes da Morte (Strength Before Death)", 1, "1/descanso", "Ao cair a 0 PV, age um turno inteiro antes de tombar."),
      H("Iaijutsu", 5, "1/combate", "Primeiro golpe do combate: se acertar, dano dobrado.", "1d20 + @{for_mod} + @{bt}"),
      H("Honra Inabalável", 10, "passiva", "Imune a medo e encantamento enquanto luta pelo seu código."),
      H("Corte do Último Suspiro", 15, "1/sessão", "Um único golpe atinge todos a 3 m.", undefined, "4d10 + @{for_mod}"),
    ],
  },
  pirata: {
    nome: "Pirata/Bucaneiro", lema: "O mar não tem lei. Você tem um sabre.", chave: "des", mana: false, resist: ["des", "car"],
    habilidades: [
      H("Pernas do Mar (Sea Legs)", 1, "passiva", "Nunca cai em navio, escala cordas sem teste e nada com vantagem."),
      H("Abordagem (Boarding Action)", 1, "1/combate", "Salta sobre o inimigo numa corda: ataque com vantagem e derruba.", "2d20kh1 + @{des_mod} + @{bt}"),
      H("Coragem de Rum (Rum-Fueled Courage)", 1, "1 garrafa", "Bebe: PV temporários e imune a medo por 1 minuto (desvantagem em INT).", undefined, "1d8"),
      H("Pistola de Pederneira", 5, "ação", "Um tiro por recarga; crítico em 19–20.", "1d20 + @{des_mod} + @{bt}", "2d6 + @{des_mod}"),
      H("Lábia de Contrabandista", 10, "passiva", "Vantagem para negociar, blefar e achar mercado negro."),
      H("Capitão Lendário", 15, "1/sessão", "Grita uma ordem: todos os aliados agem de novo, agora."),
    ],
  },
  gladiador: {
    nome: "Gladiador", lema: "A multidão quer sangue. Você decide de quem.", chave: "for", mana: false, resist: ["for", "con"],
    habilidades: [
      H("Agradar a Multidão (Crowd Pleaser)", 1, "1/combate", "Golpe espetacular: aliados que viram ganham PV temporários.", undefined, "1d6"),
      H("Combate de Arena (Arena Combat)", 1, "passiva", "Luta com qualquer coisa como arma (1d6) e não perde a ação ao ser derrubado."),
      H("Golpe Exibido (Showboating Strike)", 1, "à vontade", "Anuncia o golpe: se acertar, +1d8 de dano; se errar, o alvo tem vantagem contra você.", undefined, "1d8"),
      H("Grito de Guerra", 5, "1/descanso", "Inimigos a 9 m fazem resistência de SAB ou ficam amedrontados."),
      H("Campeão da Arena", 10, "passiva", "+1 de CA (anote em Bônus) e crítico em 19–20."),
      H("Polegar para Baixo", 15, "1/sessão", "Um inimigo com menos de 15 PV cai na hora."),
    ],
  },
  besta_selvagem: {
    nome: "Mestre de Besta Selvagem", lema: "Dois corações, uma matilha.", chave: "sab", mana: false, resist: ["for", "sab"],
    habilidades: [
      H("Companheiro Animal (Animal Companion)", 1, "passiva", "Uma fera leal (lobo, falcão, javali…) que ataca no seu turno.", "1d20 + @{sab_mod} + @{bt}", "1d8 + @{sab_mod}"),
      H("Fala das Feras (Beast Speech)", 1, "à vontade", "Conversa com animais (eles nem sempre colaboram)."),
      H("Tática de Matilha (Pack Tactics)", 1, "passiva", "Você e o companheiro têm vantagem contra alvos que os dois estão atacando."),
      H("Vínculo Selvagem", 5, "passiva", "O companheiro ganha PV extra igual a 2 × nível e ataca duas vezes."),
      H("Fera Gigante", 10, "passiva", "O companheiro cresce (vira montaria) e o dano aumenta.", "1d20 + @{sab_mod} + @{bt}", "2d8 + @{sab_mod}"),
      H("Chamado da Matilha", 15, "1/dia", "Convoca feras da região para lutar por 1 hora.", undefined, "2d4"),
    ],
  },

  // ─── Classes novas ───
  cacador: {
    nome: "Caçador de Monstros", lema: "Mercenário de bestas, óleos e sinais.", chave: "des", mana: false, resist: ["con", "sab"],
    habilidades: [
      H("Sinais", 1, "1/descanso cada", "Cinco gestos: Chama (dano), Escudo (+2 CA por 1 minuto), Encanto, Repulsão e Armadilha.", undefined, "1d6"),
      H("Óleos de Lâmina", 1, "1 dose", "Óleo contra um tipo de monstro: +1d6 de dano contra ele por um combate.", undefined, "1d6"),
      H("Bestiário Mental", 1, "passiva", "Vantagem para lembrar fraquezas de monstros.", "2d20kh1 + @{int_mod} + @{bt}"),
      H("Mutagênico", 5, "1/dia", "Por 10 minutos: +2 num atributo físico; ao fim, perde PV.", undefined, "1d4"),
      H("Pirueta Mortal", 10, "reação", "Esquiva de um ataque e contra-ataca na hora.", "1d20 + @{des_mod} + @{bt}"),
      H("Contrato Final", 15, "1/sessão", "Contra o monstro do contrato atual, todos os golpes desta rodada são críticos."),
    ],
  },
  hemomante: {
    nome: "Hemomante", lema: "Magia de sangue: poder que cobra em vida.", chave: "con", mana: true, resist: ["con", "sab"],
    habilidades: [
      H("Preço de Sangue", 1, "PV", "Pode pagar mana com PV: cada 1 de mana custa 2 PV."),
      H("Lança Carmesim", 1, "1 mana", "O sangue vira lâmina e voa até 18 m.", SPELL, "2d6"),
      H("Sentir Sangue", 1, "passiva", "Sente criaturas feridas a 18 m, mesmo invisíveis."),
      H("Hemorragia", 5, "2 mana", "O alvo sangra: sofre dano no começo de cada turno por 1 minuto (resistência de CON encerra).", undefined, "1d8"),
      H("Transfusão", 10, "2 mana", "Passa PV seus para um aliado: ele recebe o dobro do que você perder.", undefined, "2d8"),
      H("Maré Rubra", 15, "6 mana", "Todo sangue num raio de 9 m ferve (resistência de CON).", undefined, "8d6"),
    ],
  },
  pistoleiro: {
    nome: "Pistoleiro", lema: "Pólvora, poeira e reflexos.", chave: "des", mana: false, resist: ["des", "sab"],
    habilidades: [
      H("Saque Rápido", 1, "passiva", "+2 na iniciativa e saca a arma sem gastar ação.", "1d20 + @{des_mod} + 2"),
      H("Tiro Certeiro", 1, "1/turno", "Mira com calma: +1d6 de dano num tiro.", "1d20 + @{des_mod} + @{bt}", "1d10 + 1d6 + @{des_mod}"),
      H("Truques de Pólvora", 1, "1/descanso", "Um tiro que derruba, desarma ou cega o alvo por 1 turno."),
      H("Leque de Balas", 5, "1/descanso", "Um tiro em cada inimigo a 9 m.", "1d20 + @{des_mod} + @{bt}", "1d10 + @{des_mod}"),
      H("Bala com Nome", 10, "1/dia", "Um tiro que só erra com 1 natural.", "1d20 + @{des_mod} + @{bt}", "3d10 + @{des_mod}"),
      H("Duelo ao Pôr do Sol", 15, "1/sessão", "Desafia um inimigo: os dois rolam iniciativa; quem vencer dá um tiro crítico.", "1d20 + @{des_mod}"),
    ],
  },
  xama: {
    nome: "Xamã", lema: "Fala com espíritos, ancestrais e o que mora entre mundos.", chave: "sab", mana: true, resist: ["sab", "car"],
    habilidades: [
      H("Espíritos Guardiões", 1, "1 mana", "Um espírito protege um aliado: +2 de CA por 1 minuto."),
      H("Toque Ancestral", 1, "1 mana", "Cura um aliado tocando-o com um amuleto.", undefined, "1d8 + @{conj_mod}"),
      H("Viagem Espiritual", 1, "10 min", "Sai do corpo e explora como espírito por 10 minutos (o corpo fica indefeso)."),
      H("Fúria dos Ancestrais", 5, "3 mana", "Espíritos atacam todos os inimigos a 6 m (resistência de SAB).", undefined, "3d8"),
      H("Totem", 10, "2 mana", "Planta um totem: aliados perto recuperam PV a cada turno por 1 minuto.", undefined, "1d6"),
      H("Ponte entre Mundos", 15, "1/sessão", "Traz de volta quem morreu nesta cena: volta com 1 PV e uma Cicatriz."),
    ],
  },

  // ─── Classes punk ───
  netrunner: {
    nome: "Netrunner", lema: "Cabos na nuca, olhos em mil câmeras. Em Nightfall, a rede é feita de restos de todas as épocas.", chave: "int", mana: true, resist: ["des", "int"],
    habilidades: [
      H("Invadir Sistema", 1, "1 mana", "Assume uma máquina, porta eletrônica, torreta ou implante por 1 minuto.", SPELL),
      H("Choque Neural", 1, "1 mana", "Descarga pelo implante num alvo a até 18 m.", SPELL, (n) => `${step(n, "1", "2", "3", "4")}d8`),
      H("Drone Espião", 1, "passiva", "Um drone do tamanho de um punho vê e escuta por você a até 30 m."),
      H("Firewall", 5, "1 mana, reação", "Bloqueia um ataque tecnológico ou mental: +4 de CA ou na resistência contra ele."),
      H("Apagão", 10, "3 mana", "Derruba toda tecnologia num raio de 18 m por 1 minuto: luzes, armas de energia, implantes."),
      H("Fantasma na Rede", 15, "1/sessão", "Sobe a consciência para a rede: sai do corpo, aparece em qualquer tela a 1 km e age por 1 minuto."),
    ],
  },
  diesel: {
    nome: "Mecânico Diesel", lema: "Graxa, fumaça preta e um motor que nunca devia funcionar — mas funciona.", chave: "int", mana: false, resist: ["con", "int"],
    habilidades: [
      H("Gambiarra", 1, "1/descanso", "Conserta ou improvisa qualquer máquina com sucata em 1 minuto."),
      H("Lança-chamas de Sucata", 1, "1/descanso", "Cone de 4,5 m: resistência de DES, metade do dano se passar.", undefined, (n) => `${1 + Math.floor(n / 3)}d6`),
      H("Blindagem de Chapa", 1, "passiva", "Placas rebitadas: +1 de CA (anote em Bônus de armadura)."),
      H("Motor Turbinado", 5, "1/descanso", "Um veículo ou máquina ganha o dobro de velocidade e força por 10 minutos."),
      H("Tanque Ambulante", 10, "1/dia", "Veste o exoesqueleto a diesel por 1 minuto: +3 de CA e socos de pistão.", "1d20 + @{for_mod} + @{bt}", "2d10 + @{for_mod}"),
      H("Rolo Compressor", 15, "1/sessão", "Atropela tudo numa linha de 18 m (resistência de DES).", undefined, "8d10"),
    ],
  },
  atomista: {
    nome: "Atomista", lema: "Sorria para o átomo. Ele é seu amigo — até derreter.", chave: "con", mana: true, resist: ["con", "int"],
    habilidades: [
      H("Raio Gama", 1, "1 mana", "Feixe radioativo a até 18 m.", SPELL, (n) => `${step(n, "1", "2", "3", "4")}d10`),
      H("Escudo de Chumbo", 1, "1 mana, reação", "+3 de CA contra um ataque."),
      H("Contador Geiger Interno", 1, "passiva", "Sente radiação, energia e mutações a até 30 m."),
      H("Mutação Controlada", 5, "2 mana", "Por 1 minuto: garras, pele de chumbo (+2 CA) ou pernas de mola (salto triplo).", "1d20 + @{atq_hab}", "1d8 + @{con_mod}"),
      H("Chuva Radioativa", 10, "4 mana", "Área de 6 m por 1 minuto: quem começa o turno nela faz resistência de CON.", undefined, "3d6"),
      H("Meltdown", 15, "1/dia", "Explosão de 9 m centrada em você (resistência de DES; você também sofre metade).", undefined, "10d6"),
    ],
  },
  sobrevivente: {
    nome: "Sobrevivente", lema: "Já viu um mundo acabar. Não vai deixar acontecer de novo.", chave: "sab", mana: false, resist: ["con", "sab"],
    habilidades: [
      H("Faro de Perigo", 1, "passiva", "Nunca é pego de surpresa; +2 na iniciativa.", "1d20 + @{des_mod} + 2"),
      H("Golpe na Cabeça", 1, "1/turno", "Contra mortos-vivos e criaturas sem mente, o acerto vira crítico.", "1d20 + @{for_mod} + @{bt}", "1d8 + @{for_mod}"),
      H("Saqueador", 1, "1/dia", "Revira um lugar e acha algo útil: munição, comida, remédio ou peça.", "1d20 + @{sab_mod} + @{bt}"),
      H("Barricada", 5, "10 min", "Fortifica um cômodo: inimigos levam 1 minuto para entrar e aliados ganham +2 de CA lá dentro."),
      H("Último a Cair", 10, "1/descanso", "Ao cair a 0 PV, levanta na hora com PV igual ao seu nível."),
      H("Lenda dos Ermos", 15, "1/sessão", "Todos os aliados que te ouvirem recuperam PV e ganham 1 ponto de Destino.", undefined, "4d8"),
    ],
  },
  andarilho: {
    nome: "Andarilho do Tempo", lema: "Nightfall fica fora do tempo. Você aprendeu a escorregar pelas frestas.", chave: "sab", mana: true, resist: ["int", "sab"],
    habilidades: [
      H("Déjà Vu", 1, "1 mana, reação", "Você já viu isso acontecer: rerrola um d20 seu ou de um aliado a 9 m."),
      H("Passo Fora do Tempo", 1, "1 mana", "Some por um instante e reaparece a até 9 m, onde o tempo deixou espaço."),
      H("Eco de Outra Era", 1, "1 mana", "Puxa da linha do tempo uma arma de qualquer época por 1 minuto.", SPELL, "1d10 + @{conj_mod}"),
      H("Envelhecer", 5, "2 mana", "Um alvo envelhece anos em segundos (resistência de CON).", undefined, "3d8"),
      H("Parar o Instante", 10, "4 mana", "Congela uma criatura no tempo por 1 minuto (resistência de SAB a cada turno)."),
      H("Fenda Temporal", 15, "1/sessão", "Abre uma porta para outra época por 1 minuto — e algo sempre volta junto."),
    ],
  },
};

// ─── Origem: nativo de Nightfall (Terra Superior ou Inferior) ou chegado de outro tempo ───

export const LORE =
  "Nightfall é um continente fora da linha do tempo: não está ligado a lugar nenhum, e gente de qualquer época pode cair aqui. " +
  "Na Terra Superior, as nações disputam territórios, recursos e poder; na Terra Inferior, um continente de sombras sob o mundo, " +
  "disputam a própria sobrevivência contra coisas que não deveriam existir. Um dos poucos caminhos entre os dois fica dentro do vulcão de Pirate Haven. " +
  "Sair de Nightfall é possível, mas quase ninguém consegue.";

export interface Origin { nome: string; lema: string; vantagens: string[]; fraquezas: string[] }

export const ORIGINS: Record<string, Origin> = {
  superior: {
    nome: "Nativo da Terra Superior", lema: "Nasceu sob o céu partido de Nightfall, entre ruínas de todas as épocas.",
    vantagens: ["Sobrevivente de superfície [pv+2]", "Conhece rotas, mercados e quem manda em cada ruína"],
    fraquezas: ["Nunca saiu de Nightfall: não sabe nada do mundo de fora"],
  },
  inferior: {
    nome: "Nativo da Terra Inferior (Oca)", lema: "Criado no continente de sombras sob o mundo, onde o impossível respira.",
    vantagens: ["Já encarou o impossível: não se assusta fácil [res.sab+1]", "Sabe que nem todo monstro é inimigo"],
    fraquezas: ["Na Terra Superior, te tratam como coisa lá de baixo [res.car-1]"],
  },
  chegado: {
    nome: "Chegado de outro tempo", lema: "Caiu em Nightfall vindo de outra época. Lembra de um mundo que talvez nem exista mais.",
    vantagens: ["Memória de fora: sabe coisas que ninguém daqui sabe", "O tempo te deve uma [destino+1]"],
    fraquezas: ["Desorientado: o tempo daqui não bate com o seu [res.sab-1]"],
  },
};

export interface Era { nome: string; periodo: string; genero: string; lema: string; equipamento: string[]; vantagens: string[]; fraquezas: string[] }

/** De que tempo o chegado caiu. "outra" = época escrita à mão (sem efeitos). */
export const ERAS: Record<string, Era> = {
  antiguidade: {
    nome: "Antiguidade", periodo: "Roma, Grécia, Egito", genero: "sandália e espada", lema: "Legionários, gladiadores e sacerdotes de deuses que ninguém daqui conhece.",
    equipamento: ["Gládio", "Escudo (scutum)", "Sandálias reforçadas", "Odre de vinho"],
    vantagens: ["Disciplina de legião [ca+1]"], fraquezas: ["Pólvora e máquinas parecem feitiçaria"],
  },
  medieval: {
    nome: "Idade Média", periodo: "castelos, cruzadas, pestes", genero: "fantasia sombria", lema: "Cavaleiros, camponeses e monges que acham que morreram e foram parar no purgatório.",
    equipamento: ["Espada longa", "Cota de malha", "Tochas", "Rosário"],
    vantagens: ["Fé de ferro [res.sab+1]"], fraquezas: ["Supersticioso com tecnologia e magia alheia"],
  },
  velas: {
    nome: "Era das Velas", periodo: "piratas e navegações", genero: "aventura de alto-mar", lema: "Corsários, náufragos e cartógrafos que caíram pela borda do mapa.",
    equipamento: ["Sabre", "Pistola de pederneira", "Luneta", "Garrafa de rum"],
    vantagens: ["Pernas do mar [init+1]"], fraquezas: ["Escorbuto no passado [pv-1]"],
  },
  vapor: {
    nome: "Era do Vapor", periodo: "século XIX vitoriano", genero: "steampunk", lema: "Inventores, detetives e operários de fábrica com fuligem até a alma.",
    equipamento: ["Bengala-espada", "Relógio de bolso", "Óculos de solda", "Kit de ferramentas"],
    vantagens: ["Engenhoso [res.int+1]"], fraquezas: ["Fuligem nos pulmões [res.con-1]"],
  },
  faroeste: {
    nome: "Velho Oeste", periodo: "fronteira americana", genero: "cowboypunk", lema: "Pistoleiros, xerifes e foras da lei. A poeira de Nightfall é só mais um deserto.",
    equipamento: ["Revólver de seis tiros", "Laço", "Chapéu e poncho", "Cantil"],
    vantagens: ["Saque rápido [init+2]"], fraquezas: ["Procurado: alguém de lá também caiu aqui e quer sua cabeça"],
  },
  guerras: {
    nome: "Grandes Guerras", periodo: "1914–1945", genero: "dieselpunk", lema: "Soldados de trincheira e pilotos que atravessaram uma nuvem e nunca mais pousaram.",
    equipamento: ["Fuzil de ferrolho", "Baioneta", "Capacete e máscara de gás", "Ração"],
    vantagens: ["Veterano de trincheira [pv+3]"], fraquezas: ["Trauma de bombardeio [res.sab-1]"],
  },
  atomica: {
    nome: "Era Atômica", periodo: "anos 50 e 60", genero: "atompunk", lema: "Cientistas, astronautas e donas de casa com sorriso de propaganda e medo da bomba.",
    equipamento: ["Pistola de raios (ou quase)", "Contador Geiger", "Rádio portátil", "Latas de comida"],
    vantagens: ["Otimismo atômico [destino+1]"], fraquezas: ["Exposto à radiação [res.con-1]"],
  },
  cyber: {
    nome: "Futuro Neon", periodo: "megacidades e corporações", genero: "cyberpunk", lema: "Mercenários, hackers e assalariados com implantes que aqui não têm assistência técnica.",
    equipamento: ["Pistola smart", "Implante neural", "Deck de invasão", "Créditos (sem valor aqui)"],
    vantagens: ["Reflexos cibernéticos [init+1] [ca+1]"], fraquezas: ["Implantes sem manutenção [pv-2]"],
  },
  zumbi: {
    nome: "Apocalipse Zumbi", periodo: "o fim do mundo dos mortos", genero: "zombiepunk", lema: "Sobreviventes que fugiram de uma horda e caíram num lugar ainda mais estranho.",
    equipamento: ["Taco com pregos", "Mochila de sobrevivência", "Kit de primeiros socorros", "Rádio de pilha"],
    vantagens: ["Sobrevivente nato [pv+2] [res.con+1]"], fraquezas: ["Paranoico, dorme mal [res.sab-1]"],
  },
  ermos: {
    nome: "Ermos Nucleares", periodo: "depois da última guerra", genero: "pós-apocalipse", lema: "Andarilhos de deserto radioativo. Para eles, Nightfall é quase confortável.",
    equipamento: ["Rifle improvisado", "Armadura de sucata", "Purificador de água", "Máscara de filtro"],
    vantagens: ["Pele de ermo [ca+1]"], fraquezas: ["Doença da radiação [pv-1]"],
  },
  outra: {
    nome: "Outra época", periodo: "escreva qual", genero: "", lema: "Qualquer tempo, de qualquer lugar. Combine com o mestre.",
    equipamento: [], vantagens: [], fraquezas: [],
  },
};

/** Traços que valem para o personagem: raça + origem (+ era, se chegado). */
export function allTraits(raca: string, origem: string, era: string): string[] {
  const r = RACES[raca];
  const o = ORIGINS[origem];
  const e = origem === "chegado" ? ERAS[era] : undefined;
  return [...(r?.vantagens ?? []), ...(r?.fraquezas ?? []), ...(o?.vantagens ?? []), ...(o?.fraquezas ?? []), ...(e?.vantagens ?? []), ...(e?.fraquezas ?? [])];
}

// ─── Destino, morte e cicatrizes ────────────────────────────────────────────

export const DESTINY_USES = [
  "Rerrolar qualquer d20 seu e ficar com o melhor.",
  "Transformar um acerto em crítico.",
  "Escapar da morte: ao cair a 0 PV, fica com 1 PV — e rola uma Cicatriz.",
  "Ditar um detalhe da cena (com o mestre): \"por sorte, tem uma corda ali\".",
];

export const DEATH_RULE =
  "A 0 PV você cai. No início de cada turno role 1d20: 10+ é sucesso. Três sucessos estabilizam; três falhas, morte. 20 natural levanta com 1 PV; 1 natural conta duas falhas. Sobreviveu? Role 1d20 na tabela de Cicatrizes.";

/** Tabela de cicatrizes (d20): índice 0 = resultado 1. */
export const SCARS: [string, string][] = [
  ["Olho perdido", "Desvantagem em ataques à distância além de 9 m."],
  ["Mão trêmula", "−1 em ataques com armas leves e em magias com gestos."],
  ["Perna manca", "Deslocamento −1,5 m."],
  ["Cicatriz no rosto", "Vantagem para intimidar, desvantagem para se disfarçar."],
  ["Costelas mal coladas", "Correr ou nadar por mais de um minuto exige teste de CON CD 10."],
  ["Pesadelos", "Descanso longo exige SAB CD 10, ou recupera só metade da mana."],
  ["Medo do que te derrubou", "Desvantagem no primeiro ataque contra esse tipo de criatura."],
  ["Orelha decepada", "Desvantagem em testes de ouvir."],
  ["Dedo perdido", "−1 em ataques com armas pesadas de duas mãos."],
  ["Pulmão ferido", "Prende a respiração por metade do tempo."],
  ["Memória quebrada", "Esqueceu algo importante — o mestre escolhe o quê."],
  ["Cabelo branco", "Só aparência. Mas todo mundo pergunta o que aconteceu."],
  ["Ódio frio", "+2 de dano contra quem te derrubou; incapaz de perdoá-lo."],
  ["Voz rouca", "Não grita nem canta; −1 para convencer multidões."],
  ["Marca da morte", "Mortos-vivos te ignoram até você atacá-los."],
  ["Toque do além", "Vê espíritos de vez em quando (nem sempre amigáveis)."],
  ["Reflexos de sobrevivente", "+1 na iniciativa."],
  ["Pele endurecida", "+1 de CA permanente (anote em Bônus de armadura)."],
  ["Visão da própria morte", "Sabe como vai morrer. Uma vez, pode ignorar uma morte que não seja aquela."],
  ["Renascido", "Nenhuma sequela. Ganha 1 ponto de Destino agora."],
];

export const ALIGNMENTS = [
  "Leal e Bom", "Neutro e Bom", "Caótico e Bom",
  "Leal e Neutro", "Neutro", "Caótico e Neutro",
  "Leal e Mau", "Neutro e Mau", "Caótico e Mau",
];

export const BACKGROUNDS = [
  "Nobre caído", "Criminoso", "Eremita", "Soldado veterano", "Acólito", "Artesão de guilda", "Forasteiro", "Sábio",
  "Marinheiro", "Órfão de rua", "Caçador de recompensas", "Herdeiro amaldiçoado", "Artista de circo", "Coveiro", "Ex-cultista",
];

// ─── Contas (iguais ao criador antigo, mais bônus de treino e destino) ──────

export const XP_TABLE = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export const mod = (v: number) => Math.floor((v - 10) / 2);
export const xpNext = (nivel: number) => (nivel >= 20 ? 0 : XP_TABLE[nivel + 1]);
/** Pontos de atributo: 4 na criação + 1 nos níveis 3, 6, 9, 12, 15 e 18. */
export const totalPoints = (nivel: number) => 4 + Math.floor(nivel / 3);
export const hpMax = (nivel: number, con: number) => Math.max(1, 7 + mod(con) + (nivel - 1) * 3);
export const baseCa = (des: number) => 10 + mod(des);
export const manaMax = (nivel: number, classe: string, attrs: Record<Attr, number>) => {
  const c = CLASSES[classe];
  return c?.mana ? Math.max(0, 3 + mod(attrs[c.chave]) + (nivel - 1) * 2) : 0;
};
/** Bônus de treino: +2 (níveis 1–4) até +6 (17–20). */
export const trainBonus = (nivel: number) => 2 + Math.floor((nivel - 1) / 4);
export const destinyMax = (nivel: number, sor: number) => 1 + Math.max(0, mod(sor)) + Math.floor(nivel / 5);

/** Chave sem acento nem símbolo, para casar nomes vindos de texto. */
export const nameKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

export function findByName<T extends { nome: string }>(table: Record<string, T>, name: string): string {
  const k = nameKey(name);
  if (!k) return "";
  return Object.keys(table).find((id) => nameKey(table[id].nome) === k || id === k) ?? "";
}
