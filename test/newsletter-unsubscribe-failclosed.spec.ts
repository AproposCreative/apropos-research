import { expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({db:null as any}));
vi.mock('@/lib/firebase-admin',()=>({getAdminDb:()=>m.db}));
import {filterUnsubscribedFromList} from '@/lib/newsletter/unsubscribe-store';
it('does not treat unavailable suppression storage as an empty suppression list',async()=>{
 m.db=null;await expect(filterUnsubscribedFromList(['person@example.test'])).rejects.toThrow('unavailable');
 m.db={collection:()=>({doc:()=>({})}),getAll:async()=>{throw Error('offline');}};
 await expect(filterUnsubscribedFromList(['person@example.test'])).rejects.toThrow('check_failed');
 expect(await filterUnsubscribedFromList([])).toEqual(new Set());
});
