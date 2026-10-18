// Editor de modelos de ficha do mestre: seções, campos, fórmulas e rolagens.
import { useMemo, useState } from "react";
import type { FieldType, SheetField, SheetSection, SheetTemplate } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { api, useColl } from "../game.ts";
import { ui } from "../table/ui.ts";
import { EditField } from "../ui/EditField.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Window } from "../ui/Window.tsx";
import { BUILTIN } from "./templates.ts";
import { exportTemplate } from "./transfer.ts";

const TYPES: [FieldType, string][] = [
  ["text", "Texto"], ["number", "Número"], ["textarea", "Texto longo"], ["checkbox", "Caixa"],
  ["resource", "Recurso (atual/máx.)"], ["attribute", "Atributo (valor + mod.)"], ["skill", "Perícia"],
  ["computed", "Calculado"], ["roll", "Botão de rolagem"], ["list", "Lista (tabela)"],
];
const COL_TYPES: [FieldType, string][] = [["text", "Texto"], ["number", "Número"], ["checkbox", "Caixa"], ["roll", "Rolagem"]];

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "campo";

function uniqueId(base: string, taken: Set<string>) {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  return id;
}

export function TemplateEditor() {
  const show = ui.use((s) => s.showTemplates);
  const templates = useColl("templates");
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => Object.values(templates).sort((a, b) => a.name.localeCompare(b.name)), [templates]);
  if (!show) return null;
  const t = sel ? templates[sel] : undefined;

  const create = (from?: SheetTemplate) => {
    const id = newId();
    const base: SheetTemplate = from
      ? { ...structuredClone(from), id, name: `${from.name} (cópia)`, builtin: false }
      : { id, name: "Meu sistema", sections: [{ title: "Personagem", columns: 2, fields: [{ type: "text", id: "concept", label: "Conceito" }, { type: "resource", id: "hp", label: "Vida", default: 10 }] }] };
    delete base.builtin;
    api.create("templates", base);
    setSel(id);
  };

  return (
    <Window title="Modelos de ficha" width={860} height={680} onClose={() => ui.set({ showTemplates: false })}>
      <div className="tpl-editor">
        <div className="tpl-list">
          <button className="btn small primary" onClick={() => create()}><Icon name="plus" size={14} /> Modelo em branco</button>
          <span className="small muted">Ou copie um pronto:</span>
          {BUILTIN.map((b) => (
            <button key={b.id} className="btn small ghost" onClick={() => create(b)}><Icon name="copy" size={13} /> {b.name}</button>
          ))}
          <div className="sep" />
          {list.length === 0 && <span className="small muted">Nenhum modelo seu ainda.</span>}
          {list.map((x) => (
            <button key={x.id} className={`list-item ${sel === x.id ? "active" : ""}`} onClick={() => setSel(x.id)}>
              <span className="name">{x.name}</span>
            </button>
          ))}
        </div>
        <div className="tpl-body">
          {t ? <TemplateForm t={t} onDelete={() => setSel(null)} /> : (
            <div className="empty">
              Crie um modelo para o seu sistema. Campos podem usar fórmulas com <span className="mono">@{"{id}"}</span>, por exemplo:<br />
              <span className="mono">floor((@{"{forca}"} - 10) / 2)</span> ou rolagem <span className="mono">1d20 + @{"{forca_mod}"}</span>.<br />
              Use o id <span className="mono">hp</span> num recurso para ligar a barra de vida dos tokens.
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}

function TemplateForm({ t, onDelete }: { t: SheetTemplate; onDelete: () => void }) {
  const save = (sections: SheetSection[]) => api.update("templates", t.id, { sections });
  const taken = new Set(t.sections.flatMap((s) => s.fields.map((f) => f.id ?? "")));
  const setSection = (i: number, s: SheetSection) => save(t.sections.map((x, k) => (k === i ? s : x)));
  const move = <T,>(arr: T[], i: number, d: number): T[] => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const copy = [...arr];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };

  return (
    <div className="col">
      <div className="row">
        <EditField value={t.name} onCommit={(v) => api.update("templates", t.id, { name: v || "Modelo" })} />
        <label className="check small" title="Mostra Vant./Desv. na ficha e troca 1d20 por 2d20">
          <input type="checkbox" checked={!!t.advantage} onChange={(e) => api.update("templates", t.id, { advantage: e.target.checked })} /> Vantagem (d20)
        </label>
        <button className="icon-btn" title="Exportar modelo (.json) — importe pelo diário de outra campanha" onClick={() => exportTemplate(t)}>
          <Icon name="download" size={16} />
        </button>
        <button
          className="icon-btn" title="Excluir modelo"
          onClick={() => {
            if (confirm(`Excluir o modelo "${t.name}"? Fichas que usam ele passam para a ficha livre.`)) {
              api.remove("templates", t.id);
              onDelete();
            }
          }}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
      {t.sections.map((s, si) => (
        <div key={si} className="tpl-sec">
          <div className="row">
            <EditField value={s.title} onCommit={(v) => setSection(si, { ...s, title: v })} />
            <label className="row small muted" style={{ gap: 4 }}>
              Colunas
              <select className="input small" style={{ width: 56 }} value={s.columns ?? 1} onChange={(e) => setSection(si, { ...s, columns: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="icon-btn small" onClick={() => save(move(t.sections, si, -1))} title="Subir"><Icon name="arrowUp" size={14} /></button>
            <button className="icon-btn small" onClick={() => save(move(t.sections, si, 1))} title="Descer"><Icon name="arrowDown" size={14} /></button>
            <button className="icon-btn small" onClick={() => save(t.sections.filter((_, k) => k !== si))} title="Remover seção"><Icon name="trash" size={14} /></button>
          </div>
          {s.fields.map((f, fi) => (
            <FieldRow
              key={fi}
              f={f}
              taken={taken}
              onChange={(nf) => setSection(si, { ...s, fields: s.fields.map((x, k) => (k === fi ? nf : x)) })}
              onRemove={() => setSection(si, { ...s, fields: s.fields.filter((_, k) => k !== fi) })}
              onMove={(d) => setSection(si, { ...s, fields: move(s.fields, fi, d) })}
            />
          ))}
          <button
            className="btn small"
            onClick={() => setSection(si, { ...s, fields: [...s.fields, { type: "number", id: uniqueId("campo", taken), label: "Novo campo" }] })}
          >
            <Icon name="plus" size={13} /> Campo
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => save([...t.sections, { title: "Nova seção", columns: 2, fields: [] }])}><Icon name="plus" size={14} /> Seção</button>
    </div>
  );
}

function FieldRow({ f, taken, onChange, onRemove, onMove, isColumn }: {
  f: SheetField; taken: Set<string>; onChange: (f: SheetField) => void; onRemove: () => void; onMove: (d: number) => void; isColumn?: boolean;
}) {
  const needsFormula = f.type === "computed" || f.type === "attribute" || (f.type === "skill" && !f.check);
  const needsRoll = ["computed", "attribute", "skill", "roll", "text"].includes(f.type) && !(f.type === "skill" && f.check);
  return (
    <div className={`tpl-field ${isColumn ? "col-field" : ""}`}>
      <div className="row">
        <select className="input small" style={{ width: 150 }} value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as FieldType, ...(e.target.value === "list" && !f.columns ? { columns: [{ type: "text", id: "name", label: "Nome" }] } : {}) })}>
          {(isColumn ? COL_TYPES : TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <EditField
          className="input small"
          value={f.label}
          placeholder="Rótulo"
          onCommit={(v) => onChange({ ...f, label: v, ...(f.id?.startsWith("campo") ? { id: uniqueId(slug(v), taken) } : {}) })}
        />
        <EditField className="input small mono" style={{ width: 120 }} value={f.id} placeholder="id" title="Usado nas fórmulas como @{id}" onCommit={(v) => onChange({ ...f, id: slug(v) })} />
        <button className="icon-btn small" onClick={() => onMove(-1)} title="Subir"><Icon name="arrowUp" size={13} /></button>
        <button className="icon-btn small" onClick={() => onMove(1)} title="Descer"><Icon name="arrowDown" size={13} /></button>
        <button className="icon-btn small" onClick={onRemove} title="Remover"><Icon name="x" size={13} /></button>
      </div>
      <div className="row wrap small">
        {f.type !== "roll" && f.type !== "computed" && f.type !== "list" && (
          <EditField className="input small" style={{ width: 110 }} value={f.default as string} placeholder="Valor inicial" onCommit={(v) => onChange({ ...f, default: f.type === "number" || f.type === "resource" || f.type === "attribute" || f.check ? Number(v) || 0 : v })} />
        )}
        {needsFormula && (
          <EditField className="input small mono grow" value={f.formula} placeholder={f.type === "attribute" ? "Modificador, ex.: floor((@{forca} - 10) / 2)" : "Fórmula, ex.: @{forca_mod} + @{pb}"} onCommit={(v) => onChange({ ...f, formula: v })} />
        )}
        {needsRoll && (
          <EditField className="input small mono grow" value={f.roll} placeholder="Rolagem, ex.: 1d20 + @{id}" onCommit={(v) => onChange({ ...f, roll: v || undefined })} />
        )}
        {f.type === "skill" && (
          <label className="check small"><input type="checkbox" checked={f.check === "coc"} onChange={(e) => onChange({ ...f, check: e.target.checked ? "coc" : undefined })} /> Teste percentual (d100 ≤ valor)</label>
        )}
        {f.type === "roll" && isColumn && (
          <label className="check small"><input type="checkbox" checked={f.check === "coc"} onChange={(e) => onChange({ ...f, check: e.target.checked ? "coc" : undefined })} /> d100 ≤ valor</label>
        )}
      </div>
      {f.type === "list" && (
        <div className="tpl-cols">
          <span className="small muted">Colunas (em rolagens, use @{"{.coluna}"} para o valor da linha):</span>
          {(f.columns ?? []).map((c, ci) => (
            <FieldRow
              key={ci}
              isColumn
              f={c}
              taken={new Set((f.columns ?? []).map((x) => x.id ?? ""))}
              onChange={(nc) => onChange({ ...f, columns: (f.columns ?? []).map((x, k) => (k === ci ? nc : x)) })}
              onRemove={() => onChange({ ...f, columns: (f.columns ?? []).filter((_, k) => k !== ci) })}
              onMove={(d) => {
                const cols = [...(f.columns ?? [])];
                const j = ci + d;
                if (j < 0 || j >= cols.length) return;
                [cols[ci], cols[j]] = [cols[j], cols[ci]];
                onChange({ ...f, columns: cols });
              }}
            />
          ))}
          <button className="btn small" onClick={() => onChange({ ...f, columns: [...(f.columns ?? []), { type: "text", id: uniqueId("coluna", new Set((f.columns ?? []).map((x) => x.id ?? ""))), label: "Coluna" }] })}>
            <Icon name="plus" size={12} /> Coluna
          </button>
        </div>
      )}
    </div>
  );
}
