"use client";
import Link from "next/link";

export function Toolbar({
  categories,
  initial,
}: {
  categories: string[];
  initial: { q?: string; cat?: string; since?: string };
}) {
  const qs = (q?: string, cat?: string, since?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    if (since) params.set("since", since);
    const s = params.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="sticky top-[48px] z-10 bg-offwhite/80 backdrop-blur border-b border-border py-3">
      <div className="container mx-auto flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="q">Søg</label>
        <input
          id="q"
          defaultValue={initial.q || ""}
          placeholder="Søg…"
          onChange={(e) => (window.location.href = qs(e.target.value, initial.cat, initial.since))}
          className="rounded-full border border-border px-3 py-2 text-sm focus:outline-none focus-visible:ring"
        />
        <label className="sr-only" htmlFor="cat">Kategori</label>
        <select
          id="cat"
          defaultValue={initial.cat || ""}
          onChange={(e) => (window.location.href = qs(initial.q, e.target.value, initial.since))}
          className="rounded-full border border-border px-3 py-2 text-sm focus:outline-none focus-visible:ring"
        >
          <option value="">Alle kategorier</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="since">Tidsrum</label>
        <select
          id="since"
          defaultValue={initial.since || ""}
          onChange={(e) => (window.location.href = qs(initial.q, initial.cat, e.target.value))}
          className="rounded-full border border-border px-3 py-2 text-sm focus:outline-none focus-visible:ring"
        >
          <option value="">Alle tider</option>
          <option value="24">Seneste 24 timer</option>
          <option value="48">Seneste 48 timer</option>
          <option value="72">Seneste 72 timer</option>
        </select>
        <Link href="/" className="rounded-full border border-border px-3 py-2 text-sm text-gray-500" title="Nulstil">
          Nulstil
        </Link>
      </div>
    </div>
  );
}


