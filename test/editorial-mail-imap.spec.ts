import {beforeEach, expect, it, vi} from 'vitest';
const mock=vi.hoisted(()=>({client:null as any}));
vi.mock('imapflow',()=>({ImapFlow:class {constructor(){return mock.client;}}}));
vi.mock('@/lib/accreditation/imap/config',()=>({getMailboxSecrets:(id:string)=>({user:`${id}@aproposmagazine.com`,password:'test',host:'fixture',port:993})}));
import {archiveExactMessage,copyExistingSentMessage,inspectSentMessage,mimeHash,resolveMailFolder,canonicalMailMime} from '@/lib/editorial-mail/imap';
const mid='<exact@aproposmagazine.com>', raw=Buffer.from(`From: frederik@aproposmagazine.com\r\nTo: press@example.test\r\nSubject: Re: Fixture\r\nDate: Thu, 22 Oct 2026 08:53:00 +0200\r\nMessage-ID: ${mid}\r\nIn-Reply-To: <source@example.test>\r\nReferences: <source@example.test>\r\n\r\nExact body\r\n`);
let items:Record<string,Buffer[]>;
beforeEach(()=>{items={'Sent':[raw],'Sent Messages':[]}; let folder=''; mock.client={on:vi.fn(),connect:vi.fn(),logout:vi.fn(),close:vi.fn(),
 list:vi.fn().mockResolvedValue([{path:'Sent',name:'Sent',specialUse:'\\Sent'},{path:'Sent Messages',name:'Sent Messages'},{path:'Drafts',name:'Drafts',specialUse:'\\Drafts'}]),
 getMailboxLock:vi.fn(async(path:string)=>{folder=path;mock.client.mailbox={uidValidity:42n};return {release:vi.fn()};}),
 search:vi.fn(async()=>items[folder].map((_,i)=>i+1)),
 fetchOne:vi.fn(async(uid:number,q:any)=>q.envelope?{size:items[folder][uid-1].length,envelope:{messageId:mid}}:{source:items[folder][uid-1]}),
 append:vi.fn(async(path:string,bytes:Buffer)=>{items[path].push(bytes);return {uid:items[path].length,uidValidity:42n};})};});
it('prefers the owner mapping over specialUse; isolates Liv and refuses missing/ambiguous mappings',()=>{
 expect(resolveMailFolder('frederik','sent',[{path:'Sent',name:'Sent',specialUse:'\\Sent'},{path:'Sent Messages',name:'Sent Messages'}])).toBe('Sent Messages');
 expect(resolveMailFolder('liv','sent',[{path:'Sent',name:'Sent',specialUse:'\\Sent'},{path:'Sent Messages',name:'Sent Messages'}])).toBe('Sent Messages');
 expect(resolveMailFolder('liv','sent',[{path:'Sent',name:'Sent',specialUse:'\\Sent'},{path:'INBOX.Sent Messages',name:'Sent Messages'}])).toBe('INBOX.Sent Messages');
 expect(()=>resolveMailFolder('liv','sent',[{path:'Sent',name:'Sent',specialUse:'\\Sent'}])).toThrow('mapping_missing');
 expect(()=>resolveMailFolder('frederik','sent',[{path:'Sent',name:'Sent'}])).toThrow('mapping_missing');
 expect(resolveMailFolder('frederik','drafts',[{path:'INBOX/Drafts',name:'Drafts'}])).toBe('INBOX/Drafts');
});
it('archives exact bytes, requires readback and records APPEND receipt',async()=>{
 const r=await archiveExactMessage('frederik',raw,mid);expect(r).toMatchObject({status:'verified',folder:'Sent Messages',sha256:mimeHash(raw),uid:1,uidValidity:'42',appendReceipt:{uid:1,uidValidity:'42'},deviceVisibilityVerified:false});
 await archiveExactMessage('frederik',raw,mid);expect(mock.client.append).toHaveBeenCalledTimes(1);
 expect(mock.client.getMailboxLock).toHaveBeenCalledWith('Sent Messages',{readOnly:true});
});
it('lost APPEND acknowledgment is reconciled without second append',async()=>{
 mock.client.append.mockImplementation(async(path:string,bytes:Buffer)=>{items[path].push(bytes);throw Error('timeout');});
 expect((await archiveExactMessage('frederik',raw,mid)).status).toBe('verified');expect(mock.client.append).toHaveBeenCalledOnce();
});
it('never calls a wrong/duplicate/corrupt readback verified',async()=>{
 items['Sent Messages']=[Buffer.from('wrong')];expect((await archiveExactMessage('frederik',raw,mid)).status).toBe('unconfirmed');expect(mock.client.append).not.toHaveBeenCalled();
 items['Sent Messages']=[raw,raw];expect((await archiveExactMessage('frederik',raw,mid)).status).toBe('unconfirmed');
});
it('inspects headers and repairs by copy only, preserving original and avoiding target duplicates',async()=>{
 const e={mailbox:'frederik' as const,messageId:mid,from:'frederik@aproposmagazine.com',to:'press@example.test',subject:'Re: Fixture',body:'Exact body'};
 const before=await inspectSentMessage(e);expect(before.priorResolverFolder).toBe('Sent');expect(before.matches[0]).toMatchObject({folder:'Sent',identityMatches:true,headers:{messageId:mid,inReplyTo:'<source@example.test>',bccHeaderPresent:false}});
 const result=await copyExistingSentMessage(e,before.matches[0]);expect(result.copied).toBe(true);expect(items.Sent).toEqual([raw]);expect(items['Sent Messages']).toEqual([raw]);
 expect((await copyExistingSentMessage(e,before.matches[0])).copied).toBe(false);expect(mock.client.append).toHaveBeenCalledOnce();
});
it('refuses source changes and sanitizes connection errors',async()=>{
 const e={mailbox:'frederik' as const,messageId:mid,from:'frederik@aproposmagazine.com',to:'press@example.test',subject:'Re: Fixture',body:'Exact body'};
 await expect(copyExistingSentMessage(e,{folder:'Sent',uid:1,uidValidity:'wrong',sha256:mimeHash(raw)})).rejects.toThrow('archive_source_changed');expect(mock.client.append).not.toHaveBeenCalled();
 mock.client.connect.mockRejectedValue(Error('credential sensitive'));const r=await archiveExactMessage('frederik',raw,mid);expect(r.error).toBe('mcp_mail_imap_auth_failed');expect(JSON.stringify(r)).not.toContain('sensitive');
});
it('failed search is not empty and cannot cause another APPEND',async()=>{
 mock.client.search.mockResolvedValue(false);expect(await archiveExactMessage('frederik',raw,mid)).toMatchObject({status:'unconfirmed',error:'mcp_mail_search_unconfirmed'});expect(mock.client.append).not.toHaveBeenCalled();
});
it('canonicalizes only bare LF bytes, preserving headers, UTF8 and existing CRLF exactly',()=>{
 const input=Buffer.from('Subject: æøå\r\n\r\nOne\nTwo\r\n');const canonical=canonicalMailMime(input);
 expect(canonical).toEqual(Buffer.from('Subject: æøå\r\n\r\nOne\r\nTwo\r\n'));expect(canonicalMailMime(canonical)).toEqual(canonical);
 expect(canonicalMailMime(Buffer.from([255,10,0,13,10]))).toEqual(Buffer.from([255,13,10,0,13,10]));
});
