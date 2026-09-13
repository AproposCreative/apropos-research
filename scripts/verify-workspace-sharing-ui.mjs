// Isolated browser fixture. No production authentication, storage or model calls.
// Run: node scripts/verify-workspace-sharing-ui.mjs
import { build } from 'esbuild';
import { createServer } from 'node:http';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/ai/WorkspaceShares.tsx', import.meta.url), 'utf8');
const css = (await postcss([tailwind({ content: [{ raw: source, extension: 'tsx' }], corePlugins: { preflight: true } })])
  .process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const result = await build({
  stdin: { contents: `
    import React, { StrictMode, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import WorkspaceShares from './app/ai/WorkspaceShares';
    const id = 'a'.repeat(64);
    const snapshot = {revision: 7, updatedAt: '2026-09-13T12:00:00Z', data: {
      messages: [{id:'fixture',role:'user',content:'Isoleret testchat'}],
      chatTitle: 'Testkladde', articleData: {}, notes: 'Private testnoter',
      showWizard: false, currentDraftId: 'fixture'
    }};
    window.fixture = {posts: [], copies: [], errors: [], failOnce: true};
    window.addEventListener('error', e => window.fixture.errors.push(e.message));
    window.addEventListener('unhandledrejection', e => window.fixture.errors.push(String(e.reason)));
    window.fetch = async (path, options = {}) => {
      await new Promise(resolve => setTimeout(resolve, 30));
      options.signal?.throwIfAborted();
      if (options.method === 'POST') {
        window.fixture.posts.push(JSON.parse(options.body));
        if (window.fixture.failOnce) {
          window.fixture.failOnce = false;
          throw new TypeError('Isoleret netværksafbrydelse');
        }
        return Response.json({id,created:true});
      }
      if (path.includes('?id=')) return Response.json({share:{id,snapshot}});
      if (path.endsWith('/shares')) return Response.json({shares:[{id,title:'Modtaget testkopi',own:false,createdAt:snapshot.updatedAt}]});
      if (path === '/api/writer/workspace') return Response.json({workspace:snapshot});
      throw new Error('Unexpected fixture request: '+path);
    };
    function App() {
      const [open, setOpen] = useState(true);
      return <><button onClick={() => setOpen(true)}>Åbn testdialog</button>{open &&
        <WorkspaceShares onClose={() => setOpen(false)} onCopy={async selection => {window.fixture.copies.push(selection);}} />}</>;
    }
    createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'fixture-auth', setup(b) {
    b.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: 'fixture-auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useAuth=()=>({user:{uid:"fixture-frederik",email:"frederik@aproposmagazine.com",getIdToken:async()=>"fixture-only"}});' }));
  } }],
});
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); res.end(result.outputFiles[0].text); return; }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated sharing test</title><style>${css}</style><body style="background:#000;color:#fff"><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
server.listen(4318, '127.0.0.1', () => console.log('Isolated sharing fixture: http://127.0.0.1:4318'));
