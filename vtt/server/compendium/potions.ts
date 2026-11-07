// Poções de D&D 5e como consumíveis da ficha (botão "Consumir"): as de cura do SRD ganham o efeito,
// e esta mesa ganha uma linha própria de cura e de mana (com dado ou valor fixo). Escritas à mão.
// Uso: poção com dado gasta o turno inteiro; tônico e cristal (valor fixo, mais rápidos) são ação bônus.
import type { Item } from "../../shared/compendium.ts";

/** Efeito das poções do SRD (items-dnd.json, gerado por scripts/build-srd.ts). Beber é uma ação: turno inteiro. */
export const SRD_USE: Record<string, Item["use"]> = {
  "magic-potion-of-healing-common": { expr: "2d4+2", res: "PV", turn: "Turno inteiro" },
  "magic-potion-of-healing-greater": { expr: "4d4+4", res: "PV", turn: "Turno inteiro" },
  "magic-potion-of-healing-superior": { expr: "8d4+8", res: "PV", turn: "Turno inteiro" },
  "magic-potion-of-healing-supreme": { expr: "10d4+20", res: "PV", turn: "Turno inteiro" },
};

const MANA_NOTE = "D&D 5e puro não tem mana: serve nas fichas com mana, PM ou PE (Nightfall, Tormenta20, Ordem Paranormal…).";

const potion = (id: string, name: string, expr: string, res: "PV" | "Mana", turn: string, cost: string, rarity: string, desc: string): Item => ({
  id: `mesa-${id}`, name, cat: "Poções", sub: `Poção, ${rarity.toLowerCase()} · ${turn.toLowerCase()}`, cost, weight: "0,25 kg", rarity,
  use: { expr, res, turn },
  desc: `${desc} Recupera ${expr} ${res === "PV" ? "PV" : "de mana"} (até o máximo). Uso: ${turn.toLowerCase()}.${res === "Mana" ? ` ${MANA_NOTE}` : ""}`,
});

const FULL = "Turno inteiro";
const BONUS = "Ação bônus";

export const DND_POTIONS: Item[] = [
  potion("cura-pequena", "Poção de cura pequena", "2d4+2", "PV", FULL, "50 PO", "Comum", "Líquido vermelho que brilha quando agitado."),
  potion("cura-media", "Poção de cura média", "4d4+4", "PV", FULL, "150 PO", "Incomum", "Vermelho-escuro e espesso, morno ao toque."),
  potion("cura-grande", "Poção de cura grande", "8d4+8", "PV", FULL, "450 PO", "Rara", "Rubi líquido; fecha cortes enquanto desce pela garganta."),
  potion("tonico-pequeno", "Tônico de cura pequeno", "5", "PV", BONUS, "25 PO", "Comum", "Ervas amargas em álcool, num gole só. Cura sempre o mesmo."),
  potion("tonico-medio", "Tônico de cura médio", "12", "PV", BONUS, "100 PO", "Incomum", "Destilado de alquimista, gosto de hortelã e ferro."),
  potion("tonico-grande", "Tônico de cura grande", "25", "PV", BONUS, "300 PO", "Rara", "Frasco selado com cera dourada."),
  potion("mana-pequena", "Poção de mana pequena", "1d4+1", "Mana", FULL, "50 PO", "Comum", "Líquido azul que formiga na língua."),
  potion("mana-media", "Poção de mana média", "2d4+2", "Mana", FULL, "150 PO", "Incomum", "Azul profundo, com faíscas suspensas."),
  potion("mana-grande", "Poção de mana grande", "4d4+4", "Mana", FULL, "450 PO", "Rara", "Brilha no escuro como um céu estrelado."),
  potion("cristal-pequeno", "Cristal de mana pequeno", "2", "Mana", BONUS, "25 PO", "Comum", "Lasca de cristal que se desfaz na boca. Recupera sempre o mesmo."),
  potion("cristal-medio", "Cristal de mana médio", "5", "Mana", BONUS, "100 PO", "Incomum", "Cristal lapidado, frio como gelo."),
  potion("cristal-grande", "Cristal de mana grande", "10", "Mana", BONUS, "300 PO", "Rara", "Geodo pulsante; a magia escorre dele para quem o quebra."),
];
