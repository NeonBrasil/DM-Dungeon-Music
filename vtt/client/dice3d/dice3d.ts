// Dados 3D: os dados rolam na tela e param mostrando o resultado que o servidor já sorteou.
// Este módulo é carregado sob demanda (three.js só baixa na primeira rolagem).
import * as THREE from "three";
import type { RollSeg } from "../../shared/types.ts";

interface Face { tris: number[]; normal: THREE.Vector3 }
interface Proto { geo: THREE.BufferGeometry; faces: Face[]; labels: string[] }
interface Die {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  spin: THREE.Vector3;
  t0: number;
  dur: number;
}

const DURATION = 1300;
const HOLD = 1300;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let canvas: HTMLCanvasElement;
let dice: Die[] = [];
let raf = 0;
let fadeTimer = 0;
const protos = new Map<string, Proto>();

function d10Geometry(): THREE.BufferGeometry {
  // trapezoedro pentagonal: pipas planas exigem anel em ±0,1056 com pontas em ±1
  const b = 0.1056;
  const T = new THREE.Vector3(0, 0, 1);
  const B = new THREE.Vector3(0, 0, -1);
  const U = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(Math.cos((i * 2 * Math.PI) / 5), Math.sin((i * 2 * Math.PI) / 5), b));
  const L = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(Math.cos((i * 2 * Math.PI) / 5 + Math.PI / 5), Math.sin((i * 2 * Math.PI) / 5 + Math.PI / 5), -b));
  const tris: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const n = (i + 1) % 5;
    tris.push(T, U[i], L[i], T, L[i], U[n]);
    tris.push(B, L[i], U[n], B, U[n], L[n]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flatMap((v) => [v.x, v.y, v.z]), 3));
  return g;
}

/** Agrupa triângulos coplanares em faces e garante normais para fora. */
function facesOf(geo: THREE.BufferGeometry): Face[] {
  const pos = geo.getAttribute("position");
  const faces: Face[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    if (n.dot(centroid) < 0) {
      n.negate();
      // inverte a ordem para a face ficar para fora
      const pa = pos.getX(t * 3 + 1), pb = pos.getY(t * 3 + 1), pc = pos.getZ(t * 3 + 1);
      pos.setXYZ(t * 3 + 1, pos.getX(t * 3 + 2), pos.getY(t * 3 + 2), pos.getZ(t * 3 + 2));
      pos.setXYZ(t * 3 + 2, pa, pb, pc);
    }
    const f = faces.find((x) => x.normal.dot(n) > 0.999);
    if (f) f.tris.push(t);
    else faces.push({ tris: [t], normal: n });
  }
  return faces;
}

function labelsFor(sides: number, tens: boolean): string[] {
  if (sides === 10) return Array.from({ length: 10 }, (_, i) => (tens ? `${i}0` : String(i)));
  if (sides === 3) return ["-", "", "+", "-", "", "+"];
  return Array.from({ length: sides }, (_, i) => String(i + 1));
}

function proto(sides: number, tens = false): Proto {
  const key = `${sides}:${tens}`;
  let p = protos.get(key);
  if (p) return p;
  let geo: THREE.BufferGeometry;
  if (sides === 4) geo = new THREE.TetrahedronGeometry(1.15);
  else if (sides === 6 || sides === 3) geo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
  else if (sides === 8) geo = new THREE.OctahedronGeometry(1.05);
  else if (sides === 10) geo = d10Geometry();
  else if (sides === 12) geo = new THREE.DodecahedronGeometry(1.05);
  else geo = new THREE.IcosahedronGeometry(1.1);
  geo = geo.index ? geo.toNonIndexed() : geo;
  const faces = facesOf(geo);
  // UV plano por face, centrado no centroide
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  geo.clearGroups();
  faces.forEach((f, fi) => {
    const pts: THREE.Vector3[] = [];
    for (const t of f.tris) for (let k = 0; k < 3; k++) pts.push(v.fromBufferAttribute(pos, t * 3 + k).clone());
    const cen = pts.reduce((s, p2) => s.add(p2), new THREE.Vector3()).divideScalar(pts.length);
    const u = new THREE.Vector3().subVectors(pts[0], cen).normalize();
    const w = new THREE.Vector3().crossVectors(f.normal, u).normalize();
    let ext = 0;
    for (const p2 of pts) ext = Math.max(ext, Math.abs(p2.clone().sub(cen).dot(u)), Math.abs(p2.clone().sub(cen).dot(w)));
    for (const t of f.tris) {
      for (let k = 0; k < 3; k++) {
        const p2 = v.fromBufferAttribute(pos, t * 3 + k).clone().sub(cen);
        uv[(t * 3 + k) * 2] = 0.5 + (p2.dot(u) / ext) * 0.5;
        uv[(t * 3 + k) * 2 + 1] = 0.5 + (p2.dot(w) / ext) * 0.5;
      }
      geo.addGroup(t * 3, 3, fi);
    }
  });
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const n = sides === 3 ? 6 : sides === 100 ? 10 : sides;
  p = { geo, faces, labels: labelsFor(sides === 100 ? 10 : sides, tens).slice(0, Math.max(n, faces.length)) };
  protos.set(key, p);
  return p;
}

