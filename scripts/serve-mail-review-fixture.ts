/** Local, inert UI fixture. No authentication, external mail or SMTP implementation. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { mailWidgetHtml } from '../lib/mcp/mail-widget';

// Inline only trusted source; never production mail, tokens or credentials.
const widget = JSON.stringify(mailWidgetHtml).replace(/</g, '\\u003c');
const bridge = ts.transpileModule(await readFile(new URL('../lib/editorial-mail/review-bridge.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('export function', 'function');
const data = { draftId: 'a'.repeat(64), contentHash: 'b'.repeat(64), revision: 2, status: 'draft', fromName: 'Frederik Kragh',
  from: 'frederik@aproposmagazine.com', to: 'fixture@example.test', cc: [], bcc: [], subject: 'Isoleret test af privat mailpreview',
  body: 'Kun testdata. Denne side kan ikke sende mails.', bodyText: 'Kun testdata. Denne side kan ikke sende mails.',
  signature: { html: '<p>Venlig hilsen / Best regards</p><p><b>Frederik Emil Kragh</b><br>Editor-in-chief<br>+45 31 10 31 17<br>Aproposmagazine.com / Apropos Editions</p><img src="https://ai.aproposmagazine.com/images/apropos-newsletter-logo.png" width="160" alt="Apropos Magazine">' },
  source: { kind: 'compose' }, updatedAt: new Date().toISOString() };
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inert mail review fixture</title><style>body{margin:0;background:#000;color:#fff;font-family:Arial}header{padding:16px}iframe{width:100%;border:0;height:1000px}main{max-width:700px;margin:auto}</style><main><header>Isoleret test. Ingen rigtig afsendelse.</header><p id="error"></p><iframe title="Mailpreview" sandbox="allow-scripts"></iframe></main><script>
const frame=document.querySelector('iframe');window.calls=[];window.reply=${JSON.stringify(data).replace(/</g, '\\u003c')};
${bridge}
mountMailReviewBridge({frame,draftId:reply.draftId,onError:m=>document.getElementById('error').textContent=m,call:async(name,input)=>{
 calls.push({name});document.title='Fixture: '+calls.map(c=>c.name).join(',');
 if(name==='confirm_editorial_reply'){reply.status='accepted';reply.approvedAt=new Date().toISOString();reply.receipt={acceptedBySmtp:true,acceptedAt:reply.approvedAt,sentFolderSync:{status:'verified',folder:'INBOX.Sent Messages'},recipientDeliveryVerified:false};}
 return {structuredContent:reply,_meta:{confirmation:reply.status==='draft'?{token:'fixture-only-not-valid',expiresAt:Date.now()+600000}:null}};
}});frame.srcdoc=${widget};</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
server.listen(43127, '127.0.0.1', () => console.log('Inert mail fixture: http://127.0.0.1:43127'));
