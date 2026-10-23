// Local feito à mão: marcador do mestre que abre um gerador (lugar novo) ou leva a uma página que já existe.
import { useState } from "react";
import type { WorldLink } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";
import { useColl } from "../game.ts";
import { randomSeed } from "../gen/rng.ts";
import type { GenKind } from "../gen/types.ts";
import { Modal } from "../ui/Window.tsx";
import { act } from "./history.ts";
import { useViewPage } from "./ui.ts";

const NEW: [GenKind, string][] = [["city", "Cidade / vila nova"], ["dungeon", "Masmorra nova"], ["cave", "Caverna nova"], ["region", "Região nova"]];

/** Parâmetros que dão o nome ao lugar no gerador. */
function naming(kind: GenKind, name: string): Record<string, unknown> {
  if (kind === "dungeon") return { title: { title: name, bare: name, g: /a$/i.test(name.split(" ")[0]) ? "f" : "m" } };
  return { name };
}

export function PlaceModal({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const page = useViewPage();
  const pages = useColl("pages");
  const graphics = useColl("graphics");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("city");
  const [visible, setVisible] = useState(false);
  if (!page) return null;
  const others = Object.values(pages).filter((p) => p.id !== page.id).sort((a, b) => a.order - b.order);

  const create = () => {
    const pid = target.startsWith("page:") ? target.slice(5) : null;
    const label = name.trim() || (pid ? pages[pid].name : "Novo local");
    const kind = pid ? pages[pid].source?.kind ?? "region" : (target as GenKind);
    const link: WorldLink = pid
      ? { kind, seed: "", label, params: {}, pageId: pid }
      : { kind, seed: randomSeed(), label, params: naming(kind, label) };
    const gs = page.gridSize;
    const h = gs * Math.max(0.9, Math.max(page.cols, page.rows) / 70); // mesma letra dos marcadores do gerador
    const w = Math.max(h, label.length * h * 0.62);
    const layer = visible ? "map" : "gm";
    const z = Math.max(0, ...Object.values(graphics).filter((g) => g.pageId === page.id && g.layer === layer).map((g) => g.z + 1));
    act.create("graphics", {
      id: newId(), pageId: page.id, layer, z, kind: "text", text: label, color: "#ffd24a",
      x: x - w / 2, y: y - h / 2, w, h, controlledBy: [], link,
    });
    onClose();
  };

  return (
    <Modal title="Adicionar local" onClose={onClose}>
      <label className="field"><span>Nome</span>
        <input className="input" autoFocus value={name} placeholder="Ex.: Forte Cinzento" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
      </label>
      <label className="field"><span>Leva para</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <optgroup label="Gerar quando abrir">
            {NEW.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </optgroup>
          {others.length > 0 && (
            <optgroup label="Página que já existe">
              {others.map((p) => <option key={p.id} value={`page:${p.id}`}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <label className="check small"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Jogadores veem o nome</label>
      <div className="row">
        <span className="grow small muted">Duplo clique no local abre o lugar. Para mover, renomear ou apagar, use a camada {visible ? "Mapa" : "Mestre"}.</span>
        <button className="btn primary" onClick={create}>Adicionar</button>
      </div>
    </Modal>
  );
}
