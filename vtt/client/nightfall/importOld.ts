// Importa as fichas do criador antigo ("FICHA DE PERSONAGEM - D&D 5e"): o .html (Baixar HTML/PDF) e o .txt.
// Os dois só trazem texto, então os campos são lidos pelos rótulos que o criador antigo escrevia.
import { ATTRS, ATTR_NAME, CLASSES, RACES, findByName, hpMax, manaMax, nameKey } from "./rules.ts";
import { newState, type NfState } from "./state.ts";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m)
    .trim();
}

/** Campos vazios do criador antigo viravam "____" ou frases de preenchimento. */
const EMPTY = /^(_+|_+ anos|Nenhum item no inventário\.|Nenhuma magia ou habilidade registrada\.|Nenhuma|Não definido\.|A história ainda será escrita\.\.\.)$/;
const clean = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return EMPTY.test(t) ? "" : t;
};

export function isOldSheet(text: string): boolean {
  return /FICHA DE PERSONAGEM - D&(amp;)?D 5e/.test(text);
}

/** Preenche o estado a partir dos valores lidos (nomes de raça/classe, PV e mana atuais). */
function finish(s: NfState, f: { raca: string; classe: string; pv?: number; mana?: number }): NfState {
  s.raca = findByName(RACES, f.raca);
  s.classe = findByName(CLASSES, f.classe);
  s.idade = s.idade.replace(/\s*anos$/i, "");
  // guardamos o dano levado, não o PV atual
  if (f.pv !== undefined) s.dano = Math.max(0, hpMax(s.nivel, s.atributos.con) - f.pv);
  if (f.mana !== undefined) s.manaGasta = Math.max(0, manaMax(s.nivel, s.classe, s.atributos) - f.mana);
  return s;
}

export function parseOldHtml(html: string): NfState {
  const s = newState();
  const info: Record<string, string> = {};
  for (const [, label, value] of html.matchAll(/<div class="info-item"><strong>([^<]+):<\/strong>([\s\S]*?)<\/div>/gi)) info[nameKey(label)] = clean(plain(value));
  for (const [, label, value] of html.matchAll(/<div class="attribute">\s*<strong>([^<]+):<\/strong>\s*<span>(\d+)/gi)) {
    const a = ATTRS.find((x) => nameKey(ATTR_NAME[x]) === nameKey(label));
    if (a) s.atributos[a] = Number(value);
  }
  s.nome = info.nome ?? "";
  s.jogador = info.jogador ?? "";
  s.nivel = Math.max(1, Math.min(20, parseInt(info.nivel) || 1));
  s.xp = parseInt(info.xp) || 0;
  s.alinhamento = info.alinhamento || "Neutro";
  s.antecedente = info.antecedencia ?? "";
  s.idade = info.idade ?? "";
  s.peso = info.peso ?? "";

  const sections = new Map<string, string>();
  for (const part of html.split(/<h2[^>]*>/i).slice(1)) {
    const [title, body = ""] = part.split(/<\/h2>/i);
    sections.set(nameKey(plain(title)), body);
  }
  // parágrafos de texto livre, sem os rótulos em <strong>
  const paras = (body = "") => [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const after = (body: string | undefined, label: string) => {
    const ps = paras(body);
    const i = ps.findIndex((p) => plain(p).startsWith(label));
    return i >= 0 && i + 1 < ps.length ? clean(plain(ps[i + 1])) : "";
  };
  s.inventario = clean(plain(paras(sections.get("inventario"))[0] ?? ""));
  s.magias = clean(plain(paras(sections.get("magias e habilidades")).find((p) => !p.includes("Habilidades de Classe")) ?? ""));
  s.fraquezasExtra = after(sections.get("fraquezas"), "Fraquezas Adicionais");
  s.ideais = after(sections.get("personalidade"), "Ideais");
  s.tracos = after(sections.get("personalidade"), "Traços de Personalidade");
  s.historia = clean(plain(paras(sections.get("historia do personagem"))[0] ?? ""));

  return finish(s, {
    raca: info.raca ?? "",
    classe: info.classe ?? "",
    pv: info.pv ? parseInt(info.pv) : undefined,
    mana: info.mana ? parseInt(info.mana) : undefined,
  });
}

export function parseOldTxt(txt: string): NfState {
  const s = newState();
  txt = txt.replace(/\r\n?/g, "\n");
  const line = (re: RegExp) => clean(txt.match(re)?.[1]);
  // blocos separados pelas linhas de ═; a primeira linha de cada bloco é o título
  const blocks = new Map<string, string>();
  for (const block of txt.split(/^═+$/m)) {
    const m = block.trim().match(/^([^\n]+)\n?([\s\S]*)$/);
    if (m) blocks.set(nameKey(m[1]), m[2].trim());
  }

  s.nome = line(/^Nome do Personagem: (.*)$/m);
  s.jogador = line(/^Jogador: (.*)$/m);
  const lvl = txt.match(/^Nível: (\d+)\s+XP Atual: (\d+)/m);
  s.nivel = Math.max(1, Math.min(20, Number(lvl?.[1] ?? 1)));
  s.xp = Number(lvl?.[2] ?? 0);
  s.alinhamento = line(/^Alinhamento: (.*)$/m) || "Neutro";
  s.antecedente = line(/^Antecedência: (.*)$/m);
  const idade = txt.match(/^Idade: (.*?)\s{2,}Peso: (.*)$/m);
  s.idade = clean(idade?.[1]);
  s.peso = clean(idade?.[2]);
  for (const a of ATTRS) {
    const v = txt.match(new RegExp(`^${ATTR_NAME[a]}\\s+(\\d+)\\s+\\(`, "m"))?.[1];
    if (v) s.atributos[a] = Number(v);
  }
  s.inventario = clean(blocks.get("inventario"));
  s.magias = clean((blocks.get("magias e habilidades") ?? "").replace(/\n*Habilidades de Classe:.*$/s, ""));
  s.fraquezasExtra = clean((blocks.get("fraquezas") ?? "").split(/Fraquezas Adicionais:\n?/)[1]);
  const pers = blocks.get("personalidade") ?? "";
  s.ideais = clean(pers.match(/Ideais:\n([\s\S]*?)\n*Traços de Personalidade:/)?.[1]);
  s.tracos = clean(pers.split(/Traços de Personalidade:\n?/)[1]);
  s.historia = clean(blocks.get("historia do personagem"));

  const pv = txt.match(/^PV: (\d+) \//m)?.[1];
  const mana = txt.match(/Mana: (\d+) \//)?.[1];
  return finish(s, {
    raca: line(/^Raça: (.*)$/m),
    classe: line(/^Classe: (.*)$/m),
    pv: pv ? Number(pv) : undefined,
    mana: mana ? Number(mana) : undefined,
  });
}
