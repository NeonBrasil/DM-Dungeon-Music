// Ajuste de imagem antes do upload: arrastar para enquadrar e zoom (roda do mouse ou barra).
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { uploadFile } from "../game.ts";
import { Modal } from "./Window.tsx";

interface CropOpts {
  aspect?: number; // largura/altura do recorte; sem valor = proporção da própria imagem
  size?: number;   // lado maior da imagem final (px)
}

const MAX_ZOOM = 6;

/** Abre o ajuste. Devolve a imagem recortada, o próprio arquivo ("Usar original") ou null (cancelou). */
export function cropImage(file: Blob, opts: CropOpts = {}): Promise<Blob | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (b: Blob | null) => {
      root.unmount();
      host.remove();
      resolve(b);
    };
    root.render(<Cropper file={file} opts={opts} done={done} />);
  });
}

/** Ajusta e envia; devolve a URL ou null se cancelou. */
export async function cropAndUpload(file: File, opts?: CropOpts): Promise<string | null> {
  const blob = await cropImage(file, opts);
  if (!blob) return null;
  const name = blob === file ? file.name : `${file.name.replace(/\.[^.]+$/, "")}.${blob.type.split("/")[1] || "png"}`;
  return uploadFile(blob, name);
}

function Cropper({ file, opts, done }: { file: Blob; opts: CropOpts; done: (b: Blob | null) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = imagem cobre o recorte inteiro
  const [pos, setPos] = useState({ x: 0, y: 0 }); // centro da imagem em relação ao centro do recorte (px de tela)
  const viewRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => (im.naturalWidth ? setImg(im) : done(file)); // SVG sem tamanho: vai como veio
    im.onerror = () => done(file);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const nw = img?.naturalWidth ?? 1;
  const nh = img?.naturalHeight ?? 1;
  const aspect = opts.aspect ?? nw / nh;
  const box = Math.min(320, window.innerWidth - 90);
  const vw = aspect >= 1 ? box : box * aspect;
  const vh = aspect >= 1 ? box / aspect : box;
  const cover = Math.max(vw / nw, vh / nh);
  const minZoom = Math.min(vw / nw, vh / nh) / cover; // < 1 deixa ver a imagem inteira (sobra transparente)
  const s = cover * zoom;

  // imagem maior que o recorte não deixa buraco; menor não sai do recorte
  const clampPos = (p: { x: number; y: number }, z: number) => {
    const lx = Math.abs(nw * cover * z - vw) / 2;
    const ly = Math.abs(nh * cover * z - vh) / 2;
    return { x: Math.max(-lx, Math.min(lx, p.x)), y: Math.max(-ly, Math.min(ly, p.y)) };
  };
  const setZ = (z: number) => {
    z = Math.max(minZoom, Math.min(MAX_ZOOM, z));
    setZoom(z);
    setPos((p) => clampPos({ x: (p.x * z) / zoom, y: (p.y * z) / zoom }, z)); // mantém o centro enquadrado
  };

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZ(zoom * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const apply = () => {
    if (!img) return;
    // resolução: a da própria imagem, sem passar do tamanho final pedido
    const k = Math.min((opts.size ?? 2048) / Math.max(vw, vh), 1 / s);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(vw * k));
    c.height = Math.max(1, Math.round(vh * k));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (vw / 2 + pos.x - (nw * s) / 2) * k, (vh / 2 + pos.y - (nh * s) / 2) * k, nw * s * k, nh * s * k);
    c.toBlob((b) => done(b ?? file), "image/webp", 0.9);
  };

  return (
    <Modal title="Ajustar imagem" onClose={() => done(null)}>
      <div
        ref={viewRef}
        className="crop-view"
        style={{ width: vw, height: vh }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPos(clampPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }, zoom));
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => {
          setZoom(1);
          setPos({ x: 0, y: 0 });
        }}
      >
        {img && (
          <img
            src={img.src} alt="" draggable={false}
            style={{ width: nw * s, height: nh * s, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
          />
        )}
      </div>
      <input type="range" min={minZoom} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!img} onChange={(e) => setZ(Number(e.target.value))} />
      <div className="small muted">Arraste para enquadrar · roda do mouse ou barra = zoom · duplo clique volta ao início</div>
      <div className="row">
        <button className="btn small ghost" onClick={() => done(file)} title="Envia a imagem sem cortar (mantém GIF animado)">Usar original</button>
        <span className="spacer" />
        <button className="btn" onClick={() => done(null)}>Cancelar</button>
        <button className="btn primary" disabled={!img} onClick={apply}>Aplicar</button>
      </div>
    </Modal>
  );
}
