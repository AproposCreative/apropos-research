import { mailWidgetHtml } from './legacy-mail-widget';
export const ACCREDITATION_PREVIEW_URI = 'ui://apropos/accreditation-mail-v1.html';
/** Reuse the verified mail card/host protocol; every inserted value uses textContent. */
export const accreditationWidgetHtml = mailWidgetHtml
  // Cached and current hosts may wrap both the visible result and its private
  // confirmation metadata. Unwrap the same envelope for both, never mix them.
  .replace(
    "async function call(name,args){const r=ready?await request('tools/call',{name,arguments:args}):window.openai?.callTool?await window.openai.callTool(name,args):await request('tools/call',{name,arguments:args});if(r?.isError)throw Error('Handlingen kunne ikke bekræftes. Opdatér status og gennemse den seneste version.');return r;}",
    "async function call(name,args){const r=canonicalResult(ready?await request('tools/call',{name,arguments:args}):window.openai?.callTool?await window.openai.callTool(name,args):await request('tools/call',{name,arguments:args}));if(r?.isError)throw Error('Handlingen kunne ikke bekræftes. Opdatér status og gennemse den seneste version.');return r;}"
  )
  .replace(
    "function unpack(r){return r?.structuredContent||JSON.parse(r?.content?.find(c=>c.type==='text')?.text||'null');}",
    "function canonicalResult(value){if(!value||typeof value!=='object')return null;for(const key of ['mcp_tool_result','call_tool_result']){const nested=value[key];if(nested&&typeof nested==='object'&&(nested.structuredContent||Array.isArray(nested.content)))return nested;}return value;}function unpack(value){const r=canonicalResult(value);if(r?.isError)return null;if(r?.structuredContent)return r.structuredContent;try{return JSON.parse(r?.content?.find(c=>c.type==='text')?.text||'null');}catch{return null;}}"
  )
  .replace('function receive(result){const next=unpack(result);', 'function receive(value){const result=canonicalResult(value),next=unpack(result);')
  .replace(
    "function compatibility(){if(window.openai?.toolOutput)receive({structuredContent:window.openai.toolOutput,_meta:window.openai.toolResponseMetadata});}compatibility();window.addEventListener('openai:set_globals',compatibility);",
    "function compatibility(event){const globals=event?.detail?.globals||{},output=globals.toolOutput??window.openai?.toolOutput,metadata=globals.toolResponseMetadata??window.openai?.toolResponseMetadata;const result=canonicalResult(metadata);if(result?.structuredContent||Array.isArray(result?.content))receive(result);else if(output)receive({structuredContent:output,_meta:metadata});reportHeight(true);}compatibility();window.addEventListener('openai:set_globals',compatibility);"
  )
  .replace(
    "setInterval(buttons,1000);let lastHeight=0;new ResizeObserver(()=>{const height=Math.ceil(document.documentElement.scrollHeight);if(height===lastHeight)return;lastHeight=height;if(ready)parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height}},'*');}).observe(document.body);",
    "function reportHeight(force=false){const height=Math.ceil(document.documentElement.scrollHeight);if(!force&&height===lastHeight)return;if(ready){lastHeight=height;parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height}},'*');}else if(typeof window.openai?.notifyIntrinsicHeight==='function'){lastHeight=height;window.openai.notifyIntrinsicHeight(height);}}setInterval(buttons,1000);let lastHeight=0;new ResizeObserver(()=>reportHeight()).observe(document.body);"
  )
  .replace(".then(()=>{ready=true;parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');}).catch(()=>{});",
    ".then(()=>{ready=true;parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');reportHeight(true);}).catch(()=>{if(!data)el('status').textContent='Mailkortet kunne ikke indlæses. Opdatér Apropos-forbindelsen og åbn previewet igen.';});")
  .replaceAll('preview_editorial_reply', 'preview_accreditation_draft')
  .replaceAll('confirm_editorial_reply', 'confirm_accreditation_draft')
  .replaceAll('{draftId:data.draftId}', '{approvalId:data.draftId}')
  .replaceAll('Apropos · Mail', 'Apropos · Akkreditering')
  .replaceAll('Dit svar', 'Din akkrediteringsmail')
  .replace("data.fromName+' <'+data.from+'>'", "data.from.includes('<')?data.from:data.fromName+' <'+data.from+'>'")
  .replace('Ingen cc eller vedhæftninger. Kun teksten ovenfor bliver sendt.', 'Ingen cc. Kun den viste tekst og de viste, valgte billetfiler bliver sendt.')
  .replace('<p id="warning"></p>', '<p id="warning"></p><p id="event" class="muted"></p><p id="assets" class="muted"></p>')
  .replace("el('sourceFrom').textContent=", "el('event').textContent=[data.event?.artist,data.event?.venue,data.event?.date,'Antal: '+(data.event?.ticketQuantity||'?'),data.event?.accessRequested,(data.event?.applicants||[]).map(a=>a.name).join(', '),data.event?.promisedCoverage?'Lovet dækning: '+data.event.promisedCoverage:'Ingen yderligere dækning lovet'].filter(Boolean).join(' · ');el('assets').textContent='Valgte bilag: '+((data.attachments||[]).map(a=>a.filename||a.url||a.text||a.kind).join(' · ')||'Ingen');el('source').parentElement.hidden=true;el('sourceFrom').textContent=")
  .replace("if(data.blocker)el('status').textContent+=", "if(data.syncWarning)el('status').textContent+=' '+data.syncWarning;if(data.blocker)el('status').textContent+=' ('+data.blocker+')';if(data.blocker)el('status').textContent+=");
