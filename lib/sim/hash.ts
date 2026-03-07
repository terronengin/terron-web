export function hashToUnitFloat(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

export function normalish(seed: string): number {
  const u1 = hashToUnitFloat(seed + "|1");
  const u2 = hashToUnitFloat(seed + "|2");
  const u3 = hashToUnitFloat(seed + "|3");
  const s = u1 + u2 + u3;
  return (s - 1.5) / 0.5;
}