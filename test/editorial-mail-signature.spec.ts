import {expect,it,vi} from 'vitest';
import MailComposer from 'nodemailer/lib/mail-composer';
import {simpleParser} from 'mailparser';
vi.mock('@/lib/liv-inbox/settings-store',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/lib/liv-inbox/settings-store')>();
 return {...actual,getLivInboxSettings:async()=>({signature:actual.LIV_HOUSE_SIGNATURE})};
});
import {currentSignature,applySignature,FREDERIK_SIGNATURE,SIGNATURE_LOGO,LIV_SIGNATURE_LOGO} from '@/lib/editorial-mail/signature';
import {LIV_HOUSE_SIGNATURE,LEGACY_SHORT_LIV_SIGNATURE,LEGACY_LONG_LIV_SIGNATURE,PREVIOUS_LIV_HOUSE_SIGNATURE} from '@/lib/liv-inbox/settings-store';
it('uses the original logo, official details and accessible links; account-specific signatures',async()=>{
 const s=await currentSignature('frederik');expect(s.text).toBe(FREDERIK_SIGNATURE);expect(s.html).toContain(SIGNATURE_LOGO);expect(s.html).toContain('tel:+4531103117');expect(s.html).toContain('tel:+4593937776');expect(s.text).toContain('Redaktion: +45 93 93 77 76');expect(s.html).toContain('https://aproposmagazine.com');expect(s.html).toContain('max-width:100%');
 expect(s.text).toContain('Frederik Kragh');expect(s.html).not.toContain('Frederik Emil Kragh');
 const liv=await currentSignature('liv');expect(liv.text).toBe(LIV_HOUSE_SIGNATURE);expect(liv.html).toContain(LIV_SIGNATURE_LOGO);expect(liv.html).toContain('Skribent og kulturjournalist');expect(liv.html).toContain('tel:+4593937776');expect(liv.text).toContain('+45 93 93 77 76');
 expect(liv.html).toContain('font-family:Arial,Helvetica,sans-serif');expect(liv.html).not.toContain('Georgia');
});
it('keeps body and both signatures on the mail client canvas in light and dark mode',async()=>{
 for(const mailbox of ['frederik','liv'] as const){
  const content=applySignature('Hej,\n\nTak for din mail.',await currentSignature(mailbox));
  expect(content.html).not.toMatch(/(?:background(?:-color)?|color):\s*#[0-9a-f]{3,8}/i);
  expect(content.html).toContain('white-space:pre-wrap');
  expect(content.html).toContain('Tak for din mail.');
  expect(content.html).toContain(mailbox==='frederik'?'Frederik Kragh':'Liv Brandt');
 }
});
it('escapes body, strips only exact trailing signatures, and keeps one signature',async()=>{
 const s=await currentSignature('frederik'),a=applySignature('<script>alert(1)</script>\nHej',s),b=applySignature(a.body,s);
 expect(b.body).toBe(a.body);expect(b.html).not.toContain('<script>');expect(b.html).toContain('&lt;script&gt;');expect(b.body.match(/Frederik Kragh/g)).toHaveLength(1);
 const former=applySignature(`Hej\n\n${FREDERIK_SIGNATURE.replace('Frederik Kragh','Frederik Emil Kragh').replace('Redaktion: +45 93 93 77 76\n','')}`,s);
 expect(former.body.match(/Frederik Kragh/g)).toHaveLength(1);
 expect(former.body).not.toContain('Frederik Emil Kragh');
 const previous=applySignature(`Hej\n\n${FREDERIK_SIGNATURE.replace('Redaktion: +45 93 93 77 76\n','')}`,s);
 expect(previous.body.match(/Frederik Kragh/g)).toHaveLength(1);
 expect(previous.body.match(/\+45 93 93 77 76/g)).toHaveLength(1);
});
it('replaces old Liv defaults without doubling the signature in a revised draft',async()=>{
 const liv=await currentSignature('liv');
 for(const old of [LEGACY_SHORT_LIV_SIGNATURE,LEGACY_LONG_LIV_SIGNATURE,PREVIOUS_LIV_HOUSE_SIGNATURE]){
  const mail=applySignature(`Hej Michelle\n\n${old}`,liv);
  expect(mail.body.match(/Liv Brandt/g)).toHaveLength(1);
  expect(mail.body).toContain(LIV_HOUSE_SIGNATURE);
 }
});
it('actual MIME has both bodies and correct headers without BCC leakage',async()=>{
 const content=applySignature('Hej,\n\nTak for din mail.',await currentSignature('frederik'));
 const raw=await new MailComposer({from:'frederik@aproposmagazine.com',replyTo:'frederik@aproposmagazine.com',to:'press@example.test',cc:['copy@example.test'],subject:'Re: Kontakt',messageId:'<final@aproposmagazine.com>',inReplyTo:'<source@example.test>',references:['<source@example.test>'],text:content.body,html:content.html,date:new Date('2026-10-22T07:00:00Z'),newline:'windows',disableFileAccess:true,disableUrlAccess:true}).compile().build();
 expect(raw.toString()).not.toMatch(/(?<!\r)\n/);
 const parsed=await simpleParser(raw);expect(parsed.text?.trim()).toBe(content.body);expect(parsed.html).toContain(SIGNATURE_LOGO);expect(parsed.headers.has('bcc')).toBe(false);expect(parsed.replyTo?.value[0].address).toBe('frederik@aproposmagazine.com');expect(parsed.inReplyTo).toBe('<source@example.test>');expect(parsed.messageId).toBe('<final@aproposmagazine.com>');expect(parsed.date?.toISOString()).toBe('2026-10-22T07:00:00.000Z');
});
