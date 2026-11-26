/** Collision-resistant id. Falls back when crypto.randomUUID is unavailable (insecure contexts). */
export function newId(prefix = ''): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  const raw =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join('');
  return prefix ? `${prefix}_${raw}` : raw;
}
