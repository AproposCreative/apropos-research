import MailComposer from 'nodemailer/lib/mail-composer';
import {type ImapFlow} from 'imapflow';
import {simpleParser} from 'mailparser';
import {type MailboxId} from '@/lib/accreditation/imap/config';
import {findExactMessage,mimeHash,resolveMailFolder,withImap} from './imap';
import {mailboxAddress,mailboxName} from './mailbox';
export type DraftCopy = {folder:string;uid:number;uidValidity:string;sha256:string;messageId:string;revision:number;checkedAt:string};
/** Bounded owner diagnostics, no raw MIME/body/addresses or write operations. */
export async function inspectDraftCopy(mailbox:MailboxId,messageId:string,expected:Buffer){
  return withImap(mailbox,async client=>{
    const folder=resolveMailFolder(mailbox,'drafts',await client.list());
    const parsedExpected=await simpleParser(expected,{skipHtmlToText:true,skipTextToHtml:true});
    const shape=(raw:Buffer)=>({bytes:raw.length,crlf:(raw.toString().match(/\r\n/g)||[]).length,bareLf:(raw.toString().match(/(?<!\r)\n/g)||[]).length,endingHex:raw.subarray(-8).toString('hex')});
    const matches=[];
    for(const item of await findExactMessage(client,folder,messageId)){
      const parsed=await simpleParser(item.raw,{skipHtmlToText:true,skipTextToHtml:true});
      let firstDifference=0;while(firstDifference<expected.length&&firstDifference<item.raw.length&&expected[firstDifference]===item.raw[firstDifference])firstDifference++;
      const keys=new Set([...parsedExpected.headers.keys(),...parsed.headers.keys()]);
      matches.push({uid:item.uid,uidValidity:item.uidValidity,sha256:item.sha256,shape:shape(item.raw),firstDifference,
        textMatches:parsed.text===parsedExpected.text,htmlMatches:parsed.html===parsedExpected.html,
        changedHeaders:[...keys].filter(key=>JSON.stringify(parsed.headers.get(key))!==JSON.stringify(parsedExpected.headers.get(key))),
        exactBytes:item.raw.equals(expected)});
    }
    return {folder,expectedSha256:mimeHash(expected),expectedShape:shape(expected),matches,uidPlus:client.capabilities.has('UIDPLUS'),checkedAt:new Date().toISOString(),writes:false};
  });
}
export async function composeDraft(input:{id:string;revision:number;mailbox:MailboxId;to:string;cc:string[];bcc:string[];subject:string;body:string;html?:string;date:string;inReplyTo:string;references:string[]}) {
  const messageId=`<apropos-draft-${input.id}@aproposmagazine.com>`;
  // A private Drafts copy carries BCC so a human can continue in Apple Mail.
  // Outbound SMTP composition is separate and NEVER includes BCC headers.
  const compiled=new MailComposer({from:{name:mailboxName(input.mailbox),address:mailboxAddress(input.mailbox)},replyTo:mailboxAddress(input.mailbox),to:input.to,cc:input.cc,bcc:input.bcc,
    subject:input.subject,text:input.body,html:input.html,date:new Date(input.date),newline:'windows',messageId,inReplyTo:input.inReplyTo||undefined,references:input.references,
    disableFileAccess:true,disableUrlAccess:true}).compile();
  compiled.keepBcc=true;
  const raw=await compiled.build();
  return {messageId,raw,sha256:mimeHash(raw)};
}
async function removeExact(client:ImapFlow,copy:DraftCopy) {
  // UID EXPUNGE only. Never expunge another client's deleted mail.
  if(!client.capabilities.has('UIDPLUS'))throw Error('mcp_mail_draft_uidplus_required');
  const lock=await client.getMailboxLock(copy.folder,{readOnly:false});
  try {
    if(String(client.mailbox&&client.mailbox.uidValidity)!==copy.uidValidity)throw Error('mcp_mail_draft_conflict');
    const item=await client.fetchOne(copy.uid,{source:{maxLength:250001}},{uid:true});
    if(!item||!item.source||mimeHash(item.source)!==copy.sha256)throw Error('mcp_mail_draft_conflict');
    if(!await client.messageDelete(copy.uid,{uid:true}))throw Error('mcp_mail_draft_cleanup_unconfirmed');
  }finally{lock.release();}
}
export async function checkDraftCopy(mailbox:MailboxId,copy:DraftCopy) {
  return withImap(mailbox,async client=>{
    const found=await findExactMessage(client,copy.folder,copy.messageId);
    if(found.length!==1||found[0].uid!==copy.uid||found[0].uidValidity!==copy.uidValidity||found[0].sha256!==copy.sha256)throw Error('mcp_mail_draft_conflict');
    return {verified:true,checkedAt:new Date().toISOString()};
  });
}
/** One APPEND per durable operation. Recovery can only read back/clean its exact copies. */
export async function writeDraftCopy(mailbox:MailboxId,raw:Buffer,messageId:string,revision:number,previous:DraftCopy|null,allowAppend:boolean):Promise<DraftCopy> {
  return withImap(mailbox,async client=>{
    const folder=resolveMailFolder(mailbox,'drafts',await client.list()),sha256=mimeHash(raw);
    if(previous&&previous.folder!==folder)throw Error('mcp_mail_draft_conflict');
    let found=await findExactMessage(client,folder,messageId);
    const old=(m:typeof found[number])=>previous&&m.uid===previous.uid&&m.uidValidity===previous.uidValidity&&m.sha256===previous.sha256;
    if(found.some(m=>m.sha256!==sha256&&!old(m))||found.filter(m=>m.sha256===sha256).length>1)throw Error('mcp_mail_draft_conflict');
    if(!found.some(m=>m.sha256===sha256)) {
      if(!allowAppend)throw Error('mcp_mail_draft_sync_unconfirmed');
      if(previous&&(found.length!==1||!old(found[0])))throw Error('mcp_mail_draft_conflict');
      if(!previous&&found.length)throw Error('mcp_mail_draft_conflict');
      if(previous&&!client.capabilities.has('UIDPLUS'))throw Error('mcp_mail_draft_uidplus_required');
      try{await client.append(folder,raw,['\\Draft'],new Date());}catch{/* Read back a lost acknowledgment; do not repeat APPEND. */}
      found=await findExactMessage(client,folder,messageId);
    }
    const current=found.filter(m=>m.sha256===sha256);
    if(current.length!==1||found.some(m=>m.sha256!==sha256&&!old(m)))throw Error('mcp_mail_draft_sync_unconfirmed');
    if(previous&&found.some(m=>old(m)&&m.uid!==current[0].uid))await removeExact(client,previous);
    const verified=await findExactMessage(client,folder,messageId);
    if(verified.length!==1||verified[0].sha256!==sha256)throw Error('mcp_mail_draft_sync_unconfirmed');
    return {folder,uid:verified[0].uid,uidValidity:verified[0].uidValidity,sha256,messageId,revision,checkedAt:new Date().toISOString()};
  });
}
export async function cleanupSentDraft(mailbox:MailboxId,copy:DraftCopy) {
  return withImap(mailbox,async client=>{
    const found=await findExactMessage(client,copy.folder,copy.messageId);
    if(!found.length)return {status:'removed' as const,checkedAt:new Date().toISOString()};
    if(found.length!==1||found[0].uid!==copy.uid||found[0].sha256!==copy.sha256||found[0].uidValidity!==copy.uidValidity)throw Error('mcp_mail_draft_conflict');
    await removeExact(client,copy);
    if((await findExactMessage(client,copy.folder,copy.messageId)).length)throw Error('mcp_mail_draft_cleanup_unconfirmed');
    return {status:'removed' as const,checkedAt:new Date().toISOString()};
  });
}
