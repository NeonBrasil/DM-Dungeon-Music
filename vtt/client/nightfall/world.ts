// Nações e facções de Nightfall (lore do mestre). pos = posição do nome no mapa, em % da imagem.
// Mapas em client/public/nightfall/terra-superior.webp e terra-inferior.webp.

export type Terra = "superior" | "inferior";

export interface Faction { nome: string; resumo: string }

export interface Nation {
  nome: string;
  terra: Terra;
  genero?: string;
  resumo: string;
  /** Terra Inferior: ficha da nação. */
  detalhes?: { tecnologia: string; governo: string; habitantes: string; horror: string };
  faccoes: Record<string, Faction>;
  /** Facções demais para listar: o jogador escreve a sua (o texto é a dica do campo). */
  faccaoLivre?: string;
  pos: [number, number];
  /** O mapa não traz o nome escrito: o criador escreve por cima. */
  rotulo?: boolean;
}

export const TERRAS: Record<Terra, { nome: string; mapa: string; resumo: string }> = {
  superior: {
    nome: "Terra Superior", mapa: "/nightfall/terra-superior.webp",
    resumo: "As nações disputam territórios, recursos, influência e poder.",
  },
  inferior: {
    nome: "Terra Inferior", mapa: "/nightfall/terra-inferior.webp",
    resumo: "Um continente de sombras, onde o impossível respira. As nações disputam a própria sobrevivência contra coisas que não deveriam existir.",
  },
};

const F = (nome: string, resumo = ""): Faction => ({ nome, resumo });

