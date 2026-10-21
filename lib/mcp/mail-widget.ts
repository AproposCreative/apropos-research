export const MAIL_PREVIEW_URI = 'ui://apropos/mail-reply-v1.html';
/** No remote images, links, tracking pixels, HTML mail or model-visible approval tokens. */
export const mailWidgetHtml = String.raw`<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apropos · Mailsvar</title>
<style>
:root{color-scheme:light dark;font-family:Arial,Helvetica,sans-serif;color:light-dark(#080808,#f5f5f5);background:light-dark(#fff,#151515)}*{box-sizing:border-box}body{margin:0}main{max-width:780px;margin:auto;padding:24px}h1{font-size:28px;letter-spacing:-.8px;line-height:1.15;margin:6px 0 24px}h2{font-size:21px;line-height:1.3;margin:0 0 20px;overflow-wrap:anywhere}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:1.3px}.muted{color:light-dark(#565656,#b8b8b8);font-size:14px;line-height:1.5}dl{display:grid;grid-template-columns:52px 1fr;gap:8px;margin:0 0 20px;font-size:14px;line-height:1.5}dt{color:light-dark(#565656,#b8b8b8)}dd{margin:0;overflow-wrap:anywhere}.message{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.65;border-top:1px solid light-dark(#ddd,#444);padding-top:24px}details{margin-top:24px;border-top:1px solid light-dark(#ddd,#444)}summary{min-height:44px;cursor:pointer;padding:14px 0}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}button{font:inherit;min-height:46px;padding:12px 18px;border-radius:6px;border:1px solid light-dark(#777,#888);background:transparent;color:inherit;cursor:pointer}button.primary{background:light-dark(#080808,#f5f5f5);color:light-dark(#fff,#080808);border:0}button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible{outline:2px solid #4169e1;outline-offset:3px}#status,#warning{line-height:1.5}#warning:empty{display:none}#source{font-size:14px}.hidden{display:none}@media(max-width:440px){main{padding:16px}h1{font-size:25px}.actions button{flex:1}}
</style></head><body><main>
<p class="eyebrow">Apropos · Mail</p><h1 id="title">Dit svar, klar til gennemlæsning</h1><p id="status" role="status" aria-live="polite">Henter det gemte svar …</p>
<section id="reply" class="hidden" aria-label="Det præcise svar"><dl><dt>Fra</dt><dd id="from"></dd><dt>Til</dt><dd id="to"></dd></dl><h2 id="subject"></h2><p id="warning"></p><div id="body" class="message"></div>
<p class="muted">Ingen cc eller vedhæftninger. Kun teksten ovenfor bliver sendt. Skriv ændringer i chatten, så får du et nyt udkast.</p>
<div class="actions"><button id="send" class="primary" disabled>Godkend og send</button><button id="refresh">Opdatér status</button></div>
<details><summary>Se den oprindelige mail</summary><p id="sourceFrom" class="muted"></p><div id="source" class="message"></div></details></section>
</main><script>
let data=null,confirmation=null,busy=false,ready=false,serial=0,attempted=false,viewTime=0;const pending=new Map(),el=id=>document.getElementById(id);
function request(method,params){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Forbindelsen blev afbrudt. Opdatér status; svaret må ikke sendes igen automatisk.'));},90000);pending.set(id,{resolve,reject,timer});parent.postMessage({jsonrpc:'2.0',id,method,params},'*');});}
async function call(name,args){const r=ready?await request('tools/call',{name,arguments:args}):window.openai?.callTool?await window.openai.callTool(name,args):await request('tools/call',{name,arguments:args});if(r?.isError)throw Error('Handlingen kunne ikke bekræftes. Opdatér status og gennemse den seneste version.');return r;}
function unpack(r){return r?.structuredContent||JSON.parse(r?.content?.find(c=>c.type==='text')?.text||'null');}
function receive(result){const next=unpack(result);if(!next?.draftId||!next?.contentHash||typeof next.body!=='string')return;
if(data&&next.draftId!==data.draftId)return;
const stamp=Date.parse(next.previewReadAt||next.updatedAt)||0;
if(data&&(next.revision<data.revision||(next.revision===data.revision&&(stamp<viewTime||(data.status!=='draft'&&next.status==='draft')))))return;
if(data&&next.revision>data.revision)attempted=false;
data=next;viewTime=stamp;confirmation=result._meta?.confirmation||null;render();}
function render(){el('reply').classList.remove('hidden');el('from').textContent=data.fromName+' <'+data.from+'>';el('to').textContent=data.to;el('subject').textContent=data.subject;el('body').textContent=data.body;
el('sourceFrom').textContent=(data.source?.fromName||'')+' <'+(data.source?.from||'')+'> · '+(data.source?.receivedAt||'');el('source').textContent=data.source?.body||'';
el('warning').textContent=data.source?.replyToDiffers?'Bemærk: Mailens Reply-To er '+data.to+', som er forskellig fra afsenderadressen.':'';
const status={draft:'Ikke sendt. Læs hele svaret, før du godkender.',sending:'Afsendelsen er registreret og afventer kvittering. Opdatér status; send ikke igen.',unconfirmed:'Afsendelsen kunne ikke bekræftes. Mailserveren kan have modtaget svaret. Send ikke igen; kontrollér Sendt og kvitteringen.',accepted:'Mailserveren har accepteret svaret. Modtagerens levering er ikke bekræftet.'};
el('status').textContent=status[data.status]||'Ukendt status. Send ikke igen.';
if(data.status==='accepted'&&data.receipt)el('status').textContent+=' '+(data.receipt.sentCopyArchived?'Kopi gemt i Sendt.':'Kopien i Sendt kunne ikke bekræftes.');
if(data.blocker)el('status').textContent+=' Afsendelse er ikke klar på denne forbindelse. Udkastet er bevaret.';
if(data.status==='draft'&&!confirmation)el('status').textContent+=' Opdatér status for at få en ny godkendelsesknap.';
el('title').textContent=data.status==='accepted'?'Dit svar er afsendt':'Dit svar, klar til gennemlæsning';buttons();}
function buttons(){el('send').disabled=busy||attempted||data?.status!=='draft'||!confirmation||confirmation.expiresAt<=Date.now()||!!data?.blocker;el('refresh').disabled=busy;}
async function refresh(){if(!data)return;receive(await call('preview_editorial_reply',{draftId:data.draftId}));if(data.status==='draft'&&confirmation)attempted=false;buttons();}
el('send').onclick=async()=>{if(el('send').disabled)return;const shown={token:confirmation.token,displayedHash:data.contentHash};attempted=true;busy=true;confirmation=null;buttons();el('status').textContent='Sender det godkendte svar …';try{receive(await call('confirm_editorial_reply',shown));}catch(e){el('status').textContent=e.message||'Afsendelsen er ubekræftet. Opdatér status; send ikke igen.';}finally{busy=false;buttons();}};
el('refresh').onclick=async()=>{if(busy)return;busy=true;buttons();try{await refresh();}catch(e){el('status').textContent=e.message||'Status kunne ikke hentes.';}finally{busy=false;buttons();}};
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.jsonrpc!=='2.0')return;const m=event.data;if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='ui/notifications/tool-result')receive(m.params);});
request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'Apropos mailsvar',version:'1.0.0'},appCapabilities:{}}).then(()=>{ready=true;parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');}).catch(()=>{});
function compatibility(){if(window.openai?.toolOutput)receive({structuredContent:window.openai.toolOutput,_meta:window.openai.toolResponseMetadata});}compatibility();window.addEventListener('openai:set_globals',compatibility);
setInterval(buttons,1000);let lastHeight=0;new ResizeObserver(()=>{const height=Math.ceil(document.documentElement.scrollHeight);if(height===lastHeight)return;lastHeight=height;if(ready)parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height}},'*');}).observe(document.body);
</script></body></html>`;
