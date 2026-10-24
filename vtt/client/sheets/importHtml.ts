// Importa a página HTML gerada pelo criador de fichas Star Wars (marca <<<SWFICHA:…>>>) para o modelo "swcw".
// Os números vêm da página (já com espécie/vocação aplicadas); o que a página não traz o jogador preenche na ficha.
import { defaultData, resolver, type Row } from "./engine.ts";
import { SWCW } from "./templates.ts";

export interface ImportedSheet {
  name: string;
  template: string;
  data: Record<string, unknown>;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Texto puro de um trecho de HTML: tags fora, <br> vira quebra de linha, entidades decodificadas. */
function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m)
    .trim();
}

/** Chave sem acento, símbolo nem maiúscula: "★ Pilotagem" → "pilotagem", "Uso da Força" → "uso da forca". */
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase();

const items = (html: string) => [...html.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => plain(m[1])).filter((s) => s && !s.startsWith("("));

const ATTACKS: Record<string, string> = { "sabre de luz": "atk_sabre", blaster: "atk_blaster", "corpo a corpo": "atk_corpo", "uso da forca": "atk_forca" };
const STORY: Record<string, string> = { aparencia: "aparencia", personalidade: "personalidade", background: "background", historia: "background", objetivos: "objetivos" };

export function parseSheetHtml(html: string): ImportedSheet | null {
  if (!/SWFICHA:v\d+:/.test(html)) return null;
  html = html.replace(/<div class="dados">[\s\S]*?<\/div>/i, "");
  const [head, ...rest] = html.split(/<h2[^>]*>/i);
  const sections = rest.map((p) => {
    const [title, body = ""] = p.split(/<\/h2>/i);
    return { title: plain(title), body };
  });

  const data: Record<string, unknown> = defaultData(SWCW);
  const notes: string[] = [];
  const checks: { id: string; total: number; trained: boolean }[] = [];
  const name = plain(head.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || "Sem nome";

  for (const [, label, value] of head.matchAll(/<div><strong>([^<]+)<\/strong><br>([\s\S]*?)<\/div>/gi)) {
    const v = plain(value);
    const k = key(label);
    if (k === "jogador") data.jogador = v;
    else if (k === "especie") data.especie = v;
    else if (k === "vocacao") data.vocacao = v;
    else if (k === "nivel") {
      data.nivel = parseInt(v) || 1;
      data.xp = Number(v.match(/\((\d+)\s*XP\)/i)?.[1] ?? 0);
    }
  }

  for (const { title, body } of sections) {
    const k = key(title);
    const text = plain(body);
    if (k === "atributos") {
      for (const [, abbr, val] of body.matchAll(/class="name">([^<]+)<\/div><div class="val">(-?\d+)/gi)) data[key(abbr)] = Number(val);
    } else if (k === "combate" || k === "pericias") {
      for (const [, label, total, detail] of body.matchAll(/<tr><td>([\s\S]*?)<\/td><td[^>]*>([+-]?\d+)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/gi)) {
        const id = k === "combate" ? ATTACKS[key(plain(label))] : key(plain(label)).replace(/ /g, "");
        if (!id || !SWCW.sections.some((s) => s.fields.some((f) => f.id === id))) {
          notes.push(`${plain(label)}: ${total} (${plain(detail)})`);
          continue;
        }
        // perícia treinada vem com ★; ataque treinado mostra a parcela de proficiência
        checks.push({ id, total: Number(total), trained: k === "combate" ? /prof\s*[+-]/i.test(detail) : label.includes("★") });
      }
      if (k === "combate") {
        const line = plain(body.split(/<table/i)[0]);
        const hp = Number(line.match(/HP:\s*(\d+)/i)?.[1]);
        if (hp) data.hp = data.hp_max = hp;
        const speed = line.match(/Velocidade:\s*([^|\n]+)/i)?.[1].trim();
        if (speed) data.deslocamento = speed;
        const size = line.match(/Tamanho:\s*([^|\n]+)/i)?.[1].trim();
        if (size) data.tamanho = size;
      }
    } else if (k.startsWith("traits") || k.startsWith("tracos")) {
      data.tracos = items(body).join("\n");
    } else if (k === "equipamento") {
      const armas: Row[] = [];
      const other: string[] = [];
      for (const [, label, list] of body.matchAll(/<strong>([^<]+?):?<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/gi)) {
        const g = key(label);
        const atk = g.startsWith("sabre") ? "atk_sabre" : g.startsWith("blaster") ? "atk_blaster" : g.startsWith("corpo") ? "atk_corpo" : "";
        if (atk) for (const n of items(list)) armas.push({ name: n, atk: `@{${atk}}`, dmg: "", kind: label });
        else if (items(list).length) other.push(`${label}: ${items(list).join(", ")}`);
      }
      data.armas = armas;
      data.equipamento = other.join("\n");
    } else if (k.startsWith("alinhamento")) {
      data.alinhamento = Number(text.match(/Pontua[çc][ãa]o:\s*(-?\d+)/i)?.[1] ?? 0);
    } else if (k === "historia") {
      for (const [, label, value] of body.matchAll(/<p><strong>([^<]+?):<\/strong>\s*([\s\S]*?)<\/p>/gi)) {
        const field = STORY[key(label)];
        if (field) data[field] = plain(value);
        else notes.push(`${label}: ${plain(value)}`);
      }
    } else if (!k.startsWith("como estes numeros")) {
      notes.push(`${title}\n${text}`); // seção que o modelo não conhece (ex.: poderes, lealdades) vai para Anotações
    }
  }

  // Aptidão = o que sobra do total mostrado na página depois de mod + proficiência: assim os números batem.
  for (const c of checks) {
    data[`${c.id}_prof`] = c.trained ? 1 : 0;
    data[`${c.id}_bonus`] = 0;
  }
  const { resolve } = resolver(SWCW, data);
  for (const c of checks) data[`${c.id}_bonus`] = c.total - resolve(c.id);
  if (notes.length) data.notes = notes.join("\n\n");

  return { name, template: SWCW.id, data };
}
