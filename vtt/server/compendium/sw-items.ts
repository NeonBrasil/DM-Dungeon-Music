// Itens Star Wars — Era da República. Escritos para esta mesa no estilo do SW5e (não oficial):
// dano, propriedades e preços em créditos são aproximados; ajuste à vontade.
import type { Item } from "../../shared/compendium.ts";

type Rest = Omit<Item, "id" | "name" | "cat">;
const folder = (cat: string) => (id: string, name: string, rest: Rest): Item => ({ id: `sw-${id}`, name, cat, ...rest });

const blaster = folder("Blasters");
const saber = folder("Sabres de luz");
const melee = folder("Armas brancas");
const armor = folder("Armaduras e escudos");
const boom = folder("Explosivos");
const gear = folder("Equipamento");
const relic = folder("Relíquias da Força");

export const SW_ITEMS: Item[] = [
  // ─── Blasters ──────────────────────────────────────────────────────────────
  blaster("holdout", "Pistola blaster de bolso", { sub: "Blaster simples", cost: "250 cr", weight: "0,5 kg", dmg: "1d4", dmgType: "energia", abil: "dex", props: "leve, oculta, distância 9/36 m, recarga 6", desc: "Cabe na manga ou na bota. Vantagem em testes para escondê-la." }),
  blaster("blaster-pistol", "Pistola blaster", { sub: "Blaster simples", cost: "400 cr", weight: "1 kg", dmg: "1d6", dmgType: "energia", abil: "dex", props: "leve, distância 12/48 m, recarga 16" }),
  blaster("heavy-pistol", "Pistola blaster pesada (DL-44)", { sub: "Blaster de guerra", cost: "750 cr", weight: "1,5 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "distância 12/48 m, recarga 12" }),
  blaster("dc17", "Pistola de clone DC-17", { sub: "Blaster de guerra (militar)", cost: "650 cr", weight: "1 kg", dmg: "1d6", dmgType: "energia", abil: "dex", props: "leve, distância 12/48 m, recarga 20", desc: "Arma padrão de oficiais e soldados ARC. Comum aos pares." }),
  blaster("ll30", "Pistola LL-30", { sub: "Blaster simples", cost: "500 cr", weight: "1 kg", dmg: "1d6", dmgType: "energia", abil: "dex", props: "leve, distância 12/48 m, recarga 16", desc: "Pistola compacta preferida por caçadores (Cad Bane usa duas)." }),
  blaster("westar35", "Pistola WESTAR-35", { sub: "Blaster de guerra", cost: "800 cr", weight: "1,5 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "leve, distância 12/48 m, recarga 16", desc: "Feita em Concord Dawn; marca dos mandalorianos da Vigília da Morte." }),
  blaster("dc15s", "Carabina de clone DC-15S", { sub: "Blaster de guerra (militar)", cost: "900 cr", weight: "2,5 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "distância 18/72 m, recarga 24" }),
  blaster("dc15a", "Rifle blaster DC-15A", { sub: "Blaster de guerra (militar)", cost: "1.200 cr", weight: "4 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "duas mãos, distância 30/120 m, recarga 20", desc: "Rifle padrão do Grande Exército da República." }),
  blaster("e5", "Rifle blaster E-5", { sub: "Blaster de guerra", cost: "500 cr", weight: "3 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "duas mãos, distância 24/96 m, recarga 16", desc: "Arma barata dos droides de batalha B1. Superaquece: com 1 no d20, não dispara até o fim do próximo turno." }),
  blaster("dc17m", "Rifle de comando DC-17m", { sub: "Blaster de guerra (militar)", cost: "2.500 cr", weight: "5 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "duas mãos, distância 30/120 m, recarga 30, modular", desc: "Troca de acessório com uma ação bônus: modo atirador (dano 1d12, distância 60/240 m) ou lança-granadas (3d6 cinético, esfera de 3 m, Des CD 13)." }),
  blaster("dc15x", "Rifle de precisão DC-15x", { sub: "Blaster de guerra (militar)", cost: "2.000 cr", weight: "6 kg", dmg: "1d12", dmgType: "energia", abil: "dex", props: "duas mãos, pesada, distância 60/240 m, recarga 6" }),
  blaster("z6", "Blaster rotativo Z-6", { sub: "Blaster pesado (militar)", cost: "4.000 cr", weight: "14 kg", dmg: "1d10", dmgType: "energia", abil: "dex", props: "duas mãos, pesada, rajada, For 13, distância 24/96 m, recarga 60", desc: "Rajada: em vez de um ataque, cubo de 3 m a até 24 m; cada criatura faz salvaguarda de Destreza (CD 8 + bônus de proficiência + Des) ou sofre o dano da arma." }),
  blaster("bowcaster", "Besta energética (bowcaster)", { sub: "Blaster de guerra (wookiee)", cost: "1.500 cr", weight: "7 kg", dmg: "1d10", dmgType: "energia", abil: "str", props: "duas mãos, pesada, For 13, distância 18/72 m, recarga 1", desc: "Arma tradicional dos wookiees. Usa Força em vez de Destreza." }),
  blaster("energy-bow", "Arco de energia das Nightsisters", { sub: "Arma exótica", cost: "1.000 cr (raro)", weight: "1,5 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "duas mãos, distância 30/120 m, silencioso", desc: "Flechas de energia verde criadas pela magia de Dathomir." }),
  blaster("ion-rifle", "Rifle de íons", { sub: "Blaster de guerra", cost: "1.000 cr", weight: "4 kg", dmg: "1d10", dmgType: "íon", abil: "dex", props: "duas mãos, distância 18/72 m, recarga 12", desc: "Dano de íon: droides e veículos são vulneráveis; criaturas vivas sofrem só metade." }),
  blaster("sonic-blaster", "Blaster sônico geonosiano", { sub: "Arma exótica", cost: "800 cr", weight: "2 kg", dmg: "1d8", dmgType: "sônico", abil: "dex", props: "distância 15/60 m, recarga 12" }),
  blaster("rps6", "Lança-mísseis RPS-6", { sub: "Arma pesada", cost: "6.000 cr", weight: "12 kg", dmg: "6d6", dmgType: "cinético", abil: "dex", props: "duas mãos, pesada, distância 45/180 m, recarga 1", desc: "O míssil explode numa esfera de 3 m de raio: cada criatura faz salvaguarda de Destreza CD 15 ou sofre o dano (metade se passar). Dano dobrado contra veículos." }),

  // ─── Sabres de luz ─────────────────────────────────────────────────────────
  saber("lightsaber", "Sabre de luz", { sub: "Arma de luz", cost: "Não se vende (construído pelo Jedi)", weight: "1 kg", dmg: "1d8", dmgType: "energia", abil: "str", props: "luminoso, versátil (1d10)", desc: "Lâmina de plasma focada por um cristal kyber. Ilumina 3 m. Corta quase tudo, menos beskar, cortosis e phrik." }),
  saber("shoto", "Shoto (sabre curto)", { sub: "Arma de luz", cost: "Não se vende", weight: "0,5 kg", dmg: "1d6", dmgType: "energia", abil: "dex", props: "acuidade, leve, luminoso", desc: "Usado como segunda lâmina (Yoda e Ahsoka usam um)." }),
  saber("double-saber", "Sabre de luz de lâmina dupla", { sub: "Arma de luz", cost: "Não se vende", weight: "1,5 kg", dmg: "1d8", dmgType: "energia", abil: "str", props: "duas mãos, lâmina dupla, luminoso", desc: "Lâmina dupla: ao atacar com a ação Atacar, pode fazer um ataque extra com a outra ponta como ação bônus (sem somar o atributo ao dano)." }),
  saber("curved-saber", "Sabre de luz de cabo curvo", { sub: "Arma de luz", cost: "Não se vende", weight: "1 kg", dmg: "1d8", dmgType: "energia", abil: "dex", props: "acuidade, luminoso, versátil (1d10)", desc: "Feito para o estilo Makashi (Conde Dooku, Asajj Ventress)." }),
  saber("training-saber", "Sabre de treino", { sub: "Arma de luz", cost: "Não se vende", weight: "1 kg", dmg: "1d4", dmgType: "energia", abil: "dex", props: "acuidade, leve, luminoso, não letal", desc: "Lâmina de baixa potência dos jovens do Templo: queima, mas não corta." }),
  saber("darksaber", "Sabre Negro", { sub: "Arma de luz (lendária)", cost: "Única", weight: "1 kg", dmg: "1d10", dmgType: "energia", abil: "str", props: "luminoso, versátil (1d12)", rarity: "Lendária", desc: "Lâmina negra e achatada criada por Tarre Vizsla. Quem a conquista em combate tem direito a governar Mandalore." }),

  // ─── Armas brancas ─────────────────────────────────────────────────────────
  melee("vibroknife", "Vibrofaca", { sub: "Vibroarma simples", cost: "100 cr", weight: "0,5 kg", dmg: "1d4", dmgType: "cinético", abil: "dex", props: "acuidade, leve, arremesso (6/18 m)" }),
  melee("vibroblade", "Vibrolâmina", { sub: "Vibroarma simples", cost: "250 cr", weight: "1 kg", dmg: "1d6", dmgType: "cinético", abil: "dex", props: "acuidade, leve" }),
  melee("vibrosword", "Vibroespada", { sub: "Vibroarma de guerra", cost: "600 cr", weight: "2 kg", dmg: "1d8", dmgType: "cinético", abil: "str", props: "versátil (1d10)" }),
  melee("vibroaxe", "Vibromachado", { sub: "Vibroarma de guerra", cost: "800 cr", weight: "4 kg", dmg: "1d12", dmgType: "cinético", abil: "str", props: "duas mãos, pesada" }),
  melee("electrostaff", "Eletrobastão", { sub: "Arma de guerra", cost: "1.500 cr", weight: "3 kg", dmg: "1d8", dmgType: "cinético", abil: "str", props: "duas mãos, alcance, mais 1d6 elétrico", desc: "Bastão de phrik dos MagnaGuards: aguenta golpes de sabre de luz." }),
  melee("electrowhip", "Eletrochicote zygerriano", { sub: "Arma de guerra", cost: "500 cr", weight: "1,5 kg", dmg: "1d4", dmgType: "elétrico", abil: "dex", props: "acuidade, alcance", desc: "Quem é acertado não pode usar reações até o início do próprio turno." }),
  melee("gaffi", "Bastão gaderffii", { sub: "Arma simples (tusken)", cost: "50 cr", weight: "3 kg", dmg: "1d8", dmgType: "cinético", abil: "str", props: "versátil (1d10)" }),
  melee("stun-baton", "Bastão de choque", { sub: "Arma simples", cost: "150 cr", weight: "1 kg", dmg: "1d6", dmgType: "elétrico", abil: "str", props: "não letal", desc: "Pode atordoar: o alvo faz salvaguarda de Constituição CD 12 ou fica atordoado até o fim do próximo turno (1/turno)." }),

  // ─── Armaduras e escudos ───────────────────────────────────────────────────
  armor("combat-suit", "Traje de combate", { sub: "Armadura leve", cost: "200 cr", weight: "4 kg", ac: "11 + Des" }),
  armor("reinforced-jacket", "Jaqueta reforçada", { sub: "Armadura leve", cost: "450 cr", weight: "5 kg", ac: "12 + Des" }),
  armor("hunter-armor", "Armadura de caçador", { sub: "Armadura média", cost: "1.500 cr", weight: "10 kg", ac: "14 + Des (máx. 2)" }),
  armor("clone-phase1", "Armadura de clone fase I", { sub: "Armadura média (militar)", cost: "2.000 cr", weight: "12 kg", ac: "15 + Des (máx. 2)", props: "desvantagem em Furtividade", desc: "Visor com filtro de ar e comunicador." }),
  armor("clone-phase2", "Armadura de clone fase II", { sub: "Armadura média (militar)", cost: "2.500 cr", weight: "11 kg", ac: "15 + Des (máx. 2)", desc: "Mais leve que a fase I; visor com visão no escuro de 18 m." }),
  armor("arc-armor", "Armadura ARC", { sub: "Armadura média (militar)", cost: "4.000 cr", weight: "12 kg", ac: "16 + Des (máx. 2)", desc: "Inclui ombreira de comando, saiote e encaixe para mochila a jato." }),
  armor("katarn", "Armadura Katarn (comando clone)", { sub: "Armadura pesada (militar)", cost: "8.000 cr", weight: "25 kg", ac: "18", props: "For 15, desvantagem em Furtividade", desc: "Selada contra o vácuo por 10 minutos; visor tático com vantagem em Percepção visual." }),
  armor("mando-armor", "Armadura mandaloriana", { sub: "Armadura pesada", cost: "6.000 cr", weight: "20 kg", ac: "17", props: "For 13", desc: "Liga de duraço com detalhes em beskar; encaixe para mochila a jato." }),
  armor("beskar", "Armadura de beskar", { sub: "Armadura pesada (rara)", cost: "Inestimável", weight: "18 kg", ac: "18", props: "For 13", rarity: "Muito rara", desc: "Ferro mandaloriano: resistência a dano de energia de sabres de luz e vantagem em salvaguardas contra calor." }),
  armor("battle-armor", "Armadura de batalha pesada", { sub: "Armadura pesada", cost: "3.000 cr", weight: "25 kg", ac: "17", props: "For 15, desvantagem em Furtividade" }),
  armor("energy-shield", "Gerador de escudo pessoal", { sub: "Escudo", cost: "2.000 cr", weight: "1 kg", ac: "+2", desc: "Campo de energia preso ao braço; não ocupa a mão. Desliga por 1 rodada se sofrer dano de íon." }),
  armor("riot-shield", "Escudo de choque", { sub: "Escudo", cost: "300 cr", weight: "5 kg", ac: "+2" }),

  // ─── Explosivos ────────────────────────────────────────────────────────────
  boom("frag-grenade", "Granada de fragmentação", { sub: "Explosivo", cost: "200 cr", weight: "0,5 kg", dmg: "3d6", dmgType: "cinético", props: "arremesso 18 m, esfera 3 m, Des CD 13", desc: "Cada criatura na área faz salvaguarda de Destreza CD 13: dano total se falhar, metade se passar." }),
  boom("thermal-detonator", "Detonador térmico", { sub: "Explosivo (ilegal)", cost: "2.000 cr", weight: "0,5 kg", dmg: "8d6", dmgType: "fogo", props: "arremesso 18 m, esfera 6 m, Des CD 15", desc: "Pode ser armado com temporizador ou como gatilho de homem morto (explode se soltar)." }),
  boom("ion-grenade", "Granada de íons", { sub: "Explosivo", cost: "300 cr", weight: "0,5 kg", dmg: "4d6", dmgType: "íon", props: "arremesso 18 m, esfera 3 m, Des CD 13", desc: "Afeta só droides, veículos e eletrônicos; droides que falharem ficam incapacitados até o fim do próximo turno." }),
  boom("stun-grenade", "Granada de atordoamento", { sub: "Explosivo", cost: "250 cr", weight: "0,5 kg", props: "arremesso 18 m, esfera 3 m, Con CD 13", desc: "Cada criatura viva na área faz salvaguarda de Constituição CD 13 ou fica atordoada até o fim do próximo turno dela." }),
  boom("smoke-grenade", "Granada de fumaça", { sub: "Explosivo", cost: "100 cr", weight: "0,5 kg", props: "arremesso 18 m, esfera 6 m", desc: "Escuridão densa na área por 1 minuto (vento forte dispersa em 1 rodada)." }),
  boom("detonite", "Carga de detonite", { sub: "Explosivo de demolição", cost: "500 cr", weight: "1 kg", dmg: "6d6", dmgType: "cinético", props: "colocado, esfera 4,5 m, Des CD 15", desc: "Detonado por controle remoto ou temporizador. Dano dobrado contra portas e estruturas." }),
  boom("proximity-mine", "Mina de proximidade", { sub: "Explosivo", cost: "750 cr", weight: "1 kg", dmg: "4d6", dmgType: "cinético", props: "colocado, esfera 3 m, Des CD 14", desc: "Percebê-la exige Sabedoria (Percepção) CD 15." }),

  // ─── Equipamento ───────────────────────────────────────────────────────────
  gear("comlink", "Comlink", { cost: "25 cr", weight: "—", desc: "Comunicador de voz com alcance planetário (curto sem satélites)." }),
  gear("macrobinoculars", "Macrobinóculos", { cost: "150 cr", weight: "0,5 kg", desc: "Vantagem em Percepção para ver detalhes a grande distância; mede distâncias e marca alvos." }),
  gear("medpac", "Medpac", { cost: "100 cr", weight: "0,5 kg", dmg: "2d4+2", dmgType: "cura", desc: "Com uma ação, uma criatura viva recupera 2d4 + 2 PV. Uso único." }),
  gear("medkit", "Kit médico", { cost: "300 cr", weight: "2 kg", desc: "10 usos: estabiliza uma criatura a 0 PV sem teste de Medicina; vantagem em testes de Medicina." }),
  gear("bacta-patch", "Adesivo de bacta", { cost: "50 cr", weight: "—", desc: "Ação bônus: recupera 1d4 PV e encerra um sangramento ou queimadura." }),
  gear("stim-adrenal", "Estimulante adrenal", { cost: "200 cr", weight: "—", desc: "Por 1 minuto, vantagem em testes e salvaguardas de Força. Depois, um nível de exaustão." }),
  gear("tool-kit", "Kit de ferramentas", { cost: "250 cr", weight: "5 kg", desc: "Necessário para consertar droides, veículos e equipamentos." }),
  gear("slicer-kit", "Kit de fatiador (slicer)", { cost: "500 cr", weight: "1 kg", desc: "Vantagem em testes de Tecnologia para invadir computadores e travas." }),
  gear("fusioncutter", "Cortador de fusão", { cost: "100 cr", weight: "1 kg", desc: "Corta metal e solda. Usado como arma improvisada: 1d6 de fogo." }),
  gear("datapad", "Datapad", { cost: "100 cr", weight: "0,5 kg", desc: "Computador portátil para mapas, registros e mensagens." }),
  gear("holoprojector", "Holoprojetor portátil", { cost: "300 cr", weight: "0,5 kg", desc: "Grava e projeta mensagens holográficas." }),
  gear("glow-rod", "Bastão luminoso", { cost: "10 cr", weight: "0,5 kg", desc: "Luz forte num cone de 9 m por 10 horas." }),
  gear("breather", "Respirador aquático A99", { cost: "350 cr", weight: "—", desc: "Respira debaixo d'água ou em gases tóxicos por até 2 horas." }),
  gear("grappling-hook", "Lançador de gancho", { cost: "200 cr", weight: "1 kg", desc: "Dispara cabo de 15 m que aguenta 300 kg; recolhe sozinho." }),
  gear("jetpack", "Mochila a jato", { cost: "4.000 cr", weight: "10 kg", desc: "Voo 9 m por turno durante até 1 minuto; recarrega num descanso curto." }),
  gear("binders", "Algemas (binders)", { cost: "50 cr", weight: "0,5 kg", desc: "Escapar exige Destreza CD 18 ou romper com Força CD 22." }),
  gear("restraining-bolt", "Parafuso restritor", { cost: "100 cr", weight: "—", desc: "Preso a um droide, o impede de agir contra o dono do controle." }),
  gear("utility-belt", "Cinto utilitário", { cost: "50 cr", weight: "0,5 kg", desc: "Bolsos para rações, carga de energia, cabo e bastão luminoso." }),
  gear("power-cell", "Célula de energia", { cost: "10 cr", weight: "—", desc: "Recarrega um blaster (munição)." }),
  gear("ration-pack", "Ração (1 dia)", { cost: "5 cr", weight: "0,5 kg" }),
  gear("speeder-bike", "Moto speeder", { cost: "8.000 cr", weight: "—", desc: "Veículo para 1–2 pessoas; até 500 km/h." }),

  // ─── Relíquias da Força ────────────────────────────────────────────────────
  relic("kyber", "Cristal kyber", { sub: "Relíquia", cost: "Inestimável", rarity: "Raro", desc: "O coração do sabre de luz. Escolhe o Jedi que o encontra (as cavernas de Ilum)." }),
  relic("jedi-holocron", "Holocron Jedi", { sub: "Relíquia", cost: "Inestimável", rarity: "Muito raro", desc: "Guarda ensinamentos de um mestre. Só abre com a Força (Sabedoria CD 15). Pode ensinar um poder da Força." }),
  relic("sith-holocron", "Holocron Sith", { sub: "Relíquia", cost: "Inestimável", rarity: "Muito raro", desc: "Pirâmide vermelha com segredos do lado sombrio. Quem o estuda faz Sabedoria CD 15 ou é seduzido pelo lado sombrio." }),
  relic("nightsister-talisman", "Talismã das Nightsisters", { sub: "Relíquia", cost: "—", rarity: "Raro", desc: "Amuleto de ícor verde: 1/dia, o portador fica invisível até o fim do próximo turno." }),
  relic("ichor-vial", "Frasco de ícor verde", { sub: "Relíquia", cost: "—", rarity: "Incomum", desc: "Arremessado (6/18 m): esfera de 1,5 m, Con CD 13 ou 3d6 de dano necrótico." }),
];
