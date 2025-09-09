type PromptItem = {
  title: string;
  url: string;
  date?: string;
  category?: string;
  bullets: string[];
  summary: string;
  source?: string;
  fetched_at?: string;
};

export function filterPrompts(
  list: PromptItem[],
  opts: { q?: string; sinceHours?: number; category?: string },
): PromptItem[] {
  const q = (opts.q || "").toLowerCase().trim();
  const cat = (opts.category || "").toLowerCase().trim();
  const cutoff = opts.sinceHours ? Date.now() - opts.sinceHours * 3600_000 : undefined;

  let out = list.filter((p) => {
    const okQ = !q ||
      p.title.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.bullets.some((b) => b.toLowerCase().includes(q));
    const okCat = !cat || (p.category || "").toLowerCase().trim() === cat;
    const okSince = !cutoff || !p.date || !Number.isNaN(Date.parse(p.date)) ? (p.date ? Date.parse(p.date) >= cutoff : true) : true;
    return okQ && okCat && okSince;
  });

  out.sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : 0;
    const tb = b.date ? Date.parse(b.date) : 0;
    return tb - ta;
  });
  return out;
}

export function sortList(list: PromptItem[], sort: string): PromptItem[] {
  const sorted = [...list];
  
  switch (sort) {
    case 'newest':
      sorted.sort((a, b) => {
        const ta = a.date ? Date.parse(a.date) : (a.fetched_at ? Date.parse(a.fetched_at) : 0);
        const tb = b.date ? Date.parse(b.date) : (b.fetched_at ? Date.parse(b.fetched_at) : 0);
        return tb - ta;
      });
      break;
    case 'oldest':
      sorted.sort((a, b) => {
        const ta = a.date ? Date.parse(a.date) : (a.fetched_at ? Date.parse(a.fetched_at) : 0);
        const tb = b.date ? Date.parse(b.date) : (b.fetched_at ? Date.parse(b.fetched_at) : 0);
        return ta - tb;
      });
      break;
    case 'title':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'source':
      sorted.sort((a, b) => (a.source || '').localeCompare(b.source || ''));
      break;
    default:
      // Default to newest
      sorted.sort((a, b) => {
        const ta = a.date ? Date.parse(a.date) : (a.fetched_at ? Date.parse(a.fetched_at) : 0);
        const tb = b.date ? Date.parse(b.date) : (b.fetched_at ? Date.parse(b.fetched_at) : 0);
        return tb - ta;
      });
  }
  
  return sorted;
}


