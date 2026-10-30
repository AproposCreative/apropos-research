export function memoryFirestore() {
  const rows = new Map<string, any>(); let tail = Promise.resolve();
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: rows.has(path), data: () => rows.has(path) ? structuredClone(rows.get(path)) : undefined });
  const ref = (path: string) => ({ path, get: async () => snapshot(path), set: async (data: any) => { rows.set(path, structuredClone(data)); } });
  const query = (name: string, filters: Array<[string,string,any]> = [], order?: [string,string], limit = Infinity): any => ({
    doc: (id: string) => ref(name+'/'+id), where: (key: string, op: string, value: any) => query(name, [...filters,[key,op,value]], order,limit),
    orderBy: (key: string, direction: string) => query(name,filters,[key,direction],limit), limit: (count: number) => query(name,filters,order,count),
    get: async () => {
      let all = [...rows].filter(([path,row]) => path.startsWith(name+'/') && filters.every(([key,op,value]) => op === '>=' ? row[key] >= value : op === '<=' ? row[key] <= value : row[key] === value));
      if (order) all.sort((a,b) => String(a[1][order[0]]).localeCompare(String(b[1][order[0]])) * (order[1] === 'desc' ? -1 : 1));
      all = all.slice(0,limit); return { docs: all.map(([path]) => snapshot(path)), size: all.length };
    },
  });
  const db = { collection: query, runTransaction: (work: (tx: any) => Promise<any>) => {
    const next = tail.then(async () => {
      const writes: Array<() => void> = [];
      const value = await work({ get: async (r: any) => snapshot(r.path),
        set: (r: any,value: any) => writes.push(() => rows.set(r.path,structuredClone(value))),
        create: (r: any,value: any) => writes.push(() => { if(rows.has(r.path))throw Error('duplicate'); rows.set(r.path,structuredClone(value)); }),
      }); writes.forEach(write=>write()); return value;
    }); tail=next.catch(()=>{});return next;
  } };
  return { db, rows };
}
