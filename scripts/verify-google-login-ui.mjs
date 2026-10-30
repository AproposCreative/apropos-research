// Real auth provider, login page and route guard; isolated Firebase/HTTP only.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const mocks={
 'next/navigation':`export const usePathname=()=>window.fixture.path;export const useRouter=()=>window.fixture.router;`,
 'next/link':`export default function Link(p){return <a {...p}/>}`,
 './firebase':`export const getFirebaseAuth=()=>window.fixture.auth;`,
 'firebase/auth':`
 export const onIdTokenChanged=(auth,fn)=>{window.fixture.listener=fn;queueMicrotask(()=>fn(auth.currentUser));return()=>{}};
 export class GoogleAuthProvider {setCustomParameters(params){window.fixture.providerParams=params;}}
 export async function signInWithPopup(auth){
  fixture.popupCalls++;await new Promise(r=>setTimeout(r,20));
  if(fixture.mode==='blocked'||fixture.mode==='cancelled')throw Object.assign(Error('private provider details'),{code:fixture.mode==='blocked'?'auth/popup-blocked':'auth/popup-closed-by-user'});
  auth.currentUser={uid:fixture.mode==='denied'?'outsider':'owner',email:'fixture@example.test',emailVerified:true,getIdToken:async()=> 'isolated-fixture'};
  void fixture.listener(auth.currentUser);return {user:auth.currentUser};
 }
 export const signInWithEmailAndPassword=signInWithPopup;export const createUserWithEmailAndPassword=signInWithPopup;export const signOut=async()=>{};`,
 './auto-save-service':`export const autoSaveService={setOwner:()=>{}};`,
 './email-verification':`export const createEmailVerificationActions=()=>({sendVerification:async()=>{},checkVerification:async()=>{}});`,
 './auth-mail-client':`export const requestAuthMail=()=>{throw Error('Unexpected auth mail')};`,
 './editorial-signup':`export const registerEditorialAccount=()=>{throw Error('Unexpected signup')};`,
 './tool-catalogue-client':`export const toolCatalogueQuery=()=>({queryKey:['fixture-tools'],queryFn:async()=>[]});`,
 '@/components/AproposAILoadingScreen':`export default function Loader(){return null;}`,
 '@/components/SplineIframeEmbed':`export default function Spline(){return null;}`,
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider,useAuth} from './lib/auth-context';import Login from './app/login/page';import Protected from './components/ProtectedRoute';
window.fixture={mode:new URLSearchParams(location.search).get('mode')||'denied',path:'/login',auth:{currentUser:null},navigations:[],popupCalls:0,accessCalls:0,errors:[],ready:false};
window.addEventListener('error',e=>fixture.errors.push(e.message));window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async (url,options={})=>{
 if(String(url)!=='/api/auth/access')throw Error('Unexpected service request');
 fixture.accessCalls++;await new Promise(r=>setTimeout(r,80));
 if(fixture.mode==='unavailable')return Response.json({}, {status:503});
 const allowed=fixture.mode==='allowed';return Response.json({allowed,capabilities:{owner:allowed}},{status:allowed?200:403});
};
function Screen(){const {user,loading}=useAuth();fixture.ready=!!user&&!loading;
 return fixture.path==='/login'?<Login/>:<Protected><main data-editor>Redaktionen er åben</main></Protected>;
}
function Root(){const[path,setPath]=useState('/login');fixture.path=path;
 if(!fixture.router)fixture.router={replace:next=>{fixture.navigations.push({path:next,ready:fixture.ready});setPath(next);}};
 return <QueryClientProvider client={queryClient}><AuthProvider><Screen/></AuthProvider></QueryClientProvider>;
}
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')).render(<Root/>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'fixture'}:undefined);
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:mocks[a.path]}));
}}]});
const server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:black;color:white"><div id="root"></div><script>window.process={env:{}}</script><script src="/bundle.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'}),out='output/google-login-20261030';await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--expect-bug'),reports=[];
try{
 for(const mode of baseline?['denied']:['denied','allowed','unavailable','blocked','cancelled']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>console.error('Fixture browser error:',error.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/?mode='+mode);
  await page.locator('#email').fill('retained@example.test').catch(async error=>{console.error(await page.evaluate(()=>({text:document.body.innerText,errors:window.fixture?.errors})));throw error;});
  await page.getByRole('button',{name:'Log in with Google',exact:true}).click();
  await page.waitForTimeout(500);
  const state=await page.evaluate(()=>({text:document.body.innerText,email:document.querySelector('#email')?.value,editor:!!document.querySelector('[data-editor]'),path:fixture.path,navigations:fixture.navigations,providerParams:fixture.providerParams,errors:fixture.errors,accessCalls:fixture.accessCalls,popupCalls:fixture.popupCalls}));
  assert.deepEqual(state.errors,[]);
  if(baseline){assert(!state.text.includes('godkendte'),'Expected old silent rejection');assert.equal(state.email,'');reports.push({mode,silentRejection:true,inputLost:true,navigations:state.navigations});}
  else if(mode==='allowed'){
   assert(state.editor);assert.equal(state.path,'/ai');assert(state.navigations.every(n=>n.ready),'Never navigate before the context accepted access');assert.equal(state.providerParams.prompt,'select_account');
   reports.push({mode,editor:true,validatedBeforeNavigation:true,googleAccountSelection:true});
  }else{
   assert.equal(state.editor,false);assert.equal(state.path,'/login');assert.equal(state.navigations.length,0);assert.equal(state.email,'retained@example.test');
   await page.getByRole('alert').waitFor();
   assert(!state.text.includes('private provider details'));
   if(mode==='denied'){
    assert(state.text.includes('godkendt'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(180);assert.equal(await page.locator('#email').inputValue(),'retained@example.test');
    // Another account may be chosen after a rejection without reloading or losing the form.
    await page.evaluate(()=>{fixture.mode='allowed';});await page.getByRole('button',{name:'Log in with Google',exact:true}).click();await page.locator('[data-editor]').waitFor();
   }
   reports.push({mode,visibleError:true,formRetained:true,noRedirect:true});
  }
  await page.close();
 }
 await writeFile(out+(baseline?'/ui-before.json':'/ui-after.json'),JSON.stringify({checkedAt:new Date().toISOString(),fixture:true,productionSignIns:0,reports},null,2));
 console.log(JSON.stringify({baseline,reports},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
