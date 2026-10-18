// Utilitários sem dependência de ambiente (Node ou navegador).

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newId(len = 12): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

export const ID_RE = /^[a-z0-9_-]{1,40}$/i;

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

/** Aplica um patch com chaves "a.b.c" (cria objetos intermediários; null remove). Retorna false se a chave for inválida. */
export function applyPatch(target: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split(".");
    if (parts.some((p) => p === "" || FORBIDDEN.has(p))) return false;
    let obj = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = obj[parts[i]];
      if (typeof next !== "object" || next === null || Array.isArray(next)) obj[parts[i]] = {};
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (value === undefined || value === null) delete obj[last]; // null no patch = remover campo
    else obj[last] = value;
  }
  return true;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ─── Névoa: bitset base64 (1 = revelado) ─────────────────────────────────────

export function fogDecode(b64: string, cells: number): Uint8Array {
  const out = new Uint8Array(cells);
  if (!b64) return out;
  const bin = atob(b64);
  for (let i = 0; i < cells; i++) {
    const byte = bin.charCodeAt(i >> 3);
    if (byte & (1 << (i & 7))) out[i] = 1;
  }
  return out;
}

export function fogEncode(cells: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(cells.length / 8));
  for (let i = 0; i < cells.length; i++) if (cells[i]) bytes[i >> 3] |= 1 << (i & 7);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
