import { mailWidgetHtml } from './mail-widget';
export const ACCREDITATION_PREVIEW_URI = 'ui://apropos/accreditation-mail-v1.html';
/** Reuse the verified mail card/host protocol; every inserted value uses textContent. */
export const accreditationWidgetHtml = mailWidgetHtml
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
