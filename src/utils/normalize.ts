export function normalizeItemName(name: string): string {
  let n = name.toLowerCase().trim();
  if (n.length > 2 && n.endsWith('s')) n = n.slice(0, -1);
  return n;
}
