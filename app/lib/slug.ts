export async function slugify(name: string, taken: (s: string) => Promise<boolean>): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "squad";
  let s = base;
  for (let n = 2; await taken(s); n++) s = `${base}-${n}`;
  return s;
}
