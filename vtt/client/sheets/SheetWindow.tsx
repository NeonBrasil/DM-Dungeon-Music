// Janela de ficha: desenha qualquer modelo (prontos ou do mestre) a partir dos campos.
import { useMemo, useRef, useState } from "react";
import type { Character, SheetField, SheetTemplate } from "../../shared/types.ts";
import { api, game, useColl } from "../game.ts";
import { closeSheet, canControl, ui } from "../table/ui.ts";
import { EditField } from "../ui/EditField.tsx";
import { Icon } from "../ui/Icon.tsx";
import { cropAndUpload } from "../ui/ImageCrop.tsx";
import { Window } from "../ui/Window.tsx";
import { initialsOf } from "../chat/Chat.tsx";
import { expand, fmtBonus, resolver, rollCoc, rollFormula, rollOp, type RollCtx, type RollMode, type Row } from "./engine.ts";
import { findTemplate } from "./templates.ts";
import { exportCharacter } from "./transfer.ts";

const PROF_ICON = ["○", "●", "◆"];

export function SheetWindow({ id }: { id: string }) {
  const ch = useColl("characters")[id];
  const templates = useColl("templates");
  const players = useColl("players");
  const graphics = useColl("graphics");
  const selected = ui.use((s) => s.selected);
  const role = game.use((s) => s.role);
  const [mode, setMode] = useState<RollMode>("normal");
  const [cocMod, setCocMod] = useState(0);
  const [secret, setSecret] = useState(false);
  const [owners, setOwners] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = useMemo(() => (ch ? findTemplate(ch.template, templates) : null), [ch?.template, templates]);
  const calc = useMemo(() => (t && ch ? resolver(t, ch.data) : null), [t, ch?.data]);
  if (!ch || !t || !calc) return null;
  const gm = role === "gm";
  const editable = canControl(ch.controlledBy);
  const hasCoc = t.sections.some((s) => s.fields.some((f) => f.check === "coc" || f.columns?.some((c) => c.check === "coc")));
  const tokens = Object.values(graphics).filter((g) => g.characterId === id);
  const graphicId = (tokens.find((g) => selected.includes(g.id)) ?? tokens[0])?.id;
  const ctx: RollCtx = { character: ch, template: t, mode, secret, graphicId };
  const set = (fid: string, v: unknown) => api.update("characters", id, { [`data.${fid}`]: v });

  const onAvatar = async (file: File | undefined) => {
    if (!file) return;
    const url = await cropAndUpload(file, { aspect: 1, size: 512 });
    if (!url) return;
    // tokens da ficha que usavam a imagem antiga (ou nenhuma) passam a usar a nova
    for (const g of tokens) if ((!g.src || g.src === ch.avatar) && canControl(g.controlledBy)) api.update("graphics", g.id, { src: url });
    api.update("characters", id, { avatar: url });
  };

  return (
    <Window
      title={ch.name}
      width={700}
      height={780}
      onClose={() => closeSheet(id)}
      actions={
        <>
          {t.advantage && (
            <div className="seg small" title="Vantagem / desvantagem em rolagens de d20">
              <button className={mode === "dis" ? "on" : ""} onClick={() => setMode(mode === "dis" ? "normal" : "dis")}>Desv.</button>
              <button className={mode === "adv" ? "on" : ""} onClick={() => setMode(mode === "adv" ? "normal" : "adv")}>Vant.</button>
            </div>
          )}
          {hasCoc && (
            <select className="input small" style={{ width: "auto", padding: "3px 6px" }} value={cocMod} onChange={(e) => setCocMod(Number(e.target.value))} title="Dados de bônus/penalidade">
              <option value={2}>+2 bônus</option>
              <option value={1}>+1 bônus</option>
              <option value={0}>normal</option>
              <option value={-1}>1 penalidade</option>
              <option value={-2}>2 penalidades</option>
            </select>
          )}
          <button className={`icon-btn small ${secret ? "active" : ""}`} title="Rolagens secretas (só você e o mestre)" onClick={() => setSecret(!secret)}>
            <Icon name="eyeOff" size={15} />
          </button>
          <button className="icon-btn small" title="Exportar ficha (arquivo)" onClick={() => exportCharacter(ch, t)}>
            <Icon name="download" size={15} />
          </button>
        </>
      }
    >
      <div className="sheet">
        <div className="sheet-head">
          <button
            className="sheet-avatar"
            style={ch.avatar ? { backgroundImage: `url("${ch.avatar}")` } : undefined}
            onClick={() => editable && fileRef.current?.click()}
            title={editable ? "Trocar imagem" : undefined}
          >
            {!ch.avatar && initialsOf(ch.name)}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onAvatar(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="grow col" style={{ gap: 4 }}>
            <EditField className="input sheet-name" value={ch.name} readOnly={!editable} onCommit={(v) => api.update("characters", id, { name: v || "Sem nome" })} />
            <div className="row small muted">
              <span>{t.name}</span>
              {gm && (
                <>
                  <span className="spacer" />
                  <label className="check small"><input type="checkbox" checked={ch.shared} onChange={(e) => api.update("characters", id, { shared: e.target.checked })} /> Todos veem</label>
                  <button className="btn small" onClick={() => setOwners(!owners)}><Icon name="users" size={13} /> Donos</button>
                  <button
                    className="icon-btn small" title="Excluir ficha"
                    onClick={() => {
                      if (confirm(`Excluir a ficha de ${ch.name}?`)) {
                        api.remove("characters", id);
                        closeSheet(id);
                      }
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </div>
            {gm && owners && (
              <div className="row wrap small">
                {Object.values(players).map((p) => (
                  <label key={p.id} className="check small">
                    <input
                      type="checkbox"
                      checked={ch.controlledBy.includes(p.id)}
                      onChange={(e) => api.update("characters", id, {
                        controlledBy: e.target.checked ? [...ch.controlledBy, p.id] : ch.controlledBy.filter((x) => x !== p.id),
                      })}
                    />
                    <span style={{ color: p.color }}>{p.name}</span>
                  </label>
                ))}
                {Object.keys(players).length === 0 && <span className="muted">Nenhum jogador entrou ainda.</span>}
              </div>
            )}
          </div>
        </div>

        {t.sections.map((sec, si) => (
          <section className="sheet-sec" key={si}>
            <h4>{sec.title}</h4>
            <div className="sheet-grid" data-cols={sec.columns ?? 1} style={{ gridTemplateColumns: `repeat(${sec.columns ?? 1}, minmax(0, 1fr))` }}>
              {sec.fields.map((f, fi) => (
                <FieldView key={f.id ?? fi} f={f} ch={ch} t={t} ctx={ctx} calc={calc} editable={editable} set={set} cocMod={cocMod} />
              ))}
            </div>
          </section>
        ))}

        {gm && (
          <section className="sheet-sec">
            <h4>Notas do mestre (só você vê)</h4>
            <EditField multiline rows={3} value={ch.gmNotes ?? ""} onCommit={(v) => api.update("characters", id, { gmNotes: v })} />
          </section>
        )}
      </div>
    </Window>
  );
}

interface FieldProps {
  f: SheetField;
  ch: Character;
  t: SheetTemplate;
  ctx: RollCtx;
  calc: ReturnType<typeof resolver>;
  editable: boolean;
  set: (fid: string, v: unknown) => void;
  cocMod: number;
}

function FieldView({ f, ch, t, ctx, calc, editable, set, cocMod }: FieldProps) {
  const id = f.id ?? "";
  const val = ch.data[id] ?? f.default;
  const span = f.span ? { gridColumn: "1 / -1" } : undefined;
  const label = f.label ?? id;

  switch (f.type) {
    case "text":
      return (
        <label className="sf" style={span}>
          <span>{label}{f.roll && <RollBtn onClick={() => rollFormula(ctx, f.roll!, label)} />}</span>
          <EditField value={val as string} readOnly={!editable} onCommit={(v) => set(id, v)} />
        </label>
      );
    case "number":
      return (
        <label className="sf" style={span}>
          <span>{label}</span>
          <EditField type="number" value={val as number} readOnly={!editable} onCommit={(v) => set(id, Number(v) || 0)} />
        </label>
      );
    case "textarea":
      return (
        <label className="sf" style={{ gridColumn: "1 / -1" }}>
          <span>{label}</span>
          <EditField multiline rows={3} value={val as string} readOnly={!editable} onCommit={(v) => set(id, v)} />
        </label>
      );
    case "checkbox":
      return (
        <label className="check" style={span}>
          <input type="checkbox" checked={!!val} disabled={!editable} onChange={(e) => set(id, e.target.checked)} /> {label}
        </label>
      );
    case "resource": {
      const cur = Number(ch.data[id] ?? f.default ?? 0);
      const max = Number(ch.data[`${id}_max`] ?? f.default ?? 0);
      return (
        <div className="sf res" style={span}>
          <span>{label}</span>
          <div className="row" style={{ gap: 4 }}>
            {editable && <button className="icon-btn small" onClick={() => set(id, cur - 1)}><Icon name="minus" size={14} /></button>}
            <EditField className="input res-cur" type="number" value={cur} readOnly={!editable} onCommit={(v) => set(id, Number(v) || 0)} />
            <span className="muted">/</span>
            <EditField className="input res-max" type="number" value={max} readOnly={!editable} onCommit={(v) => set(`${id}_max`, Number(v) || 0)} />
            {editable && <button className="icon-btn small" onClick={() => set(id, cur + 1)}><Icon name="plus" size={14} /></button>}
          </div>
        </div>
      );
    }
    case "computed": {
      const v = calc.resolve(id);
      return (
        <button className={`sf comp ${f.roll ? "rollable" : ""}`} style={span} onClick={() => f.roll && rollFormula(ctx, f.roll, label, undefined, f.tracker)} disabled={!f.roll}>
          <span>{label}</span>
          <b>{f.roll ? fmtBonus(v) : v}</b>
        </button>
      );
    }
    case "attribute": {
      if (f.check === "op") {
        return (
          <div className="attr" style={span}>
            <button className="attr-label" onClick={() => rollOp(ctx, Number(val ?? 0), 0, `Teste de ${label}`)} title="Rolar (d20 = valor)">{label}</button>
            <EditField className="input attr-op" type="number" value={val as number} readOnly={!editable} onCommit={(v) => set(id, Number(v) || 0)} />
          </div>
        );
      }
      const mod = calc.resolve(`${id}_mod`);
      return (
        <div className="attr" style={span}>
          <button className="attr-label" onClick={() => f.roll && rollFormula(ctx, f.roll, `Teste de ${label}`)} title="Rolar">{label}</button>
          <div className="attr-mod">{fmtBonus(mod)}</div>
          <EditField className="input attr-score" type="number" value={val as number} readOnly={!editable} onCommit={(v) => set(id, Number(v) || 0)} />
        </div>
      );
    }
    case "skill": {
      if (f.check === "coc") {
        const v = Number(val ?? 0);
        return (
          <div className="skill coc" style={span}>
            <button className="skill-name" onClick={() => rollCoc(ctx, v, label, cocMod)} title="Rolar teste">{label}</button>
            <EditField className="input skill-val" type="number" value={v} readOnly={!editable} onCommit={(x) => set(id, Number(x) || 0)} />
            <small title="Difícil (metade)">{Math.floor(v / 2)}</small>
            <small title="Extremo (um quinto)">{Math.floor(v / 5)}</small>
          </div>
        );
      }
      if (f.check === "op") {
        const train = Number(ch.data[`${id}_train`] ?? 0);
        const bonus = Number(ch.data[`${id}_bonus`] ?? 0);
        const dice = Number(ch.data[f.ability ?? ""] ?? 1);
        return (
          <div className="skill op" style={span}>
            <select className="train" value={train} disabled={!editable} title="Treinamento" onChange={(e) => set(`${id}_train`, Number(e.target.value))}>
              <option value={0}>—</option>
              <option value={5}>T</option>
              <option value={10}>V</option>
              <option value={15}>E</option>
            </select>
            <button className="skill-name" onClick={() => rollOp(ctx, dice, train + bonus, label, f.tracker)}>
              {label} <small>({(f.ability ?? "").toUpperCase()})</small>{f.hint && <em title={f.hint}>*</em>}
            </button>
            <EditField className="input skill-bonus" type="number" value={bonus} readOnly={!editable} title="Outros bônus" onCommit={(v) => set(`${id}_bonus`, Number(v) || 0)} />
            <b>{fmtBonus(train + bonus)}</b>
          </div>
        );
      }
      const prof = Number(ch.data[`${id}_prof`] ?? 0);
      return (
        <div className="skill" style={span}>
          <button
            className={`prof p${prof}`}
            disabled={!editable}
            title="Proficiência (clique: nenhuma → proficiente → especialista)"
            onClick={() => set(`${id}_prof`, (prof + 1) % 3)}
          >
            {PROF_ICON[prof]}
          </button>
          <button className="skill-name" onClick={() => f.roll && rollFormula(ctx, f.roll, label, undefined, f.tracker)}>
            {label} {f.ability && <small>({f.ability})</small>}{f.hint && <em title={f.hint}>*</em>}
          </button>
          {f.bonus && (
            <EditField
              className="input skill-bonus" type="number" value={Number(ch.data[`${id}_bonus`] ?? 0)} readOnly={!editable}
              title="Outros bônus (ex.: aptidão da vocação)" onCommit={(v) => set(`${id}_bonus`, Number(v) || 0)}
            />
          )}
          <b>{fmtBonus(calc.resolve(id))}</b>
        </div>
      );
    }
    case "roll":
      return (
        <button className="btn small" style={span} onClick={() => f.roll && rollFormula(ctx, f.roll, label)}>
          <Icon name="dice" size={14} /> {label}
        </button>
      );
    case "list":
      return <ListField f={f} rows={(ch.data[id] as Row[]) ?? []} t={t} ch={ch} ctx={ctx} editable={editable} cocMod={cocMod} onChange={(rows) => set(id, rows)} />;
  }
}

function RollBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-btn small" style={{ width: 20, height: 18, marginLeft: 4 }} onClick={(e) => { e.preventDefault(); onClick(); }} title="Rolar">
      <Icon name="dice" size={12} />
    </button>
  );
}

function ListField({ f, rows, t, ch, ctx, editable, cocMod, onChange }: {
  f: SheetField; rows: Row[]; t: SheetTemplate; ch: Character; ctx: RollCtx; editable: boolean; cocMod: number; onChange: (rows: Row[]) => void;
}) {
  const cols = f.columns ?? [];
  const dataCols = cols.filter((c) => c.type !== "roll");
  const rollCols = cols.filter((c) => c.type === "roll");
  const add = () => {
    const row: Row = {};
    for (const c of dataCols) if (c.id) row[c.id] = c.default ?? (c.type === "number" ? 0 : c.type === "checkbox" ? false : "");
    onChange([...rows, row]);
  };
  const edit = (i: number, key: string, v: unknown) => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)));
  return (
    <div className="sheet-list" style={{ gridColumn: "1 / -1" }}>
      <table>
        <thead>
          <tr>
            {dataCols.map((c) => <th key={c.id}>{c.label}</th>)}
            {rollCols.length > 0 && <th />}
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {dataCols.map((c) => (
                <td key={c.id}>
                  {c.type === "checkbox" ? (
                    <input type="checkbox" checked={!!r[c.id!]} disabled={!editable} onChange={(e) => edit(i, c.id!, e.target.checked)} />
                  ) : (
                    <EditField
                      className="input small"
                      type={c.type === "number" ? "number" : "text"}
                      value={r[c.id!] as string}
                      readOnly={!editable}
                      title={typeof r[c.id!] === "string" && String(r[c.id!]).includes("@{") ? expand(t, ch.data, String(r[c.id!]), r) : undefined}
                      onCommit={(v) => edit(i, c.id!, c.type === "number" ? Number(v) || 0 : v)}
                    />
                  )}
                </td>
              ))}
              {rollCols.length > 0 && (
                <td className="row" style={{ gap: 3 }}>
                  {rollCols.map((c) => (
                    <button
                      key={c.id}
                      className="btn small"
                      onClick={() => {
                        const name = String(r.name || f.label || "");
                        const lbl = `${name} — ${c.label}`;
                        const calcRow = resolver(t, ch.data, r);
                        if (c.check === "coc") rollCoc(ctx, calcRow.safeEval(c.roll ?? "0"), lbl, cocMod);
                        else if (c.check === "op") rollOp(ctx, calcRow.safeEval("@{.attr}"), calcRow.safeEval("@{.bonus}"), lbl);
                        else rollFormula(ctx, c.roll ?? "0", lbl, r);
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </td>
              )}
              {editable && (
                <td>
                  <button className="icon-btn small" title="Remover linha" onClick={() => onChange(rows.filter((_, k) => k !== i))}><Icon name="x" size={13} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editable && <button className="btn small" onClick={add}><Icon name="plus" size={13} /> Adicionar</button>}
      {!rows.length && !editable && <div className="muted small">—</div>}
    </div>
  );
}
