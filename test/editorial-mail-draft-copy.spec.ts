import {beforeEach,expect,it,vi} from 'vitest';
import {simpleParser} from 'mailparser';
const mock=vi.hoisted(()=>({client:null as any}));
vi.mock('imapflow',()=>({ImapFlow:class {constructor(){return mock.client;}}}));
vi.mock('@/lib/accreditation/imap/config',()=>({getMailboxSecrets:(id:string)=>({user:`${id}@aproposmagazine.com`,password:'test',host:'fixture',port:993})}));
import {composeDraft,writeDraftCopy,checkDraftCopy,cleanupSentDraft,inspectDraftCopy} from '@/lib/editorial-mail/draft-copy';
import {mimeHash} from '@/lib/editorial-mail/imap';
const mid='<draft@aproposmagazine.com>',raw=Buffer.from('Draft one'),raw2=Buffer.from('Draft two');
let rows:Map<number,Buffer>,lastUid:number;
beforeEach(()=>{rows=new Map();lastUid=0;mock.client={on:vi.fn(),connect:vi.fn(),logout:vi.fn(),close:vi.fn(),capabilities:new Set(['UIDPLUS']),mailbox:{uidValidity:44n},
 list:vi.fn().mockResolvedValue([{path:'INBOX.Drafts',name:'Drafts',specialUse:'\\Drafts'}]),getMailboxLock:vi.fn().mockResolvedValue({release:vi.fn()}),search:vi.fn(async()=>[...rows.keys()]),
 fetchOne:vi.fn(async(uid:number,q:any)=>!rows.has(uid)?false:q.envelope?{size:rows.get(uid)!.length,envelope:{messageId:mid}}:{source:rows.get(uid)}),
 append:vi.fn(async(_:string,b:Buffer)=>{rows.set(++lastUid,b);return {uid:lastUid,uidValidity:44n};}),messageDelete:vi.fn(async(uid:number)=>rows.delete(uid))};});
it('keeps private BCC in a draft and includes correct signature/header structure',async()=>{
 const d=await composeDraft({id:'a'.repeat(64),revision:1,mailbox:'frederik',to:'own@example.test',cc:[],bcc:['private@example.test'],subject:'Draft',body:'Text',html:'<p>Text</p>',date:'2026-10-22T07:00:00Z',inReplyTo:'<source@example.test>',references:[]});
 const p=await simpleParser(d.raw);expect(p.bcc&&!Array.isArray(p.bcc)&&p.bcc.value[0].address).toBe('private@example.test');expect(p.messageId).toBe(d.messageId);expect(p.text?.trim()).toBe('Text');
});
it('writes a single version, updates only its verified predecessor and removes sent draft',async()=>{
 const a=await writeDraftCopy('frederik',raw,mid,1,null,true);expect(a).toMatchObject({folder:'INBOX.Drafts',uid:1,uidValidity:'44',sha256:mimeHash(raw),revision:1});
 await checkDraftCopy('frederik',a);const b=await writeDraftCopy('frederik',raw2,mid,2,a,true);expect(rows.size).toBe(1);expect(rows.get(b.uid)).toEqual(raw2);expect(mock.client.messageDelete).toHaveBeenCalledWith(1,{uid:true});
 expect((await cleanupSentDraft('frederik',b)).status).toBe('removed');expect(rows.size).toBe(0);
});
it('external body/UID/UIDVALIDITY change blocks export and send checks, never overwrites',async()=>{
 const a=await writeDraftCopy('frederik',raw,mid,1,null,true);rows.set(1,Buffer.from('External edit'));
 await expect(checkDraftCopy('frederik',a)).rejects.toThrow('draft_conflict');await expect(writeDraftCopy('frederik',raw2,mid,2,a,true)).rejects.toThrow('draft_conflict');await expect(cleanupSentDraft('frederik',a)).rejects.toThrow('draft_conflict');expect(mock.client.append).toHaveBeenCalledTimes(1);expect(mock.client.messageDelete).not.toHaveBeenCalled();
});
it('missing external draft is not silently recreated and recovery never appends',async()=>{
 const a=await writeDraftCopy('frederik',raw,mid,1,null,true);rows.clear();await expect(writeDraftCopy('frederik',raw2,mid,2,a,true)).rejects.toThrow('draft_conflict');
 await expect(writeDraftCopy('frederik',raw,mid,1,null,false)).rejects.toThrow('sync_unconfirmed');expect(mock.client.append).toHaveBeenCalledOnce();
});
it('handles lost APPEND ack and lost durable receipt without duplicate',async()=>{
 mock.client.append.mockImplementation(async(_:string,b:Buffer)=>{rows.set(++lastUid,b);throw Error('timeout');});
 const a=await writeDraftCopy('frederik',raw,mid,1,null,true);const recovered=await writeDraftCopy('frederik',raw,mid,1,null,false);expect(recovered.uid).toBe(a.uid);expect(mock.client.append).toHaveBeenCalledOnce();
});
it('does not perform unscoped EXPUNGE when UIDPLUS is absent',async()=>{
 const a=await writeDraftCopy('frederik',raw,mid,1,null,true);mock.client.capabilities.clear();await expect(writeDraftCopy('frederik',raw2,mid,2,a,true)).rejects.toThrow('uidplus_required');await expect(cleanupSentDraft('frederik',a)).rejects.toThrow('uidplus_required');expect(mock.client.messageDelete).not.toHaveBeenCalled();expect(rows.size).toBe(1);
});
it('diagnoses changed MIME without exposing content or writing a draft',async()=>{
 const expected=Buffer.from('Message-ID: '+mid+'\r\nSubject: private title\r\n\r\nPrivate body\r\n');
 rows.set(1,Buffer.concat([Buffer.from('X-Test: changed\r\n'),expected]));
 const report=await inspectDraftCopy('frederik',mid,expected);
 expect(report.matches[0]).toMatchObject({exactBytes:false,textMatches:true,changedHeaders:['x-test']});
 expect(JSON.stringify(report)).not.toContain('Private body');expect(JSON.stringify(report)).not.toContain('private title');
 expect(mock.client.append).not.toHaveBeenCalled();expect(mock.client.messageDelete).not.toHaveBeenCalled();
});
