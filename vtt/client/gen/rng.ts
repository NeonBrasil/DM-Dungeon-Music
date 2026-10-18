// Gerador pseudoaleatório com semente (mesma semente → mesmo mapa).

function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng {
  private s: number;
  constructor(seed: string | number) {
    this.s = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  }
  /** [0, 1) — mulberry32 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1): number {
    return a + (b - a) * this.next();
  }
  /** inteiro em [a, b] */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) {
      r -= w;
      if (r <= 0) return v;
    }
    return items[items.length - 1][0];
  }
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  /** aproximação normal (soma de 3 uniformes), média 0 */
  normal(): number {
    return (this.next() + this.next() + this.next() - 1.5) / 1.5;
  }
  /** sub-gerador independente (para partes do mapa não mudarem em cascata) */
  fork(tag: string): Rng {
    return new Rng(`${Math.floor(this.next() * 1e9)}:${tag}`);
  }
}

export function randomSeed(): string {
  const words = ["corvo", "brasa", "runa", "lobo", "elmo", "névoa", "cripta", "trovão", "serpe", "ônix", "musgo", "ferro", "orvalho", "cinza", "âmbar"];
  const a = words[Math.floor(Math.random() * words.length)];
  return `${a}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
