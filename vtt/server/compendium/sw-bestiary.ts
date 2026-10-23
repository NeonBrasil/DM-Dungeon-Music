// Bestiário Star Wars — Era da República / Guerras Clônicas. Blocos escritos para esta mesa no estilo
// do SW5e (não oficial): números aproximados pelas regras do 5e; ajuste à vontade.
// Tipos de dano do SW5e: energia (blasters, sabres), cinético, íon (fere droides), elétrico, força, necrótico, sônico.
import type { Monster } from "../../shared/compendium.ts";
import { act, hit, mon } from "./author.ts";

const SEP = "Confederação (droides)";
const REP = "República e Jedi";
const NS = "Nightsisters e Dathomir";
const DARK = "Lado Sombrio";
const UND = "Submundo e mercenários";
const MANDO = "Mandalorianos";
const BEAST = "Criaturas";

const DROID: [string, string] = ["Natureza de droide", "Não precisa respirar, comer, beber nem dormir. Doenças e venenos não o afetam."];
const droid = { vuln: "íon", immune: "veneno", condImmune: "envenenado, doente" };
const SQUAD: [string, string] = ["Táticas de esquadrão", "Tem vantagem na jogada de ataque contra uma criatura se ao menos um aliado que não esteja incapacitado estiver a até 1,5 m dela."];
const DEFLECT = (bonus: number, atk: number): [string, string] => [
  "Defletir",
  `Quando é alvo de um ataque à distância que possa ver, soma +${bonus} à CA contra ele. Se o ataque errar e for um disparo de energia, pode devolvê-lo a uma criatura a até 9 m (ataque +${atk}, mesmo dano).`,
];
const FORCE_MIND: [string, string] = ["Mente treinada na Força", "Vantagem em salvaguardas contra ficar amedrontado ou enfeitiçado."];

