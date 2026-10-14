// Real Writer + wizard + auto-height wrapper. Local service fixtures only.
// Never types or sends a message, selects an author, or calls AI/CMS.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const server = spawn(process.execPath, ['scripts/verify-writer-resume-ui.mjs'], {
  cwd: process.cwd(), env: { ...process.env, WRITER_LAYOUT_FIXTURE: '1' }, stdio: ['ignore','pipe','pipe'],
});
let browser;
let stderr = '';
server.stderr.on('data', chunk => { stderr += chunk; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture startup timed out: '+stderr)), 30000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error('Fixture exited '+code+': '+stderr)); });
    server.stdout.on('data', chunk => { if(String(chunk).includes('Writer fixture')) { clearTimeout(timeout); resolve(); } });
  });
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const origin = 'http://127.0.0.1:4331';
  const receipts = [];
  await mkdir('output/writer-spacing',{recursive:true});
  for (const width of [320,390,768,1440]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    page.setDefaultTimeout(10000);
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(origin);
    const visible = selector => page.locator(selector).filter({visible:true});
    await page.getByRole('status').filter({hasText:/Gemt arbejdsrum|Klar|Gemt/}).waitFor();
    const progress = page.getByRole('button',{name:/Artikel opsætning.*trin/}).filter({visible:true});
    await progress.click();
    assert.equal(await page.getByText('Noter fra redaktionen',{exact:true}).count(),0);
    for (const step of ['Author','Press']) {
      await page.getByRole('button',{name:step,exact:true}).filter({visible:true}).click();
      await page.getByText(step === 'Author' ? 'Vælg forfatter' : 'Presseakkreditering?',{exact:true}).filter({visible:true}).waitFor();
      // Wait for the real auto-height transition, then measure the painted card.
      await page.waitForTimeout(450);
      const geometry = await visible('div.transition-\\[height\\]').evaluate(card => {
        const buttons = Array.from(card.querySelectorAll('button')).filter(b=>b.getBoundingClientRect().height>0);
        const last = buttons.at(-1).getBoundingClientRect();
        const box = card.getBoundingClientRect();
        const textbox = Array.from(document.querySelectorAll('textarea')).find(e=>e.getBoundingClientRect().height>0);
        const composer = textbox.closest('.rounded-xl').getBoundingClientRect();
        return {bottomInset:box.bottom-last.bottom,gapToComposer:composer.top-box.bottom,
          cardHeight:box.height,composerBottom:composer.bottom,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert(geometry.bottomInset>=8 && geometry.bottomInset<=18, JSON.stringify({width,step,...geometry}));
      assert(geometry.gapToComposer>=7 && geometry.gapToComposer<=13, JSON.stringify({width,step,...geometry}));
      assert(geometry.composerBottom<=901 && !geometry.horizontalOverflow);
      if(step==='Author') assert.equal(await page.getByRole('button',{name:'Liv Brandt',exact:true}).filter({visible:true}).count(),1);
      if(width===390) await page.screenshot({path:'output/writer-spacing/mobile-'+step.toLowerCase()+'.png'});
      receipts.push({width,step,...geometry});
    }
    await page.getByRole('button',{name:'Skjul',exact:true}).filter({visible:true}).click();
    await page.waitForTimeout(400);
    await progress.click();
    await page.getByText('Presseakkreditering?',{exact:true}).filter({visible:true}).waitFor();
    const state = await page.evaluate(()=>({errors:fixture.errors,calls:fixture.calls,notes:fixture.server.data.notes}));
    assert.equal(state.notes,'Mine private researchnoter');
    assert.deepEqual(state.errors,[]);
    assert(!state.calls.some(c=>c.path==='/api/ai-chat'||c.path==='/api/writer/cms-save'||c.path==='/api/analyze-research'));
    await page.close();
  }
  // Saved conversation is still readable and its last message clears the composer.
  for(const width of [390,1440]) {
    const page=await browser.newPage({viewport:{width,height:740}});
    page.setDefaultTimeout(10000);
    await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    await page.goto(origin+'/?saved');
    await page.getByRole('status').filter({hasText:'Gemt arbejdsrum fundet'}).waitFor();
    if(width<768) {
      await page.getByRole('button',{name:'Åbn menu',exact:true}).click();
      await page.getByRole('button',{name:'Drafts',exact:true}).click();
    } else await page.getByRole('button',{name:'Mine artikler',exact:true}).click();
    await page.getByRole('button',{name:'Fortsæt hvor du slap',exact:true}).click();
    await page.getByText('Min bevarede artikeltekst fra en anden enhed.',{exact:true}).first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.getByText('Noter fra redaktionen',{exact:true}).count(),0);
    const geometry=await page.evaluate(()=>{
      const message=document.getElementById('message-0').getBoundingClientRect();
      const composer=Array.from(document.querySelectorAll('textarea')).find(e=>e.getBoundingClientRect().height>0).closest('.rounded-xl').getBoundingClientRect();
      return {messageBottom:message.bottom,composerTop:composer.top,notes:fixture.server.data.notes,errors:fixture.errors};
    });
    assert(geometry.messageBottom<=geometry.composerTop);
    assert.equal(geometry.notes,'Mine private researchnoter');
    assert.deepEqual(geometry.errors,[]);
    receipts.push({width,savedConversation:true,...geometry});
    await page.close();
  }
  await writeFile('output/writer-spacing/geometry.json',JSON.stringify(receipts,null,2));
  console.log('Writer spacing: 10 browser cases passed; notes preserved; zero remote AI/CMS calls.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
