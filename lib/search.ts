import type { RageItem } from "./readPrompts";

type Filter = { q?: string; sinceHours?: number; category?: string };

export function filterPrompts(list: RageItem[], f: Filter): RageItem[] {
  let out = list.slice();

  const q = (f.q ?? "").trim().toLowerCase();
  if (q) {
    out = out.filter((p) => {
      const hay = [
        p.title,
        p.summary,
        ...(Array.isArray(p.bullets) ? p.bullets : []),
      ]
        .join(" \n ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const cat = (f.category ?? "").trim().toLowerCase();
  if (cat) {
    out = out.filter((p) => (p.category ?? "").trim().toLowerCase() === cat);
  }

  const h = f.sinceHours;
  if (typeof h === "number" && h > 0) {
    const minTs = Date.now() - h * 3600 * 1000;
    out = out.filter((p) => {
      const ts = Date.parse(p.date ?? p.fetched_at ?? "");
      return isNaN(ts) ? true : ts >= minTs;
    });
  }

  // keep newest first (already sorted by reader, but re-assert)
  out.sort((a, b) => {
    const aa = Date.parse(a.date ?? a.fetched_at ?? "") || 0;
    const bb = Date.parse(b.date ?? b.fetched_at ?? "") || 0;
    return bb - aa;
  });
  return out;
}

export function sortList(list: RageItem[], sort: string): RageItem[] {
  const out = list.slice();
  
  switch (sort) {
    case 'newest':
      return out.sort((a, b) => {
        const aa = Date.parse(a.date ?? a.fetched_at ?? "") || 0;
        const bb = Date.parse(b.date ?? b.fetched_at ?? "") || 0;
        // If timestamps are very close (within 1 hour), randomize to get variety
        if (Math.abs(aa - bb) < 3600000) {
          return Math.random() - 0.5;
        }
        return bb - aa;
      });
    case 'oldest':
      return out.sort((a, b) => {
        const aa = Date.parse(a.date ?? a.fetched_at ?? "") || 0;
        const bb = Date.parse(b.date ?? b.fetched_at ?? "") || 0;
        return aa - bb;
      });
    case 'title':
      return out.sort((a, b) => {
        const aa = (a.title ?? "").toLowerCase();
        const bb = (b.title ?? "").toLowerCase();
        return aa.localeCompare(bb, 'da');
      });
    case 'category':
      return out.sort((a, b) => {
        const aa = (a.category ?? "").toLowerCase();
        const bb = (b.category ?? "").toLowerCase();
        return aa.localeCompare(bb, 'da');
      });
    default:
      return out;
  }
}