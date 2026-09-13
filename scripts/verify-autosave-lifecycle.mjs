// Real local autosave and lifecycle wiring; only fixture-owned browser storage.
import { build } from 'esbuild';
import { createServer } from 'node:http';
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import {AutoSaveService} from './lib/auto-save-service';
import {bindAutosaveLifecycle} from './lib/autosave-lifecycle';
const save=new AutoSaveService();save.setOwner('fixture-autosave-a');
window.fixture={errors:[],save,cleanup:bindAutosaveLifecycle(()=>save.flush())};
window.addEventListener('error',e=>window.fixture.errors.push(e.message));
const input=document.querySelector('textarea');input.value=save.load().notes;
input.addEventListener('input',()=>save.save({notes:input.value}));
document.querySelector('button').addEventListener('click',()=>{save.save({notes:'last edit before navigation'});location.href='/returned';});
`},bundle:true,write:false,format:'iife'});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local autosave fixture</title><body style="background:#080808;color:white;font:18px sans-serif;padding:24px"><h1>Min testkladde</h1><label>Noter<textarea aria-label="Noter" style="display:block;width:100%;height:160px"></textarea></label><button style="margin-top:16px;padding:14px">Gem og forlad straks</button><script src="/bundle.js"></script></body></html>');
}).listen(4324,'127.0.0.1',()=>console.log('Autosave fixture http://127.0.0.1:4324'));
