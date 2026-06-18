import http from 'http';
import { runPipeline } from './pipeline.js';

const PORT = Number(process.env.PORT || 8080);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function authorize(req) {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) return true;
  const header = req.headers['x-internal-api-secret'];
  return typeof header === 'string' && header.trim() === secret;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/process') {
    if (!authorize(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body;
    try {
      body = await readJson(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const articleUrl = typeof body.articleUrl === 'string' ? body.articleUrl.trim() : '';

    if (!jobId || !slug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'jobId and slug required' }));
      return;
    }

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, accepted: true, jobId }));

    void runPipeline({ jobId, slug, articleUrl }).catch((err) => {
      console.error('[podcast-processor] pipeline failed', jobId, err);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[podcast-processor] listening on ${PORT}`);
});