function faceTexture(text: string, color: string, sides: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.fillRect(0, 0, 128, 128);
  const n = parseInt(color.slice(1), 16);
  const light = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 160;
  x.fillStyle = light ? "#1a1a1a" : "#ffffff";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${sides >= 12 ? 40 : text.length > 1 ? 44 : 56}px Georgia, serif`;
  x.fillText(text, 64, sides === 4 ? 78 : 66);
  if (text === "6" || text === "9") x.fillRect(48, 96, 32, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ensureRenderer() {
  if (renderer) return;
  canvas = document.createElement("canvas");
  canvas.className = "dice3d";
  document.body.appendChild(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 32);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, -4, 10);
  scene.add(sun);
  const resize = () => {
    renderer!.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);
}

/** Rotação que leva a normal da face para a câmera (+Z), com um giro aleatório no eixo Z. */
function landing(normal: THREE.Vector3): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromUnitVectors(normal.clone().normalize(), new THREE.Vector3(0, 0, 1));
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);
  return spin.multiply(q);
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  let busy = false;
  for (const d of dice) {
    const t = Math.max(0, Math.min(1, (now - d.t0) / d.dur));
    if (t < 1) busy = true;
    const e = 1 - Math.pow(1 - t, 3);
    d.mesh.position.lerpVectors(d.from, d.to, e);
    d.mesh.position.z = Math.abs(Math.sin(t * Math.PI * 2.2)) * (1 - t) * 3;
    if (t < 0.7) {
      const k = (1 - t / 0.7) * 0.35;
      const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(d.spin.x * k, d.spin.y * k, d.spin.z * k));
      d.q0.multiply(dq);
      d.mesh.quaternion.copy(d.q0);
    } else {
      d.mesh.quaternion.slerpQuaternions(d.q0, d.q1, Math.min(1, (t - 0.7) / 0.3));
    }
  }
  renderer!.render(scene, camera);
  if (!busy && dice.length && !fadeTimer) {
    fadeTimer = window.setTimeout(() => {
      for (const d of dice) {
        scene.remove(d.mesh);
        for (const m of d.mesh.material as THREE.MeshStandardMaterial[]) {
          m.map?.dispose();
          m.dispose();
        }
      }
      dice = [];
      fadeTimer = 0;
      renderer!.render(scene, camera);
      cancelAnimationFrame(raf);
      raf = 0;
    }, HOLD);
  }
}

/** Anima os dados de uma rolagem; resolve quando param (o resultado já pode aparecer). */
export function animateRoll(segs: RollSeg[], color: string, extra?: { tens: number[]; units: number }): Promise<void> {
  ensureRenderer();
  const list: { sides: number; value: number; tens?: boolean }[] = [];
  if (extra) {
    for (const t of extra.tens) list.push({ sides: 10, value: t / 10, tens: true });
    list.push({ sides: 10, value: extra.units });
  }
  for (const s of segs) {
    if (s.k !== "dice") continue;
    for (const r of s.rolls) {
      if (s.sides === 100) {
        const v = r.v % 100;
        list.push({ sides: 10, value: Math.floor(v / 10), tens: true }, { sides: 10, value: v % 10 });
      } else if (s.sides === 0) list.push({ sides: 3, value: r.v + 1 });
      else list.push({ sides: s.sides, value: s.sides === 10 ? r.v % 10 : r.v }); // d10 mostra 0 no lugar do 10
    }
  }
  const shown = list.slice(0, 12);
  if (!shown.length) return Promise.resolve();
  clearTimeout(fadeTimer);
  fadeTimer = 0;
  const now = performance.now();
  const cols = Math.min(6, shown.length);
  shown.forEach((d, i) => {
    const supported = [3, 4, 6, 8, 10, 12, 20].includes(d.sides);
    const p = proto(supported ? d.sides : 20, d.tens);
    const labels = p.labels;
    const mats = p.faces.map((_, fi) => new THREE.MeshStandardMaterial({ map: faceTexture(labels[fi % labels.length] ?? "", color, d.sides), roughness: 0.45, metalness: 0.08 }));
    const mesh = new THREE.Mesh(p.geo, mats);
    // face do resultado
    let idx = d.sides === 10 ? d.value : d.sides === 3 ? [0, 1, 2].indexOf(d.value) : d.value - 1;
    if (!supported) idx = Math.max(0, Math.min(19, Math.round(((d.value - 1) / Math.max(1, d.sides - 1)) * 19)));
    const face = p.faces[Math.max(0, Math.min(p.faces.length - 1, idx))];
    const row = Math.floor(i / cols);
    const col = i % cols;
    // um pouco à esquerda do centro, para não cair em cima do chat
    const to = new THREE.Vector3((col - (cols - 1) / 2) * 2.5 - 3 + (Math.random() - 0.5) * 0.6, -row * 2.5 + 1 + (Math.random() - 0.5) * 0.6, 0);
    const from = new THREE.Vector3(-18 - Math.random() * 3, -8 + Math.random() * 3, 0);
    const die: Die = {
      mesh, from, to,
      q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      q1: landing(face.normal),
      spin: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(1.4),
      t0: now + i * 60,
      dur: DURATION,
    };
    mesh.position.copy(from);
    scene.add(mesh);
    dice.push(die);
  });
  if (!raf) raf = requestAnimationFrame(frame);
  return new Promise((res) => setTimeout(res, DURATION + shown.length * 60));
}