export const SW_BESTIARY: Monster[] = [
  // ─── Confederação ──────────────────────────────────────────────────────────
  mon({
    id: "sw-b1-battle-droid", name: "Droide de batalha B1", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 13, acNote: "chassi de liga", hd: "2d8+2", speed: "9 m", abil: [10, 12, 12, 8, 8, 6], cr: "1/4",
    languages: "Básico galáctico, binário", ...droid,
    traits: [DROID, ["Depende de ordens", "Sem um droide comandante aliado a até 18 m, tem desvantagem em testes de Inteligência e Sabedoria."]],
    actions: [
      hit("Rifle blaster E-5", "ranged", 3, "24/96 m", "1d8+1", "de energia"),
      hit("Coronhada", "melee", 2, "1,5 m", "1d4", "cinético"),
    ],
  }),
  mon({
    id: "sw-oom-commander", name: "Droide comandante B1 (OOM)", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 13, acNote: "chassi de liga", hd: "3d8+3", speed: "9 m", abil: [10, 12, 12, 10, 10, 8], cr: "1/2",
    languages: "Básico galáctico, binário", ...droid,
    traits: [DROID, ["Rede de comando", "Droides B1 aliados a até 18 m ignoram Depende de ordens."]],
    actions: [
      hit("Pistola blaster", "ranged", 3, "12/48 m", "1d6+1", "de energia"),
      act("Ordem (ação bônus)", "Um droide aliado a até 18 m que possa ouvi-lo usa a reação para mover até metade do deslocamento ou fazer um ataque."),
    ],
  }),
  mon({
    id: "sw-b2-super-battle-droid", name: "Super droide de batalha B2", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 16, acNote: "blindagem pesada", hd: "6d8+12", speed: "9 m", abil: [16, 12, 14, 6, 8, 5], cr: "2",
    languages: "Básico galáctico, binário", ...droid,
    traits: [DROID],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com os blasters de pulso."),
      hit("Blaster de pulso", "ranged", 3, "24/96 m", "1d10+1", "de energia"),
      hit("Pancada", "melee", 5, "1,5 m", "1d8+3", "cinético"),
      act("Lança-granadas de pulso (recarga 5–6)", "Esfera de 3 m de raio num ponto a até 30 m. Cada criatura nela faz uma salvaguarda de Destreza CD 12: 10 (3d6) de dano cinético se falhar, metade se passar.", "3d6"),
    ],
  }),
  mon({
    id: "sw-bx-commando-droid", name: "Droide comando BX", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 15, acNote: "chassi leve", hd: "6d8+6", speed: "12 m", abil: [12, 17, 12, 10, 12, 6], cr: "2",
    skills: "Atletismo +3, Furtividade +5, Percepção +3", languages: "Básico galáctico, binário", ...droid,
    traits: [DROID, ["Ágil", "Pode usar Disparada ou Esconder como ação bônus."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques: com a vibrolâmina ou com o rifle."),
      hit("Vibrolâmina", "melee", 5, "1,5 m", "1d6+3", "cinético"),
      hit("Rifle blaster E-5", "ranged", 5, "24/96 m", "1d8+3", "de energia"),
    ],
  }),
  mon({
    id: "sw-droideka", name: "Droideka (droide destruidor)", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 15, acNote: "chassi de bronzio", hd: "7d8+21", speed: "4,5 m (forma de roda 18 m)", abil: [14, 14, 16, 6, 10, 3], cr: "4",
    languages: "binário", ...droid,
    traits: [
      DROID,
      ["Escudo defletor", "Fora da forma de roda, ataques à distância contra o droideka têm desvantagem e ele tem resistência a dano de energia e cinético de ataques à distância. O escudo cai até o início do próximo turno dele se sofrer 10 ou mais de dano de íon de uma vez."],
      ["Forma de roda", "Como ação bônus, se fecha numa roda (deslocamento 18 m, sem escudo, não ataca) ou se abre."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com os blasters gêmeos."),
      hit("Blasters gêmeos", "ranged", 4, "18/72 m", "2d6+2", "de energia"),
    ],
  }),
  mon({
    id: "sw-magnaguard", name: "MagnaGuard IG-100", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 16, acNote: "chassi blindado", hd: "10d8+30", speed: "9 m", abil: [18, 16, 16, 10, 12, 6], cr: "5",
    skills: "Atletismo +7, Percepção +4", languages: "Básico galáctico, binário", ...droid,
    traits: [
      DROID,
      ["Eletrobastão", "O bastão é de phrik: resiste a sabres de luz."],
      ["Persistente", "A primeira vez que cai a 0 PV por dano que não seja de íon, fica com 1 PV: perde a cabeça e segue lutando, com desvantagem em Percepção."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o eletrobastão."),
      hit("Eletrobastão", "melee", 7, "3 m", "1d8+4", "cinético", { plus: ["1d6", "elétrico"] }),
    ],
    reactions: [["Aparar", "Soma +3 à CA contra um ataque corpo a corpo que o acertaria. Precisa ver o atacante e estar com o bastão."]],
  }),
  mon({
    id: "sw-tactical-droid", name: "Droide tático série T", group: SEP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 14, acNote: "chassi de liga", hd: "6d8", speed: "9 m", abil: [10, 12, 10, 18, 14, 8], cr: "2",
    skills: "Investigação +6, Conhecimento +6, Percepção +4", languages: "Básico galáctico, binário e mais seis idiomas", ...droid,
    traits: [DROID, ["Rede tática", "Droides aliados a até 18 m somam +2 na iniciativa."]],
    actions: [
      hit("Pistola blaster", "ranged", 3, "12/48 m", "1d6+1", "de energia"),
      act("Analisar alvo (ação bônus)", "Escolhe uma criatura a até 36 m. Até o início do próximo turno do droide, droides aliados têm vantagem nos ataques contra ela."),
    ],
  }),
  mon({
    id: "sw-dwarf-spider-droid", name: "Droide aranha anão DSD1", group: SEP, size: "Grande", type: "droide", alignment: "sem tendência",
    ac: 15, acNote: "chassi blindado", hd: "6d10+12", speed: "9 m, escalada 9 m", abil: [14, 14, 14, 4, 10, 3], cr: "3",
    languages: "binário", ...droid,
    traits: [DROID, ["Patas de aranha", "Escala superfícies difíceis, inclusive de cabeça para baixo, sem testes."]],
    actions: [
      hit("Canhão blaster", "ranged", 4, "36/144 m", "2d10+2", "de energia"),
      act("Rajada contínua (recarga 5–6)", "Linha de 18 m por 1,5 m. Cada criatura nela faz uma salvaguarda de Destreza CD 12: 22 (4d10) de dano de energia se falhar, metade se passar.", "4d10"),
    ],
  }),
  mon({
    id: "sw-crab-droid", name: "Droide caranguejo LM-432", group: SEP, size: "Grande", type: "droide", alignment: "sem tendência",
    ac: 15, acNote: "carapaça blindada", hd: "7d10+14", speed: "12 m, escalada 9 m", abil: [16, 14, 14, 4, 10, 3], cr: "3",
    languages: "binário", ...droid,
    traits: [DROID],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com os blasters gêmeos ou um pisão e um disparo."),
      hit("Blasters gêmeos", "ranged", 4, "24/96 m", "1d10+2", "de energia"),
      hit("Pisão", "melee", 5, "1,5 m", "1d10+3", "cinético"),
      act("Jato de lama (recarga 6)", "Cone de 4,5 m. Cada criatura nele faz uma salvaguarda de Força CD 12 ou fica impedida até gastar uma ação para se soltar."),
    ],
  }),
  mon({
    id: "sw-octuptarra", name: "Tri-droide Octuptarra", group: SEP, size: "Grande", type: "droide", alignment: "sem tendência",
    ac: 14, acNote: "chassi de liga", hd: "6d10+18", speed: "9 m", abil: [12, 14, 16, 4, 12, 3], cr: "3",
    skills: "Percepção +3", languages: "binário", ...droid,
    traits: [DROID, ["Visão em 360°", "Não pode ser flanqueado e tem vantagem em testes de Percepção baseados em visão."]],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com as torretas, cada um num alvo diferente se quiser."),
      hit("Torreta laser", "ranged", 4, "24/96 m", "1d8+2", "de energia"),
    ],
  }),
  mon({
    id: "sw-buzz-droid", name: "Droide zumbido (buzz droid)", group: SEP, size: "Miúdo", type: "droide", alignment: "sem tendência",
    ac: 14, hd: "2d4", speed: "4,5 m, escalada 4,5 m, voo 9 m", abil: [3, 16, 10, 6, 10, 3], cr: "1/8",
    languages: "binário", ...droid,
    traits: [DROID, ["Sabotador", "Contra droides, veículos, naves e estruturas, a serra causa 7 (2d6) de dano cinético extra."]],
    actions: [hit("Serra e garras", "melee", 5, "1,5 m", "1d4+3", "cinético")],
  }),
  mon({
    id: "sw-geonosian-drone", name: "Guerreiro geonosiano", group: SEP, size: "Médio", type: "humanoide (geonosiano)", alignment: "leal e mau",
    ac: 13, acNote: "exoesqueleto", hd: "3d8+3", speed: "9 m, voo 12 m", abil: [12, 14, 12, 8, 10, 7], cr: "1/2",
    skills: "Percepção +2", senses: "visão no escuro 18 m", languages: "Geonosiano",
    traits: [["Mente de colmeia", "Vantagem em salvaguardas contra ficar enfeitiçado."]],
    actions: [
      hit("Blaster sônico", "ranged", 4, "15/60 m", "1d8+2", "sônico"),
      hit("Garras", "melee", 3, "1,5 m", "1d6+1", "cinético"),
    ],
  }),
  mon({
    id: "sw-general-grievous", name: "General Grievous", group: SEP, size: "Médio", type: "humanoide (kaleesh, ciborgue)", alignment: "leal e mau",
    ac: 18, acNote: "corpo de duraço", hd: "22d8+66", speed: "12 m, escalada 9 m", abil: [18, 20, 16, 16, 12, 14], cr: "12",
    saves: "Des +9, Con +7, Sab +5", skills: "Atletismo +8, Intimidação +6, Percepção +5", senses: "visão no escuro 18 m",
    languages: "Básico galáctico, kaleesh, binário", immune: "veneno", condImmune: "envenenado",
    traits: [
      ["Quatro braços", "Os braços se dividem: segura até quatro sabres de luz e pode escalar como aranha."],
      ["Covarde calculista", "Quando fica abaixo da metade dos PV, pode usar Disparada como reação, sem provocar ataques de oportunidade."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz quatro ataques com sabre de luz."),
      hit("Sabre de luz", "melee", 9, "1,5 m", "2d8+5", "de energia"),
      act("Redemoinho de sabres (recarga 5–6)", "Gira os braços: cada criatura a até 3 m faz uma salvaguarda de Destreza CD 17: 27 (6d8) de dano de energia se falhar, metade se passar.", "6d8"),
    ],
    legendary: [
      ["Golpe", "Faz um ataque com sabre de luz."],
      ["Recuar", "Move até metade do deslocamento sem provocar ataques de oportunidade."],
      ["Investida (custa 2)", "Move até o deslocamento e faz dois ataques com sabre de luz."],
    ],
  }),
  mon({
    id: "sw-count-dooku", name: "Conde Dooku (Darth Tyranus)", group: SEP, size: "Médio", type: "humanoide (humano)", alignment: "leal e mau",
    ac: 17, acNote: "Defesa Makashi", hd: "20d8+40", speed: "9 m", abil: [12, 20, 14, 18, 18, 20], cr: "15",
    saves: "Des +10, Sab +9, Car +10", skills: "Enganação +10, Intuição +9, Conhecimento +9, Percepção +9, Persuasão +10",
    languages: "Básico galáctico e mais oito idiomas",
    traits: [
      ["Resistência lendária (2/dia)", "Se falhar numa salvaguarda, pode escolher passar."],
      ["Mestre Makashi", "Vantagem em salvaguardas e testes contra ser desarmado; ataques de oportunidade contra ele têm desvantagem."],
      FORCE_MIND,
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com o sabre de luz, ou um ataque e usa Relâmpago da Força."),
      hit("Sabre de luz de cabo curvo", "melee", 10, "1,5 m", "2d8+5", "de energia"),
      act("Relâmpago da Força (recarga 5–6)", "Linha de 18 m por 1,5 m. Cada criatura nela faz uma salvaguarda de Destreza CD 18: 45 (10d8) de dano elétrico se falhar, metade se passar.", "10d8"),
    ],
    reactions: [DEFLECT(3, 10)],
    legendary: [
      ["Golpe", "Faz um ataque com o sabre de luz."],
      ["Empurrão da Força (custa 2)", "Uma criatura a até 18 m faz uma salvaguarda de Força CD 18 ou é empurrada 9 m e fica caída."],
      ["Relâmpago curto (custa 2)", "Uma criatura a até 18 m faz uma salvaguarda de Destreza CD 18: 18 (4d8) de dano elétrico, metade se passar."],
    ],
  }),

  // ─── República e Jedi ──────────────────────────────────────────────────────
  mon({
    id: "sw-clone-trooper", name: "Soldado clone", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 16, acNote: "armadura de clone", hd: "4d8+4", speed: "9 m", abil: [13, 14, 12, 10, 12, 10], cr: "1",
    skills: "Atletismo +3, Percepção +3", languages: "Básico galáctico",
    traits: [SQUAD],
    actions: [
      hit("Rifle blaster DC-15A", "ranged", 4, "30/120 m", "1d8+2", "de energia"),
      act("Granada de fragmentação (1/dia)", "Esfera de 3 m de raio num ponto a até 18 m. Salvaguarda de Destreza CD 12: 10 (3d6) de dano cinético se falhar, metade se passar.", "3d6"),
    ],
  }),
  mon({
    id: "sw-clone-sergeant", name: "Sargento clone", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 16, acNote: "armadura de clone", hd: "6d8+12", speed: "9 m", abil: [14, 14, 14, 11, 13, 12], cr: "2",
    skills: "Atletismo +4, Percepção +3", languages: "Básico galáctico",
    traits: [SQUAD],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o rifle."),
      hit("Rifle blaster DC-15A", "ranged", 4, "30/120 m", "1d8+2", "de energia"),
      act("Ordem (ação bônus)", "Um clone aliado a até 18 m que possa ouvi-lo usa a reação para fazer um ataque."),
    ],
  }),
  mon({
    id: "sw-clone-sniper", name: "Atirador de elite clone", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 15, acNote: "armadura de clone leve", hd: "5d8+10", speed: "9 m", abil: [10, 17, 14, 11, 14, 10], cr: "2",
    skills: "Furtividade +5, Percepção +4", languages: "Básico galáctico",
    traits: [["Olho de águia", "Não sofre desvantagem ao atacar na distância longa do rifle."]],
    actions: [
      hit("Rifle de precisão DC-15x", "ranged", 5, "60/240 m", "1d12+3", "de energia"),
      hit("Pistola blaster DC-17", "ranged", 5, "12/48 m", "1d6+3", "de energia"),
      act("Mirar (ação bônus)", "Só se não se moveu neste turno: o próximo ataque com o rifle tem vantagem e, se acertar, causa 7 (2d6) de dano de energia extra.", "2d6"),
    ],
  }),
  mon({
    id: "sw-clone-heavy", name: "Artilheiro pesado clone", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 17, acNote: "armadura de clone reforçada", hd: "7d8+21", speed: "9 m", abil: [16, 14, 16, 10, 12, 10], cr: "3",
    skills: "Atletismo +5, Percepção +3", languages: "Básico galáctico",
    traits: [SQUAD],
    actions: [
      act("Rajada do Z-6 rotativo", "Cone de 9 m. Cada criatura nele faz uma salvaguarda de Destreza CD 12: 13 (3d8) de dano de energia se falhar, metade se passar.", "3d8"),
      hit("Disparo focado do Z-6", "ranged", 4, "24/96 m", "2d8+2", "de energia"),
      hit("Soco", "melee", 5, "1,5 m", "1d6+3", "cinético"),
    ],
  }),
  mon({
    id: "sw-arc-trooper", name: "Soldado ARC", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 17, acNote: "armadura ARC", hd: "9d8+27", speed: "9 m (mochila a jato: voo 9 m)", abil: [14, 18, 16, 12, 14, 12], cr: "4",
    skills: "Atletismo +4, Furtividade +6, Percepção +4", languages: "Básico galáctico",
    traits: [SQUAD, ["Mochila a jato", "Voa 9 m por turno durante até 1 minuto; recarrega num descanso curto."]],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com as pistolas DC-17."),
      hit("Pistola blaster DC-17", "ranged", 6, "12/48 m", "1d6+4", "de energia"),
      act("Granada de fragmentação (recarga 5–6)", "Esfera de 3 m de raio num ponto a até 18 m. Salvaguarda de Destreza CD 14: 14 (4d6) de dano cinético se falhar, metade se passar.", "4d6"),
    ],
  }),
  mon({
    id: "sw-clone-commando", name: "Comando clone", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 18, acNote: "armadura Katarn", hd: "12d8+36", speed: "9 m", abil: [16, 16, 16, 12, 14, 10], cr: "6",
    skills: "Atletismo +6, Furtividade +6, Percepção +5, Tecnologia +4", senses: "visão no escuro 18 m (visor)", languages: "Básico galáctico",
    traits: [SQUAD, ["Visor tático", "Vantagem em testes de Sabedoria (Percepção) baseados em visão."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o DC-17m ou com a vibrofaca."),
      hit("Rifle de comando DC-17m", "ranged", 6, "30/120 m", "2d8+3", "de energia"),
      hit("Vibrofaca", "melee", 6, "1,5 m", "1d4+3", "cinético", { plus: ["1d6", "cinético"] }),
      act("Carga anti-blindagem (recarga 5–6)", "Esfera de 4,5 m de raio num ponto a até 30 m. Salvaguarda de Destreza CD 14: 21 (6d6) de dano cinético se falhar, metade se passar. Dano dobrado contra droides e veículos.", "6d6"),
    ],
  }),
  mon({
    id: "sw-clone-commander", name: "Comandante clone", group: REP, size: "Médio", type: "humanoide (humano clone)", alignment: "leal e neutro",
    ac: 17, acNote: "armadura de clone fase II", hd: "14d8+42", speed: "9 m", abil: [14, 18, 16, 13, 15, 15], cr: "7",
    saves: "Des +7, Sab +5", skills: "Atletismo +5, Intuição +5, Percepção +5", languages: "Básico galáctico",
    traits: [SQUAD, ["Veterano", "Vantagem na iniciativa; não pode ser surpreendido enquanto estiver consciente."]],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com as duas pistolas."),
      hit("Pistolas DC-17", "ranged", 7, "12/48 m", "2d6+4", "de energia"),
      act("Comandar (ação bônus)", "Até três clones aliados a até 18 m usam a reação para fazer um ataque cada."),
    ],
    reactions: [["Abaixa!", "Quando um aliado a até 9 m é alvo de um ataque, o ataque tem desvantagem."]],
  }),
  mon({
    id: "sw-jedi-padawan", name: "Padawan Jedi", group: REP, size: "Médio", type: "humanoide (qualquer espécie)", alignment: "leal e bom",
    ac: 15, acNote: "Defesa da Força", hd: "7d8+7", speed: "9 m", abil: [12, 16, 12, 11, 15, 12], cr: "2",
    skills: "Acrobacia +5, Intuição +4, Percepção +4", languages: "Básico galáctico e mais um idioma",
    traits: [FORCE_MIND, ["Salto da Força", "Salta o triplo da distância normal."]],
    actions: [
      hit("Sabre de luz", "melee", 5, "1,5 m", "1d8+3", "de energia"),
      act("Empurrão da Força (recarga 5–6)", "Uma criatura a até 9 m faz uma salvaguarda de Força CD 12: 7 (2d6) de dano de força e é empurrada 3 m se falhar.", "2d6"),
    ],
    reactions: [DEFLECT(2, 5)],
  }),
  mon({
    id: "sw-jedi-knight", name: "Cavaleiro Jedi", group: REP, size: "Médio", type: "humanoide (qualquer espécie)", alignment: "leal e bom",
    ac: 17, acNote: "Defesa da Força", hd: "18d8+36", speed: "12 m", abil: [14, 18, 14, 13, 17, 14], cr: "6",
    saves: "Des +7, Sab +6", skills: "Acrobacia +7, Intuição +6, Percepção +6", languages: "Básico galáctico e mais dois idiomas",
    traits: [FORCE_MIND, ["Salto da Força", "Salta o triplo da distância normal."]],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com o sabre de luz."),
      hit("Sabre de luz", "melee", 7, "1,5 m", "1d8+4", "de energia"),
      act("Onda da Força (recarga 5–6)", "Cone de 4,5 m. Cada criatura nele faz uma salvaguarda de Força CD 14: 13 (3d8) de dano de força, é empurrada 4,5 m e fica caída se falhar; metade do dano se passar.", "3d8"),
      act("Truque mental (1/dia)", "Uma criatura a até 9 m faz uma salvaguarda de Sabedoria CD 14 ou fica enfeitiçada por 1 minuto e aceita uma sugestão razoável."),
    ],
    reactions: [DEFLECT(3, 7)],
  }),
  mon({
    id: "sw-jedi-master", name: "Mestre Jedi", group: REP, size: "Médio", type: "humanoide (qualquer espécie)", alignment: "leal e bom",
    ac: 19, acNote: "Defesa da Força", hd: "20d8+80", speed: "12 m", abil: [14, 20, 18, 16, 20, 16], cr: "12",
    saves: "Des +9, Sab +9, Car +7", skills: "Intuição +9, Conhecimento +7, Percepção +9", languages: "Básico galáctico e mais quatro idiomas",
    traits: [
      ["Resistência lendária (2/dia)", "Se falhar numa salvaguarda, pode escolher passar."],
      FORCE_MIND,
      ["Sentir o perigo", "Não pode ser surpreendido e tem vantagem em salvaguardas de Destreza contra efeitos que possa sentir."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com o sabre de luz."),
      hit("Sabre de luz", "melee", 9, "1,5 m", "2d8+5", "de energia"),
      act("Onda da Força (recarga 5–6)", "Cone de 9 m. Cada criatura nele faz uma salvaguarda de Força CD 17: 27 (6d8) de dano de força, é empurrada 6 m e fica caída se falhar; metade do dano se passar.", "6d8"),
    ],
    reactions: [DEFLECT(4, 9)],
    legendary: [
      ["Golpe", "Faz um ataque com o sabre de luz."],
      ["Movimento veloz", "Move até o deslocamento sem provocar ataques de oportunidade."],
      ["Empurrão da Força (custa 2)", "Uma criatura a até 18 m faz uma salvaguarda de Força CD 17 ou é empurrada 9 m e fica caída."],
    ],
  }),
  mon({
    id: "sw-astromech", name: "Droide astromecânico", group: REP, size: "Pequeno", type: "droide", alignment: "sem tendência",
    ac: 13, acNote: "chassi de liga", hd: "2d6+2", speed: "6 m (propulsores: voo 6 m por 1 rodada, 1/descanso curto)", abil: [8, 12, 12, 12, 10, 8], cr: "1/8",
    skills: "Pilotagem +3, Tecnologia +5", languages: "binário (entende Básico galáctico)", ...droid,
    traits: [DROID, ["Ferramentas embutidas", "Vantagem em testes para consertar naves e droides ou invadir sistemas."]],
    actions: [hit("Choque elétrico", "melee", 3, "1,5 m", "1d4+1", "elétrico")],
  }),
  mon({
    id: "sw-protocol-droid", name: "Droide de protocolo", group: REP, size: "Médio", type: "droide", alignment: "sem tendência",
    ac: 10, acNote: "chassi de liga", hd: "2d8", speed: "6 m", abil: [10, 10, 10, 14, 10, 10], cr: "0",
    skills: "Conhecimento +4, Persuasão +2", languages: "quase todos os idiomas da galáxia", ...droid,
    traits: [DROID, ["Etiqueta e tradução", "Entende e fala quase qualquer idioma; vantagem em testes de Inteligência sobre culturas e protocolo."]],
    actions: [hit("Tapa", "melee", 2, "1,5 m", "1d2", "cinético")],
  }),

  // ─── Nightsisters e Dathomir ───────────────────────────────────────────────
  mon({
    id: "sw-nightsister-acolyte", name: "Acólita Nightsister", group: NS, size: "Médio", type: "humanoide (dathomiriana)", alignment: "caótico e mau",
    ac: 13, acNote: "trajes de couro", hd: "4d8+4", speed: "9 m", abil: [10, 15, 12, 11, 13, 12], cr: "1",
    skills: "Furtividade +4, Sobrevivência +3", languages: "Dathomiriano, Básico galáctico",
    traits: [["Magia das Nightsisters (1/dia)", "Cria uma névoa verde numa esfera de 3 m de raio a até 18 m: área com escuridão leve por 1 minuto."]],
    actions: [
      hit("Arco de energia", "ranged", 4, "24/96 m", "1d8+2", "de energia"),
      hit("Adaga", "both", 4, "1,5 m ou distância 6/18 m", "1d4+2", "cinético"),
    ],
  }),
  mon({
    id: "sw-nightsister", name: "Nightsister", group: NS, size: "Médio", type: "humanoide (dathomiriana)", alignment: "caótico e mau",
    ac: 15, acNote: "trajes reforçados", hd: "12d8+12", speed: "9 m", abil: [12, 17, 12, 12, 15, 14], cr: "4",
    skills: "Acrobacia +5, Furtividade +7, Percepção +4", languages: "Dathomiriano, Básico galáctico",
    traits: [
      ["Camuflagem mística", "Como ação bônus, em escuridão leve ou névoa, fica invisível até o início do próximo turno ou até atacar."],
      ["Salto da Força", "Salta o triplo da distância normal."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o arco de energia."),
      hit("Arco de energia", "ranged", 5, "30/120 m", "1d8+3", "de energia"),
      act("Bola de ícor (recarga 5–6)", "Esfera de 3 m de raio num ponto a até 18 m. Salvaguarda de Constituição CD 12: 14 (4d6) de dano necrótico se falhar, metade se passar.", "4d6"),
    ],
  }),
  mon({
    id: "sw-nightsister-elder", name: "Anciã Nightsister (bruxa)", group: NS, size: "Médio", type: "humanoide (dathomiriana)", alignment: "neutro e mau",
    ac: 14, acNote: "proteção mística", hd: "16d8+32", speed: "9 m", abil: [10, 14, 14, 16, 18, 17], cr: "8",
    saves: "Con +5, Sab +7, Car +6", skills: "Enganação +6, Intuição +7, Conhecimento +6, Percepção +7", languages: "Dathomiriano, Básico galáctico e mais dois idiomas",
    traits: [["Magia antiga", "Vantagem em salvaguardas contra poderes da Força."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com raio de ícor."),
      hit("Raio de ícor", "power", 7, "36 m", "3d10", "necrótico"),
      act("Névoa da morte (recarga 5–6)", "Cone de 9 m. Salvaguarda de Constituição CD 15: 27 (6d8) de dano necrótico se falhar, metade se passar.", "6d8"),
      act("Feitiço de controle (1/dia)", "Uma criatura a até 18 m faz uma salvaguarda de Sabedoria CD 15 ou fica enfeitiçada por 1 minuto (repete a salvaguarda ao fim de cada turno)."),
      act("Reanimar os mortos (1/dia)", "Até quatro cadáveres a até 18 m se erguem como Nightsisters reanimadas sob o comando da bruxa."),
    ],
  }),
  mon({
    id: "sw-nightsister-zombie", name: "Nightsister reanimada", group: NS, size: "Médio", type: "morto-vivo", alignment: "neutro e mau",
    ac: 11, hd: "4d8+12", speed: "6 m", abil: [14, 8, 16, 3, 6, 5], cr: "1",
    senses: "visão no escuro 18 m", languages: "entende Dathomiriano, mas não fala",
    immune: "veneno", condImmune: "enfeitiçado, envenenado, exausto",
    traits: [
      ["Tenacidade mística", "Se o dano a deixar com 0 PV, faz uma salvaguarda de Constituição (CD 5 + dano), a menos que seja dano de energia ou um acerto crítico. Se passar, fica com 1 PV."],
      ["Laço da bruxa", "Se a bruxa que a reanimou morrer, a criatura desaba."],
    ],
    actions: [hit("Golpe", "melee", 4, "1,5 m", "1d8+2", "cinético")],
  }),
  mon({
    id: "sw-nightbrother", name: "Guerreiro Nightbrother", group: NS, size: "Médio", type: "humanoide (zabrak)", alignment: "caótico e neutro",
    ac: 14, acNote: "couro grosso", hd: "9d8+18", speed: "9 m", abil: [18, 13, 15, 9, 11, 10], cr: "3",
    skills: "Atletismo +6, Intimidação +2, Sobrevivência +2", languages: "Dathomiriano, Básico galáctico",
    traits: [["Tatuagens de guerra", "Vantagem em salvaguardas contra ficar amedrontado."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o vibromachado."),
      hit("Vibromachado", "melee", 6, "1,5 m", "1d10+4", "cinético"),
      hit("Lança arremessada", "ranged", 6, "6/18 m", "1d6+4", "cinético"),
    ],
  }),
  mon({
    id: "sw-mother-talzin", name: "Mãe Talzin", group: NS, size: "Médio", type: "humanoide (dathomiriana)", alignment: "neutro e mau",
    ac: 16, acNote: "proteção mística", hd: "20d8+80", speed: "9 m", abil: [10, 14, 18, 20, 22, 20], cr: "16",
    saves: "Con +9, Int +10, Sab +11, Car +10", skills: "Enganação +10, Intuição +11, Conhecimento +10, Percepção +11",
    senses: "visão no escuro 36 m", languages: "Dathomiriano, Básico galáctico e mais seis idiomas",
    traits: [
      ["Resistência lendária (3/dia)", "Se falhar numa salvaguarda, pode escolher passar."],
      ["Magia antiga", "Vantagem em salvaguardas contra poderes da Força."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com raio de magia sombria."),
      hit("Raio de magia sombria", "power", 11, "36 m", "4d10", "necrótico"),
      act("Estrangular à distância (recarga 5–6)", "Uma criatura a até 18 m faz uma salvaguarda de Constituição CD 19: 36 (8d8) de dano necrótico e fica impedida até o fim do próximo turno se falhar; metade do dano se passar.", "8d8"),
      act("Boneco de vodu (1/dia)", "Com um fio de cabelo ou sangue do alvo, a até 1 km: salvaguarda de Sabedoria CD 19 ou 45 (10d8) de dano psíquico e fica incapacitado por 1 minuto.", "10d8"),
    ],
    legendary: [
      ["Raio", "Faz um ataque com raio de magia sombria."],
      ["Névoa verde", "Vira névoa e se teletransporta até 18 m para um espaço que possa ver."],
      ["Drenar vida (custa 2)", "Uma criatura a até 9 m faz uma salvaguarda de Constituição CD 19: 18 (4d8) de dano necrótico; Talzin recupera PV iguais à metade do dano."],
    ],
  }),
  mon({
    id: "sw-savage-opress", name: "Savage Opress", group: NS, size: "Médio", type: "humanoide (zabrak)", alignment: "caótico e mau",
    ac: 16, acNote: "armadura de placas", hd: "17d8+102", speed: "12 m", abil: [22, 14, 22, 9, 12, 12], cr: "10",
    saves: "For +10, Con +10", skills: "Atletismo +10, Intimidação +5", languages: "Dathomiriano, Básico galáctico",
    traits: [["Fúria do lado sombrio", "Quando fica abaixo da metade dos PV, os ataques corpo a corpo causam 7 (2d6) de dano extra."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o sabre duplo e um com o punho."),
      hit("Sabre de luz de lâmina dupla", "melee", 10, "1,5 m", "2d8+6", "de energia"),
      hit("Punho", "melee", 10, "1,5 m", "1d8+6", "cinético", { extra: "Se o alvo for Médio ou menor, fica agarrado (CD 18 para escapar)." }),
      act("Esmagar com a Força (recarga 5–6)", "Uma criatura a até 18 m faz uma salvaguarda de Constituição CD 18: 33 (6d10) de dano de força se falhar, metade se passar.", "6d10"),
    ],
  }),

  // ─── Lado Sombrio ──────────────────────────────────────────────────────────
  mon({
    id: "sw-dark-acolyte", name: "Acólito do lado sombrio", group: DARK, size: "Médio", type: "humanoide (qualquer espécie)", alignment: "neutro e mau",
    ac: 15, acNote: "Defesa da Força", hd: "9d8+18", speed: "9 m", abil: [12, 16, 14, 12, 13, 14], cr: "3",
    skills: "Acrobacia +5, Intimidação +4", languages: "Básico galáctico e mais um idioma",
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o sabre de luz."),
      hit("Sabre de luz vermelho", "melee", 5, "1,5 m", "1d8+3", "de energia"),
      act("Empurrão da Força (recarga 5–6)", "Uma criatura a até 9 m faz uma salvaguarda de Força CD 12: 9 (2d8) de dano de força e é empurrada 4,5 m se falhar.", "2d8"),
    ],
    reactions: [DEFLECT(2, 5)],
  }),
  mon({
    id: "sw-asajj-ventress", name: "Asajj Ventress", group: DARK, size: "Médio", type: "humanoide (dathomiriana)", alignment: "neutro e mau",
    ac: 16, acNote: "Defesa da Força", hd: "17d8+51", speed: "12 m", abil: [12, 20, 16, 13, 15, 14], cr: "10",
    saves: "Des +9, Sab +6", skills: "Acrobacia +9, Enganação +6, Furtividade +9, Percepção +6", languages: "Dathomiriano, Básico galáctico",
    traits: [
      ["Resistência lendária (1/dia)", "Se falhar numa salvaguarda, pode escolher passar."],
      ["Sabres gêmeos", "Pode unir os dois sabres curvos numa arma de lâmina dupla sem gastar ação."],
      ["Camuflagem mística", "Como ação bônus, em escuridão leve ou névoa, fica invisível até o início do próximo turno ou até atacar."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com os sabres curvos."),
      hit("Sabre de luz curvo", "melee", 9, "1,5 m", "2d6+5", "de energia"),
      act("Estrangular com a Força (recarga 5–6)", "Uma criatura a até 18 m faz uma salvaguarda de Constituição CD 14: 22 (4d10) de dano de força e fica impedida até o fim do próximo turno se falhar; metade do dano se passar.", "4d10"),
    ],
    reactions: [DEFLECT(3, 9)],
  }),
  mon({
    id: "sw-darth-maul", name: "Darth Maul (Guerras Clônicas)", group: DARK, size: "Médio", type: "humanoide (zabrak, pernas cibernéticas)", alignment: "neutro e mau",
    ac: 17, acNote: "Defesa da Força", hd: "16d8+64", speed: "12 m", abil: [18, 20, 18, 14, 14, 16], cr: "14",
    saves: "Des +10, Con +9, Sab +7", skills: "Acrobacia +10, Atletismo +9, Enganação +8, Intimidação +8, Percepção +7", languages: "Dathomiriano, Básico galáctico",
    traits: [
      ["Resistência lendária (2/dia)", "Se falhar numa salvaguarda, pode escolher passar."],
      ["O ódio o mantém vivo", "A primeira vez no dia que cai a 0 PV, fica com 1 PV."],
      ["Salto da Força", "Salta o triplo da distância normal."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com o sabre de lâmina dupla."),
      hit("Sabre de luz de lâmina dupla", "melee", 10, "1,5 m", "2d8+5", "de energia"),
      act("Arremesso do sabre (recarga 5–6)", "O sabre gira numa linha de 9 m e volta. Salvaguarda de Destreza CD 16: 27 (6d8) de dano de energia se falhar, metade se passar.", "6d8"),
    ],
    reactions: [DEFLECT(3, 10)],
    legendary: [
      ["Golpe", "Faz um ataque com o sabre de luz."],
      ["Chute", "Ataque corpo a corpo +9: 8 (1d8 + 4) de dano cinético e o alvo é empurrado 3 m."],
      ["Estrangular (custa 2)", "Uma criatura a até 9 m faz uma salvaguarda de Constituição CD 16: 18 (4d8) de dano de força e fica impedida até o fim do próximo turno de Maul."],
    ],
  }),

  // ─── Submundo e mercenários ────────────────────────────────────────────────
  mon({
    id: "sw-bounty-hunter", name: "Caçador de recompensas", group: UND, size: "Médio", type: "humanoide (qualquer espécie)", alignment: "neutro",
    ac: 15, acNote: "armadura de caçador", hd: "8d8+16", speed: "9 m", abil: [12, 16, 14, 12, 13, 11], cr: "3",
    skills: "Investigação +3, Furtividade +5, Percepção +3, Sobrevivência +3", languages: "Básico galáctico e mais um idioma",
    traits: [["Rastreador", "Vantagem em testes de Sobrevivência para seguir o alvo do contrato."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com a pistola pesada."),
      hit("Pistola blaster pesada", "ranged", 5, "12/48 m", "1d8+3", "de energia"),
      act("Rede de captura (recarga 5–6)", "Ataque à distância +5, distância 4,5/9 m: o alvo fica impedido (salvaguarda de Força CD 13 como ação para escapar)."),
    ],
  }),
  mon({
    id: "sw-cad-bane", name: "Cad Bane", group: UND, size: "Médio", type: "humanoide (duros)", alignment: "neutro e mau",
    ac: 16, acNote: "armadura de caçador", hd: "16d8+64", speed: "9 m (botas de foguete: voo 9 m)", abil: [12, 20, 18, 15, 15, 14], cr: "9",
    saves: "Des +9, Con +8, Sab +6", skills: "Enganação +6, Intimidação +6, Furtividade +9, Percepção +6", languages: "Básico galáctico, duros e mais dois idiomas",
    condImmune: "amedrontado, enfeitiçado",
    traits: [
      ["Saque rápido", "Vantagem na iniciativa. Na primeira rodada, ataca com vantagem quem ainda não agiu."],
      ["Tubos respiratórios", "Imune a gases e venenos inalados."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com as pistolas LL-30."),
      hit("Pistola blaster LL-30", "ranged", 9, "12/48 m", "2d8+5", "de energia"),
      act("Cabo de pulso (recarga 5–6)", "Ataque à distância +9, distância 9 m: o alvo fica impedido e Bane pode puxá-lo 4,5 m (salvaguarda de Força CD 17 como ação para escapar)."),
      act("Botas de foguete (ação bônus)", "Voa até 9 m sem provocar ataques de oportunidade."),
    ],
  }),
  mon({
    id: "sw-weequay-pirate", name: "Pirata weequay", group: UND, size: "Médio", type: "humanoide (weequay)", alignment: "caótico e neutro",
    ac: 13, acNote: "couro reforçado", hd: "4d8+4", speed: "9 m", abil: [13, 13, 12, 10, 10, 10], cr: "1/2",
    skills: "Atletismo +3", languages: "Sriluuriano, Básico galáctico",
    actions: [
      hit("Carabina blaster", "ranged", 3, "18/72 m", "1d8+1", "de energia"),
      hit("Vibrofaca", "melee", 3, "1,5 m", "1d4+1", "cinético"),
    ],
  }),
  mon({
    id: "sw-pirate-captain", name: "Capitão pirata weequay", group: UND, size: "Médio", type: "humanoide (weequay)", alignment: "caótico e neutro",
    ac: 14, acNote: "casaco blindado", hd: "11d8+11", speed: "9 m", abil: [12, 16, 12, 13, 12, 16], cr: "2",
    skills: "Enganação +5, Persuasão +5, Percepção +3", languages: "Sriluuriano, Básico galáctico e mais três idiomas",
    traits: [["Sempre tem um plano B (1/dia)", "Ao cair abaixo da metade dos PV, pode usar Disparada como reação, sem provocar ataques de oportunidade."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com a pistola."),
      hit("Pistola blaster", "ranged", 5, "12/48 m", "1d8+3", "de energia"),
      act("Negociar (ação bônus)", "Uma criatura a até 9 m que entenda o capitão faz uma salvaguarda de Sabedoria CD 13 ou não o ataca até o fim do próximo turno dela."),
    ],
  }),
  mon({
    id: "sw-gamorrean-guard", name: "Guarda gamorreano", group: UND, size: "Médio", type: "humanoide (gamorreano)", alignment: "caótico e neutro",
    ac: 12, acNote: "couro", hd: "4d8+12", speed: "9 m", abil: [17, 9, 16, 6, 9, 7], cr: "1",
    skills: "Atletismo +5, Intimidação +0", languages: "Gamorreano (entende Huttês)",
    actions: [hit("Vibromachado", "melee", 5, "1,5 m", "1d12+3", "cinético")],
  }),
  mon({
    id: "sw-pyke-enforcer", name: "Executor Pyke", group: UND, size: "Médio", type: "humanoide (pyke)", alignment: "leal e mau",
    ac: 14, acNote: "traje blindado", hd: "5d8+5", speed: "9 m", abil: [12, 14, 12, 11, 11, 10], cr: "1",
    skills: "Intimidação +2, Percepção +2", languages: "Pyke, Básico galáctico",
    traits: [["Máscara respiratória", "Vantagem em salvaguardas contra gases e venenos inalados."]],
    actions: [
      hit("Pistola blaster", "ranged", 4, "12/48 m", "1d8+2", "de energia"),
      hit("Vibrolâmina", "melee", 4, "1,5 m", "1d6+2", "cinético"),
    ],
  }),
  mon({
    id: "sw-black-sun-thug", name: "Capanga do Sol Negro", group: UND, size: "Médio", type: "humanoide (qualquer espécie)", alignment: "neutro e mau",
    ac: 13, acNote: "jaqueta reforçada", hd: "3d8+6", speed: "9 m", abil: [14, 12, 14, 10, 10, 11], cr: "1/2",
    skills: "Intimidação +2", languages: "Básico galáctico",
    traits: [SQUAD],
    actions: [
      hit("Pistola blaster", "ranged", 3, "12/48 m", "1d6+1", "de energia"),
      hit("Vibrolâmina", "melee", 4, "1,5 m", "1d6+2", "cinético"),
    ],
  }),
  mon({
    id: "sw-zygerrian-slaver", name: "Escravagista zygerriano", group: UND, size: "Médio", type: "humanoide (zygerriano)", alignment: "leal e mau",
    ac: 14, acNote: "armadura leve", hd: "7d8+14", speed: "9 m", abil: [14, 16, 14, 12, 12, 14], cr: "2",
    skills: "Intimidação +4, Percepção +3", languages: "Zygerriano, Básico galáctico",
    actions: [
      act("Ataques múltiplos", "Faz dois ataques: um com o eletrochicote e um com a pistola."),
      hit("Eletrochicote", "melee", 5, "3 m", "1d6+3", "cinético", { plus: ["1d4", "elétrico"], extra: "O alvo não pode usar reações até o início do próximo turno dele." }),
      hit("Pistola blaster", "ranged", 5, "12/48 m", "1d6+3", "de energia"),
    ],
  }),
  mon({
    id: "sw-trandoshan-hunter", name: "Caçador trandoshano", group: UND, size: "Médio", type: "humanoide (trandoshano)", alignment: "neutro e mau",
    ac: 14, acNote: "escamas e couro", hd: "6d8+18", speed: "9 m", abil: [17, 14, 16, 9, 12, 8], cr: "2",
    skills: "Percepção +3, Sobrevivência +3", senses: "visão no escuro 18 m", languages: "Dosh, Básico galáctico",
    traits: [["Regeneração lenta", "Recupera 2 PV no início de cada turno se tiver ao menos 1 PV."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques: com o rifle ou com as garras."),
      hit("Rifle de caça", "ranged", 4, "30/120 m", "1d8+2", "de energia"),
      hit("Garras", "melee", 5, "1,5 m", "1d6+3", "cinético"),
    ],
  }),
  mon({
    id: "sw-hutt-crimelord", name: "Senhor do crime hutt", group: UND, size: "Grande", type: "humanoide (hutt)", alignment: "neutro e mau",
    ac: 12, acNote: "couro grosso", hd: "10d10+50", speed: "3 m", abil: [18, 6, 20, 15, 14, 17], cr: "3",
    saves: "Con +7, Sab +4", skills: "Enganação +7, Intimidação +7, Intuição +4", languages: "Huttês (entende Básico galáctico, mas raramente fala)",
    traits: [
      ["Mente de hutt", "Imune a truques mentais e a efeitos que o enfeiticem."],
      ["Comitiva", "Quase sempre tem 2 a 6 guardas gamorreanos ou caçadores por perto."],
    ],
    actions: [
      hit("Cauda", "melee", 6, "3 m", "2d8+4", "cinético"),
      act("Esmagar", "Uma criatura caída a até 1,5 m faz uma salvaguarda de Força CD 14 ou sofre 13 (2d8 + 4) de dano cinético e fica agarrada.", "2d8+4"),
    ],
  }),

  // ─── Mandalorianos ─────────────────────────────────────────────────────────
  mon({
    id: "sw-death-watch-warrior", name: "Guerreiro da Vigília da Morte", group: MANDO, size: "Médio", type: "humanoide (humano mandaloriano)", alignment: "leal e mau",
    ac: 18, acNote: "armadura mandaloriana", hd: "9d8+18", speed: "9 m (mochila a jato: voo 9 m)", abil: [14, 16, 14, 12, 12, 12], cr: "4",
    skills: "Atletismo +4, Intimidação +3, Percepção +3", languages: "Mando'a, Básico galáctico",
    traits: [["Mochila a jato", "Voa 9 m por turno durante até 1 minuto; recarrega num descanso curto."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com as pistolas WESTAR-35."),
      hit("Pistola WESTAR-35", "ranged", 5, "12/48 m", "1d8+3", "de energia"),
      act("Lança-chamas de pulso (recarga 5–6)", "Cone de 4,5 m. Salvaguarda de Destreza CD 13: 10 (3d6) de dano de fogo se falhar, metade se passar.", "3d6"),
      act("Foguete da mochila (1/dia)", "Esfera de 3 m de raio num ponto a até 36 m. Salvaguarda de Destreza CD 13: 14 (4d6) de dano cinético se falhar, metade se passar.", "4d6"),
    ],
  }),
  mon({
    id: "sw-pre-vizsla", name: "Pre Vizsla", group: MANDO, size: "Médio", type: "humanoide (humano mandaloriano)", alignment: "leal e mau",
    ac: 19, acNote: "armadura de beskar", hd: "16d8+48", speed: "9 m (mochila a jato: voo 9 m)", abil: [16, 16, 16, 13, 13, 16], cr: "8",
    saves: "For +6, Con +6", skills: "Atletismo +6, Intimidação +6, Percepção +4", languages: "Mando'a, Básico galáctico",
    traits: [
      ["Beskar", "Resistência a dano de energia de sabres de luz."],
      ["Sabre negro", "Empunha o Sabre Negro, símbolo do líder de Mandalore."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com o Sabre Negro e um com a pistola."),
      hit("Sabre Negro", "melee", 6, "1,5 m", "2d10+3", "de energia"),
      hit("Pistola WESTAR-35", "ranged", 6, "12/48 m", "1d8+3", "de energia"),
      act("Lança-chamas de pulso (recarga 5–6)", "Cone de 4,5 m. Salvaguarda de Destreza CD 14: 17 (5d6) de dano de fogo se falhar, metade se passar.", "5d6"),
    ],
  }),

  // ─── Criaturas ─────────────────────────────────────────────────────────────
  mon({
    id: "sw-rancor", name: "Rancor", group: BEAST, size: "Enorme", type: "besta", alignment: "sem tendência",
    ac: 15, acNote: "couro natural", hd: "14d12+56", speed: "12 m", abil: [24, 10, 18, 4, 12, 6], cr: "9",
    skills: "Percepção +5", senses: "visão no escuro 18 m",
    traits: [["Agarrar e devorar", "Se as duas garras acertarem a mesma criatura Média ou menor, ela fica agarrada (CD 18 para escapar) e a mordida contra ela tem vantagem."]],
    actions: [
      act("Ataques múltiplos", "Faz três ataques: duas garras e uma mordida."),
      hit("Garra", "melee", 11, "3 m", "2d8+7", "cinético"),
      hit("Mordida", "melee", 11, "1,5 m", "3d10+7", "cinético"),
    ],
  }),
  mon({
    id: "sw-acklay", name: "Acklay", group: BEAST, size: "Enorme", type: "besta", alignment: "sem tendência",
    ac: 15, acNote: "carapaça", hd: "12d12+48", speed: "12 m, natação 6 m", abil: [21, 14, 18, 3, 12, 5], cr: "6",
    skills: "Percepção +4", senses: "visão no escuro 18 m",
    traits: [["Anfíbio", "Respira ar e água."]],
    actions: [
      act("Ataques múltiplos", "Faz três ataques com as garras."),
      hit("Garra", "melee", 8, "3 m", "2d6+5", "cinético"),
    ],
  }),
  mon({
    id: "sw-nexu", name: "Nexu", group: BEAST, size: "Grande", type: "besta", alignment: "sem tendência",
    ac: 13, hd: "6d10+12", speed: "12 m, escalada 9 m", abil: [16, 17, 14, 3, 12, 7], cr: "3",
    skills: "Furtividade +5, Percepção +3", senses: "visão no escuro 18 m (infravermelho)",
    traits: [["Bote", "Se mover ao menos 6 m em linha reta e acertar as garras, o alvo faz uma salvaguarda de Força CD 13 ou fica caído; o nexu pode morder como ação bônus."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques: uma mordida e as garras."),
      hit("Mordida", "melee", 5, "1,5 m", "1d10+3", "cinético"),
      hit("Garras", "melee", 5, "1,5 m", "2d6+3", "cinético"),
    ],
  }),
  mon({
    id: "sw-reek", name: "Reek", group: BEAST, size: "Grande", type: "besta", alignment: "sem tendência",
    ac: 14, acNote: "couro grosso", hd: "8d10+32", speed: "12 m", abil: [21, 9, 18, 2, 10, 5], cr: "4",
    traits: [["Investida", "Se mover ao menos 6 m em linha reta e acertar os chifres, causa 11 (2d10) de dano extra e o alvo faz uma salvaguarda de Força CD 15 ou fica caído."]],
    actions: [hit("Chifres", "melee", 7, "1,5 m", "2d10+5", "cinético")],
  }),
  mon({
    id: "sw-gundark", name: "Gundark", group: BEAST, size: "Médio", type: "besta", alignment: "sem tendência",
    ac: 13, acNote: "couro natural", hd: "7d8+21", speed: "9 m, escalada 9 m", abil: [19, 13, 16, 4, 10, 6], cr: "3",
    senses: "visão no escuro 18 m",
    traits: [["Quatro braços", "Pode manter até duas criaturas agarradas e continuar atacando."]],
    actions: [
      act("Ataques múltiplos", "Faz quatro ataques com os punhos."),
      hit("Punho", "melee", 6, "1,5 m", "1d4+4", "cinético"),
    ],
  }),
  mon({
    id: "sw-varactyl", name: "Varactyl", group: BEAST, size: "Grande", type: "besta", alignment: "sem tendência",
    ac: 13, acNote: "escamas", hd: "4d10+8", speed: "15 m, escalada 12 m", abil: [16, 14, 14, 2, 12, 6], cr: "1",
    traits: [["Montaria escaladora", "Escala paredes verticais mesmo carregando um cavaleiro."]],
    actions: [hit("Mordida", "melee", 5, "1,5 m", "1d8+3", "cinético")],
  }),
  mon({
    id: "sw-kouhun", name: "Kouhun", group: BEAST, size: "Miúdo", type: "besta", alignment: "sem tendência",
    ac: 13, hd: "1d4+1", speed: "6 m, escalada 6 m", abil: [2, 16, 12, 1, 10, 2], cr: "1/4",
    skills: "Furtividade +5", senses: "sentido sísmico 9 m",
    actions: [{
      name: "Picada", atk: 5, dmg: "2d6",
      desc: "Ataque corpo a corpo com arma: +5 para acertar, alcance 1,5 m, um alvo. Acerto: 1 de dano cinético e o alvo faz uma salvaguarda de Constituição CD 11: 7 (2d6) de dano de veneno se falhar, metade se passar.",
    }],
  }),
  mon({
    id: "sw-krayt-dragon", name: "Dragão krayt", group: BEAST, size: "Enorme", type: "monstruosidade", alignment: "sem tendência",
    ac: 18, acNote: "escamas", hd: "18d12+90", speed: "12 m, escavação 9 m", abil: [27, 10, 21, 4, 12, 8], cr: "13",
    saves: "For +13, Con +10", skills: "Percepção +6", senses: "sentido sísmico 18 m, visão no escuro 36 m",
    traits: [
      ["Nadador de areia", "Escava areia e terra solta sem deixar túnel."],
      ["Pérola de krayt", "No estômago há uma pérola que vale uma fortuna."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques: uma mordida e duas garras."),
      hit("Mordida", "melee", 13, "3 m", "3d10+8", "cinético"),
      hit("Garra", "melee", 13, "1,5 m", "2d8+8", "cinético"),
      act("Rugido sísmico (recarga 5–6)", "Cone de 18 m. Salvaguarda de Constituição CD 18: 36 (8d8) de dano sônico e fica caído se falhar; metade do dano se passar.", "8d8"),
    ],
  }),
  mon({
    id: "sw-zillo-beast", name: "Fera Zillo", group: BEAST, size: "Imenso", type: "monstruosidade", alignment: "sem tendência",
    ac: 22, acNote: "escamas de cortosis", hd: "20d20+120", speed: "15 m, escavação 9 m", abil: [30, 8, 23, 3, 12, 6], cr: "20",
    saves: "For +16, Con +12, Sab +7", senses: "sentido sísmico 36 m, visão no escuro 36 m",
    resist: "energia (imune a sabres de luz), cinético", condImmune: "amedrontado, enfeitiçado",
    traits: [
      ["Resistência lendária (3/dia)", "Se falhar numa salvaguarda, pode escolher passar."],
      ["Escamas de cortosis", "Sabres de luz não causam dano; quem acerta um ataque de sabre faz uma salvaguarda de Destreza CD 15 ou o sabre se desliga."],
      ["Monstro de cerco", "Causa o dobro de dano a estruturas e veículos."],
    ],
    actions: [
      act("Ataques múltiplos", "Faz três ataques: uma mordida e duas garras."),
      hit("Mordida", "melee", 16, "4,5 m", "4d12+10", "cinético"),
      hit("Garra", "melee", 16, "3 m", "3d10+10", "cinético"),
    ],
    legendary: [
      ["Garra", "Faz um ataque com a garra."],
      ["Cauda (custa 2)", "Cada criatura numa linha de 9 m faz uma salvaguarda de Destreza CD 20: 23 (3d8 + 10) de dano cinético e fica caída se falhar."],
      ["Pisotear (custa 2)", "Move até metade do deslocamento; cada criatura em cujo espaço entrar faz uma salvaguarda de Destreza CD 20 ou sofre 21 (2d10 + 10) de dano cinético."],
    ],
  }),
  mon({
    id: "sw-tukata", name: "Tuk'ata (cão Sith)", group: BEAST, size: "Grande", type: "monstruosidade", alignment: "neutro e mau",
    ac: 14, acNote: "couro natural", hd: "6d10+18", speed: "12 m", abil: [18, 14, 16, 6, 13, 8], cr: "3",
    skills: "Percepção +5", senses: "visão no escuro 18 m",
    traits: [["Sentir a Força", "Sabe onde estão os usuários da Força a até 18 m."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques: uma mordida e uma garra."),
      hit("Mordida", "melee", 6, "1,5 m", "2d6+4", "cinético"),
      hit("Garra", "melee", 6, "1,5 m", "1d8+4", "cinético"),
    ],
  }),
  mon({
    id: "sw-mynock", name: "Mynock", group: BEAST, size: "Pequeno", type: "besta", alignment: "sem tendência",
    ac: 12, hd: "2d6", speed: "1,5 m, voo 9 m", abil: [6, 15, 10, 2, 10, 3], cr: "1/8",
    senses: "percepção às cegas 9 m",
    traits: [["Vive no vácuo", "Sobrevive no espaço sem ar."], ["Parasita de energia", "Preso a uma nave ou droide, drena a energia: o alvo sofre 1d4 de dano no início de cada turno do mynock."]],
    actions: [hit("Sugar", "melee", 4, "1,5 m", "1d4+2", "cinético", { extra: "O mynock fica preso ao alvo (CD 12 para soltá-lo)." })],
  }),
  mon({
    id: "sw-dianoga", name: "Dianoga", group: BEAST, size: "Grande", type: "besta", alignment: "sem tendência",
    ac: 13, acNote: "pele viscosa", hd: "8d10+24", speed: "3 m, natação 9 m", abil: [17, 12, 16, 3, 10, 4], cr: "3",
    skills: "Furtividade +3", senses: "visão no escuro 18 m",
    traits: [["Olho periscópio", "Vê acima da água estando submersa; vantagem em Furtividade em água turva."]],
    actions: [
      act("Ataques múltiplos", "Faz dois ataques com os tentáculos, ou um tentáculo e uma mordida contra uma criatura agarrada."),
      hit("Tentáculo", "melee", 5, "3 m", "1d8+3", "cinético", { extra: "O alvo fica agarrado (CD 13 para escapar) e pode ser puxado para debaixo da água." }),
      hit("Mordida", "melee", 5, "1,5 m", "2d8+3", "cinético"),
    ],
  }),
  mon({
    id: "sw-bantha", name: "Bantha", group: BEAST, size: "Grande", type: "besta", alignment: "sem tendência",
    ac: 12, acNote: "pelagem grossa", hd: "6d10+18", speed: "12 m", abil: [20, 8, 17, 2, 9, 6], cr: "2",
    traits: [["Investida", "Se mover ao menos 6 m em linha reta e acertar os chifres, causa 9 (2d8) de dano extra e o alvo faz uma salvaguarda de Força CD 15 ou fica caído."]],
    actions: [hit("Chifres", "melee", 7, "1,5 m", "2d8+5", "cinético")],
  }),
];
