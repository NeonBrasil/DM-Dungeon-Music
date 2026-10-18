// Exportar/importar fichas e modelos entre campanhas (arquivos .json).
import type { Character, SheetTemplate } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { api, game, uploadFile } from "../game.ts";
import { BUILTIN } from "./templates.ts";

interface CharacterFile {
  type: "dm-mesa-ficha";
  version: 1;
  character: { name: string; template: string; data: Record<string, unknown>; avatar?: string };
  templateDef?: SheetTemplate; // modelo próprio vai junto
}

interface TemplateFile { type: "dm-mesa-modelo"; version: 1; template: SheetTemplate }

function download(name: string, data: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "arquivo"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export async function exportCharacter(ch: Character, t: SheetTemplate) {
  const file: CharacterFile = {
    type: "dm-mesa-ficha",
    version: 1,
    character: { name: ch.name, template: ch.template, data: ch.data, avatar: ch.avatar ? await toDataUrl(ch.avatar) : undefined },
    templateDef: t.builtin ? undefined : t,
  };
  download(ch.name, file);
}

export function exportTemplate(t: SheetTemplate) {
  const file: TemplateFile = { type: "dm-mesa-modelo", version: 1, template: t };
  download(`modelo-${t.name}`, file);
}

/** Garante o modelo na campanha; devolve o id a usar. */
function ensureTemplate(def: SheetTemplate): string {
  const custom = game.get().colls.templates;
  if (BUILTIN.some((b) => b.id === def.id)) return def.id;
  const same = Object.values(custom).find((x) => x.id === def.id || (x.name === def.name && JSON.stringify(x.sections) === JSON.stringify(def.sections)));
  if (same) return same.id;
  const id = newId();
  api.create("templates", { ...def, id, builtin: undefined } as SheetTemplate);
  return id;
}

export async function importFile(file: File): Promise<string> {
  const json = JSON.parse(await file.text());
  if (json?.type === "dm-mesa-modelo" && json.template?.sections) {
    if (game.get().role !== "gm") throw new Error("Só o mestre importa modelos.");
    ensureTemplate(json.template);
    return `Modelo "${json.template.name}" importado.`;
  }
  if (json?.type !== "dm-mesa-ficha" || !json.character) throw new Error("Arquivo não é uma ficha ou modelo do DM Mesa.");
  const c = json.character as CharacterFile["character"];
  let template = c.template;
  if (json.templateDef?.sections) {
    if (game.get().role === "gm") template = ensureTemplate(json.templateDef);
    else if (!game.get().colls.templates[template]) template = "free";
  }
  let avatar: string | undefined;
  if (typeof c.avatar === "string" && c.avatar.startsWith("data:image/")) {
    const blob = await (await fetch(c.avatar)).blob();
    avatar = await uploadFile(blob, `avatar.${blob.type.split("/")[1] || "png"}`);
  }
  const { role, playerId } = game.get();
  api.create("characters", {
    id: newId(), name: String(c.name || "Personagem"), template, data: c.data ?? {}, avatar,
    controlledBy: role === "gm" ? [] : [playerId!], shared: false,
  });
  return `Ficha "${c.name}" importada.`;
}
