/** Serializable transactions with rollback and Firestore's reads-before-writes rule. */
export function memoryFirestore() {
  const rows = new Map<string, any>(); let tail = Promise.resolve<unknown>(undefined);
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: rows.has(path), ref: doc(path), data: () => structuredClone(rows.get(path)) });
  function doc(path: string): any {
    return { path, id: path.split('/').at(-1), collection: (name: string) => query(`${path}/${name}`), get: async () => snapshot(path),
      create: async (data: unknown) => { if (rows.has(path)) throw Error('exists'); rows.set(path, structuredClone(data)); },
      set: async (data: unknown) => { rows.set(path, structuredClone(data)); },
      update: async (data: object) => { if (!rows.has(path)) throw Error('missing'); rows.set(path, { ...rows.get(path), ...structuredClone(data) }); },
      delete: async () => { rows.delete(path); } };
  }
  function query(path: string, filters: Array<[string, unknown]> = [], order?: [string, string], limit = Infinity, after?: string | number, end?: string | number): any {
    return { doc: (id: string) => doc(`${path}/${id}`), where: (field: string, _op: string, value: unknown) => query(path, [...filters, [field, value]], order, limit, after, end),
      orderBy: (key: string, dir = 'asc') => query(path, filters, [key, dir], limit, after, end), limit: (n: number) => query(path, filters, order, n, after, end),
      startAfter: (value: string | number) => query(path, filters, order, limit, value, end), endAt: (value: string | number) => query(path, filters, order, limit, after, value),
      get: async () => {
        const paths = [...rows.keys()].filter(p => p.startsWith(`${path}/`) && p.slice(path.length + 1).indexOf('/') < 0 && filters.every(([k, v]) => rows.get(p)?.[k] === v)
          && (after === undefined || (order && rows.get(p)[order[0]] > after)) && (end === undefined || (order && rows.get(p)[order[0]] <= end)));
        if (order) paths.sort((a, b) => {
          const x = rows.get(a)[order[0]], y = rows.get(b)[order[0]];
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * (order[1] === 'desc' ? -1 : 1);
        });
        const docs = paths.slice(0, limit).map(snapshot); return { docs, empty: !docs.length, size: docs.length };
      } };
  }
  function writer() {
    const writes: (() => void)[] = [];
    return { writes, get: async (ref: any) => { if (writes.length) throw Error('read_after_write'); return ref.path ? snapshot(ref.path) : ref.get(); },
      set: (ref: any, data: any) => writes.push(() => rows.set(ref.path, structuredClone(data))),
      update: (ref: any, data: any) => { if (!rows.has(ref.path)) throw Error('missing'); writes.push(() => rows.set(ref.path, { ...rows.get(ref.path), ...structuredClone(data) })); },
      create: (ref: any, data: any) => { if (rows.has(ref.path)) throw Error('exists'); writes.push(() => rows.set(ref.path, structuredClone(data))); },
      delete: (ref: any) => writes.push(() => rows.delete(ref.path)),
      commit: async () => { writes.forEach(fn => fn()); } };
  }
  const db = { collection: query, batch: writer, runTransaction: (fn: any) => {
    const result = tail.then(async () => { const tx = writer(); const result = await fn(tx); await tx.commit(); return result; });
    tail = result.catch(() => undefined); return result;
  } };
  return { rows, db, clear: () => { rows.clear(); tail = Promise.resolve(); } };
}
