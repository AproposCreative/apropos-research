import {expect,it,vi} from 'vitest';
import MailComposer from 'nodemailer/lib/mail-composer';
import {simpleParser} from 'mailparser';
vi.mock('@/lib/liv-inbox/settings-store',()=>({getLivInboxSettings:async()=>({signature:'Liv Brandt\nApropos Magazine'})}));
import {currentSignature,applySignature,FREDERIK_SIGNATURE,SIGNATURE_LOGO} from '@/lib/editorial-mail/signature';
it('uses the original logo, official details and accessible links; account-specific signatures',async()=>{
 const s=await currentSignature('frederik');expect(s.text).toBe(FREDERIK_SIGNATURE);expect(s.html).toContain(SIGNATURE_LOGO);expect(s.html).toContain('tel:+4531103117');expect(s.html).toContain('https://aproposmagazine.com');expect(s.html).toContain('max-width:100%');
 expect((await currentSignature('liv')).text).toBe('Liv Brandt\nApropos Magazine');
});
it('escapes body, strips only exact trailing signatures, and keeps one signature',async()=>{
 const s=await currentSignature('frederik'),a=applySignature('<script>alert(1)</script>\nHej',s),b=applySignature(a.body,s);
 expect(b.body).toBe(a.body);expect(b.html).not.toContain('<script>');expect(b.html).toContain('&lt;script&gt;');expect(b.body.match(/Frederik Emil Kragh/g)).toHaveLength(1);
});
it('actual MIME has both bodies and correct headers without BCC leakage',async()=>{
 const content=applySignature('Hej,\n\nTak for din mail.',await currentSignature('frederik'));
 const raw=await new MailComposer({from:'frederik@aproposmagazine.com',replyTo:'frederik@aproposmagazine.com',to:'press@example.test',cc:['copy@example.test'],subject:'Re: Kontakt',messageId:'<final@aproposmagazine.com>',inReplyTo:'<source@example.test>',references:['<source@example.test>'],text:content.body,html:content.html,date:new Date('2026-10-22T07:00:00Z'),newline:'windows',disableFileAccess:true,disableUrlAccess:true}).compile().build();
 expect(raw.toString()).not.toMatch(/(?<!\r)\n/);
 const parsed=await simpleParser(raw);expect(parsed.text?.trim()).toBe(content.body);expect(parsed.html).toContain(SIGNATURE_LOGO);expect(parsed.headers.has('bcc')).toBe(false);expect(parsed.replyTo?.value[0].address).toBe('frederik@aproposmagazine.com');expect(parsed.inReplyTo).toBe('<source@example.test>');expect(parsed.messageId).toBe('<final@aproposmagazine.com>');expect(parsed.date?.toISOString()).toBe('2026-10-22T07:00:00.000Z');
});