export const NATIONS: Record<string, Nation> = {
  // ─── Terra Superior ───
  verdanth: {
    nome: "Verdanth", terra: "superior", pos: [9.8, 32],
    resumo: "País de maioria humana, relativamente mediano: florestas, alguns portos e trens.",
    faccoes: {
      humanos: F("Os humanos"), goblins: F("Os goblins"), slash: F("Slash", "Samurais, basicamente."),
      ogros: F("Ogros"), invect: F("Invect", "Facção de inventores."),
    },
  },
  frostclan: {
    nome: "Frostclan", terra: "superior", pos: [11.7, 16],
    resumo: "A parte gelada, vinda de Midgard: criaturas de lá e lobos. A maioria é humana.",
    faccoes: { thror: F("Thror", "Vikings, líderes de guerra."), ashar: F("Ashar", "Adeptos da natureza."), krakr: F("Krakr", "Ocultistas.") },
  },
  sylvari: {
    nome: "Sylvari", terra: "superior", pos: [7.9, 49.6],
    resumo: "Terra dos elfos e da magia.",
    faccoes: { elfico: F("Reino Élfico"), druida: F("Reino Druida"), ban: F("Clã Ban", "Uma grande nação de bandidos.") },
  },
  portus_velo: { nome: "Portus Velo", terra: "superior", pos: [22.7, 51], resumo: "Nação-estado, sem facções.", faccoes: {} },
  caldiron: { nome: "Caldiron", terra: "superior", pos: [23.3, 59.4], resumo: "Nação-estado, sem facções.", faccoes: {} },
  drakthor: {
    nome: "Drakthor", terra: "superior", pos: [28.8, 21.3],
    resumo: "A nação dos orcs e gigantes. Sem facções; na prática, uma nação fantoche de Ironox.", faccoes: {},
  },
  tidemark: {
    nome: "Tidemark Council", terra: "superior", pos: [7, 70.3],
    resumo: "Nação marítima dividida em duas grandes subnações.",
    faccoes: {
      velha: F("Nação Velha", "Hoje afundada, lar de criaturas marítimas."),
      nova: F("Nação Nova", "Tecnologia biopunk, estilo Bioshock, e armaduras subaquáticas."),
    },
  },
  stonehide: {
    nome: "Stonehide", terra: "superior", pos: [87.7, 20.5],
    resumo: "98% pedras e montanhas, muito povoada por criaturas de pedra.",
    faccoes: { alarklan: F("Alarklan", "Deseja unificar metade das nações e trazer a era da pedra.") },
  },
  grokkar: {
    nome: "Grokkar", terra: "superior", pos: [83.8, 36.9],
    resumo: "Nação de orcs violentos que desprezam humanos e amam lutar e saquear. Diferente de Drakthor, tem facções próprias — centenas delas.",
    faccoes: {},
    faccaoLivre: "Nome do bando (Grokkar tem centenas)",
  },
  kragmir: { nome: "Kragmir", terra: "superior", pos: [89.6, 55.6], resumo: "Dominada por demônios e seres do mal, sob uma líder de punho de ferro.", faccoes: {} },
  azraq: { nome: "Azraq", terra: "superior", pos: [76.6, 52.4], resumo: "Lar dos elfos negros.", faccoes: {} },
  umbrae: {
    nome: "Umbrae", terra: "superior", pos: [72.8, 16.6],
    resumo: "Nação dos ocultistas, forte em magia: exporta magos mercenários para quem puder pagar.", faccoes: {},
  },
  mossfen: {
    nome: "Mossfen", terra: "superior", pos: [55, 87.7], resumo: "Uma enorme floresta com vários pequenos clãs.", faccoes: {},
    faccaoLivre: "Nome do clã",
  },
  bulgor: {
    nome: "Khanate of Bulgor", terra: "superior", genero: "zombiepunk", pos: [16.1, 87.4],
    resumo: "Região totalmente dominada pelo crime e pela morte.", faccoes: {},
  },
  velmor: {
    nome: "Velmor", terra: "superior", pos: [35.3, 86.6],
    resumo: "Nação de um mago maligno, com monstros enormes como aranhas gigantes. Eles não atacam ninguém.", faccoes: {},
  },
  shattered_sands: { nome: "The Shattered Sands", terra: "superior", genero: "cowboypunk", pos: [58.7, 71.3], resumo: "Nação anarquista do velho oeste.", faccoes: {} },
  scorched_wastes: {
    nome: "The Scorched Wastes", terra: "superior", pos: [87.1, 68.2],
    resumo: "Área de acidentes nucleares; hoje, um deserto.", faccoes: {},
  },
  luxoris: { nome: "Luxoris", terra: "superior", pos: [65.9, 55.9], resumo: "Nação-estado trilionária.", faccoes: {} },
  aurelian: { nome: "Aurelian Empire", terra: "superior", pos: [48.5, 36], resumo: "Basicamente o Império Romano.", faccoes: {} },
  ironox: {
    nome: "Ironox", terra: "superior", pos: [47.9, 11.7],
    resumo: "Nação fascista que está começando a criar robôs e máquinas autônomas.", faccoes: {},
  },
  pirate_haven: {
    nome: "Pirate Haven", terra: "superior", pos: [45.1, 61.7],
    resumo: "Ilha com um vulcão gigante. Dentro dele fica a passagem para a Terra Inferior — e talvez exista uma razão para ela estar ali.",
    faccoes: {},
  },

  // ─── Terra Inferior ───
  nhal_zareth: {
    nome: "Nhal'Zareth", terra: "inferior", genero: "dreadpunk", pos: [23, 30],
    resumo: "Nação industrial construída em torno de uma descoberta terrível: o medo pode ser transformado em energia. Quanto maior o desespero da população, mais poderosa a indústria.",
    detalhes: {
      tecnologia: "Motores movidos por energia emocional, máquinas de tortura e armamentos industriais.",
      governo: "Estado totalitário governado por uma aristocracia industrial.",
      habitantes: "Humanos deformados, autômatos e criaturas que se alimentam de emoções.",
      horror: "Pessoas desaparecem e retornam sem capacidade de sentir medo, dor ou alegria.",
    },
    faccoes: {},
  },
  eclipsia: {
    nome: "Eclipsia", terra: "inferior", genero: "clockpunk", pos: [46.4, 28.5],
    resumo: "Civilização extremamente antiga que acredita que o universo é uma máquina gigantesca. Apesar da aparência, é uma das poucas nações verdadeiramente pacíficas da Terra Inferior.",
    detalhes: {
      tecnologia: "Autômatos, relógios astronômicos, mecanismos temporais e construções mecânicas.",
      governo: "Monarquia hereditária.",
      habitantes: "Humanos, autômatos conscientes e seres mecânicos.",
      horror: "Existem relógios que contam regressivamente até acontecimentos que ainda não ocorreram.",
    },
    faccoes: {},
  },
  vantheum: {
    nome: "Vantheum", terra: "inferior", genero: "cyberpunk", pos: [80.4, 31.3],
    resumo: "Civilização que ultrapassou os limites da humanidade: tecidos vivos, consciências artificiais e experimentos proibidos. Dizem que a IA tenta construir um corpo físico para si.",
    detalhes: {
      tecnologia: "Implantes neurais, inteligência artificial, clonagem e transferência de consciência.",
      governo: "Uma inteligência artificial que controla as grandes cidades.",
      habitantes: "Humanos modificados, ciborgues e inteligências artificiais.",
      horror: "Ninguém sabe ao certo quantos habitantes ainda possuem uma consciência original.",
    },
    faccoes: {},
  },
  morthaine: {
    nome: "Morthaine", terra: "inferior", genero: "plaguepunk", pos: [19.5, 48.3],
    resumo: "Nação devastada por doenças e experimentos biológicos, com cidades isoladas por muralhas sanitárias. Seus médicos são contratados por diversas nações.",
    detalhes: {
      tecnologia: "Medicina experimental, alquimia patológica e armas biológicas.",
      governo: "Uma ordem de médicos e cirurgiões.",
      habitantes: "Humanos, mutantes e criaturas infectadas.",
      horror: "Algumas doenças não matam o hospedeiro. Elas o transformam em algo completamente diferente.",
    },
    faccoes: {},
  },
  avarnheim: {
    nome: "Avarnheim", terra: "inferior", genero: "gothicpunk", pos: [48, 50.8],
    resumo: "Aparência assustadora, povos relativamente civilizados: castelos, catedrais e cidades à luz de milhares de velas. Oferece abrigo a refugiados.",
    detalhes: {
      tecnologia: "Engenharia arquitetônica, alquimia e mecanismos rudimentares.",
      governo: "Monarquia aristocrática.",
      habitantes: "Humanos, vampiros, espectros e outras criaturas noturnas.",
      horror: "Ninguém lá tem problema com a morte. Morrer é apenas uma mudança de condição.",
    },
    faccoes: {},
  },
  xorath: {
    nome: "Xorath", terra: "inferior", genero: "fleshpunk", pos: [77.5, 57],
    resumo: "Nação onde a própria arquitetura é viva: casas crescem, pontes se regeneram e fortalezas têm sistema imunológico. Pessoa, animal e construção se confundem.",
    detalhes: {
      tecnologia: "Engenharia de tecidos, órgãos artificiais e bioconstrução.",
      governo: "Uma entidade biológica coletiva.",
      habitantes: "Seres orgânicos modificados e criaturas artificiais.",
      horror: "Algumas construções têm consciência e reconhecem seus habitantes.",
    },
    faccoes: {},
  },
  othrys: {
    nome: "Othrys", terra: "inferior", genero: "voidpunk", pos: [54, 12],
    resumo: "Região onde as leis naturais não funcionam direito: cidades suspensas e construções impossíveis. Ninguém sabe se é mesmo uma nação.",
    detalhes: {
      tecnologia: "Manipulação espacial, portais e artefatos extradimensionais.",
      governo: "Desconhecido.",
      habitantes: "Criaturas sem anatomia compreensível.",
      horror: "Há lugares onde uma hora equivale a décadas em outras regiões.",
    },
    faccoes: {},
  },
  nexum: {
    nome: "Nexum", terra: "inferior", pos: [71, 76], rotulo: true,
    resumo: "Região do sudeste da Terra Inferior. Como em Vantheum, seus habitantes trocam partes do corpo por componentes artificiais — mas em Nexum a tecnologia é puramente mecânica.",
    faccoes: {},
  },
  eldrath: {
    nome: "Eldrath", terra: "inferior", genero: "paganpunk", pos: [27.5, 75],
    resumo: "Sociedade tribal que considera a natureza uma entidade sagrada. Uma das poucas nações que conhece a fundo os perigos da Terra Inferior.",
    detalhes: {
      tecnologia: "Rituais, alquimia natural e artefatos ancestrais.",
      governo: "Círculos de sacerdotes e líderes tribais.",
      habitantes: "Humanos, espíritos, feras e criaturas antigas.",
      horror: "Seus deuses são reais. E nem todos se interessam pela sobrevivência da humanidade.",
    },
    faccoes: {},
  },
};

/** Nome da facção: da lista da nação ou, se a nação aceita, a escrita pelo jogador. */
export function factionName(nacao: string, faccao: string, outra: string): string {
  const n = NATIONS[nacao];
  if (!n) return "";
  return n.faccoes[faccao]?.nome ?? (n.faccaoLivre ? outra.trim() : "");
}

/** "Verdanth · Invect" / "Avarnheim". */
export function nationLabel(nacao: string, faccao: string, outra = ""): string {
  const n = NATIONS[nacao];
  if (!n) return "";
  const f = factionName(nacao, faccao, outra);
  return f ? `${n.nome} · ${f}` : n.nome;
}
