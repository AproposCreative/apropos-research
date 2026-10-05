/** Local-only regression harness. No production credentials, Firebase, AI or CMS calls. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const mocks = {
  navigation: `export const usePathname = () => '/connect/chatgpt';`,
  firebase: `export const getFirebaseAuth = () => window.fixtureAuth;`,
  auth: `export function onIdTokenChanged(auth, fn) { window.fixtureListener = fn; queueMicrotask(() => fn(auth.currentUser)); return () => {}; }
    export async function signInWithEmailAndPassword(auth) { window.fixtureMode = 'accepted'; await window.fixtureListener(auth.currentUser); return {user:auth.currentUser}; }
    export async function signInWithPopup(auth) {
      const mode = new URLSearchParams(location.search).get('google');
      const calls = document.getElementById('google-calls'); calls.textContent = String(Number(calls.textContent) + 1);
      await new Promise(done => setTimeout(done, 300));
      if (mode === 'blocked' || mode === 'closed') throw Object.assign(new Error('Simulated popup error'), {code: mode === 'blocked' ? 'auth/popup-blocked' : 'auth/popup-closed-by-user'});
      if (mode === 'denied') return {user:auth.currentUser};
      return signInWithEmailAndPassword(auth);
    }
    export const createUserWithEmailAndPassword = signInWithEmailAndPassword;
    export async function signOut() {} export class GoogleAuthProvider {}`,
  autosave: `export const autoSaveService = {setOwner() {}};`,
  verification: `export const createEmailVerificationActions = () => ({sendVerification: async()=>{},checkVerification:async()=>{}});`,
  mail: `export const requestAuthMail = async () => {};`,
  signup: `export const registerEditorialAccount = async () => {};`,
  placeholder: `export default function Placeholder(){return null;}`,
  link: `import React from 'react'; export default function Link(props) {return React.createElement('a',props);}`,
};
const mappings = new Map([
  ['next/navigation', 'navigation'], ['firebase/auth', 'auth'], ['./firebase', 'firebase'],
  ['./auto-save-service', 'autosave'], ['./email-verification', 'verification'],
  ['./auth-mail-client', 'mail'], ['./editorial-signup', 'signup'],
  ['@/components/AproposAILoadingScreen', 'placeholder'], ['next/link', 'link'],
  ['next/image', 'placeholder'], ['./setup', 'placeholder'], ['./submission', 'placeholder'], ['./shortening', 'placeholder'],
]);
const result = await build({stdin: {contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import {AuthProvider} from './lib/auth-context'; import Connection from './app/connect/chatgpt/connection';
  window.fixtureMode='rejected'; window.fixtureDelay=600;
  window.fixtureAuth={currentUser:{uid:'fixture-user',email:'fixture@example.invalid',emailVerified:true,getIdToken:async()=> 'fixture-'+window.fixtureMode}};
  createRoot(document.getElementById('root')).render(<AuthProvider><Connection requestId="fixture-request" publicationId="" /></AuthProvider>);`,
  resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-auth',setup(b){
    b.onResolve({filter:/.*/},args=>mappings.has(args.path)?{path:mappings.get(args.path),namespace:'fixture'}:undefined);
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],resolveDir:process.cwd()}));
  }}]});
const css = (await postcss([tailwindcss({content:['./app/connect/chatgpt/connection.tsx','./app/connect/chatgpt/login.tsx']})]).process('@tailwind base; @tailwind components; @tailwind utilities;', {from:undefined})).css;
let accessChecks=0;
const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(result.outputFiles[0].text);}
  if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(req.url==='/api/auth/access'){
    accessChecks++; await new Promise(done=>setTimeout(done,600));
    const allowed=req.headers.authorization==='Bearer fixture-accepted';
    res.writeHead(allowed?200:403,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({allowed,capabilities:{owner:allowed}}));
  }
  if(req.url.startsWith('/oauth/consent')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({scopes:['apropos:read']}));}
  if(req.url==='/checks'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({accessChecks}));}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{font-family:Arial}aside{background:#ddd;color:black;padding:10px;font-size:12px}aside button{border:1px solid;padding:5px;margin:5px}</style>
    <aside>Isoleret login-test. Ingen rigtige konti eller betalinger. Google-kald: <span id="google-calls">0</span>
    <button id="focus-check" onclick="const field=document.querySelector('input[type=password]');const previous=field?.value;window.dispatchEvent(new Event('focus'));setTimeout(()=>{const current=document.querySelector('input[type=password]');document.getElementById('result').textContent=previous&&current===field&&current.value===previous?'PASS: Samme felt og indtastning bevaret':'FAIL: Felt eller indtastning blev nulstillet'},900)">Genkontrollér gemt session</button><p id="result" role="status"></p></aside>
    <div id="root"></div><script src="/bundle.js"></script></html>`);
});
server.listen(3935,'127.0.0.1',()=>console.log('Isolated login fixture: http://127.0.0.1:3935'));
