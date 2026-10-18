// Biblioteca de imagens do mestre: enviar e arrastar para o tabuleiro.
import { useMemo, useRef, useState } from "react";
import { newId } from "../../shared/util.ts";
import { api, uploadFile, useColl } from "../game.ts";
import { Icon } from "../ui/Icon.tsx";

export function measureImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 70, h: 70 });
    img.src = url;
  });
}

export async function uploadImages(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const url = await uploadFile(file, file.name);
    const { w, h } = await measureImage(url);
    api.create("assets", { id: newId(), name: file.name.replace(/\.[^.]+$/, ""), url, type: "image", w, h });
  }
}

export function Library() {
  const assets = useColl("assets");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const images = useMemo(
    () => Object.values(assets).filter((a) => a.type === "image" && a.name.toLowerCase().includes(filter.toLowerCase())).reverse(),
    [assets, filter],
  );

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      await uploadImages(files);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="side-scroll"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("application/x-dm-asset")) return;
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="row">
        <input className="input" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn" onClick={() => input.current?.click()} disabled={busy}>
          <Icon name="upload" size={15} /> {busy ? "Enviando…" : "Enviar"}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>
      <div className="drop-hint">Arraste imagens para cá, ou direto para o tabuleiro. A camada ativa define se vira mapa ou token.</div>
      {images.length === 0 ? (
        <div className="empty">Biblioteca vazia.</div>
      ) : (
        <div className="asset-grid">
          {images.map((a) => (
            <div
              key={a.id}
              className="asset"
              title={a.name}
              draggable
              style={{ backgroundImage: `url("${a.url}")` }}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-dm-asset", JSON.stringify({ url: a.url, w: a.w ?? 70, h: a.h ?? 70, name: a.name }));
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <button className="icon-btn small del" title="Remover da biblioteca" onClick={() => api.remove("assets", a.id)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
