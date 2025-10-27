#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

type Article = {
	url?: string;
	title: string;
	author?: string;
	category?: string;
	content: string;
	date?: string;
};

async function getEmbedding(text: string): Promise<number[]> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
	
	const openai = new OpenAI({ apiKey });
	const cleaned = (text || '').replace(/\s+/g, ' ').trim();
	const input = cleaned.slice(0, 4000); // safety bound
	
	const res = await openai.embeddings.create({
		model: 'text-embedding-3-small',
		input
	});
	return res.data[0]?.embedding || [];
}

async function main() {
	console.log('Starting embeddings training...');
	
	// Load OPENAI_API_KEY from .env.local if present (no external deps)
	try {
		const envPath = path.join(process.cwd(), '.env.local');
		if (fs.existsSync(envPath)) {
			console.log('Loading environment variables from .env.local...');
			const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
			for (const line of lines) {
				const t = line.trim();
				if (!t || t.startsWith('#')) continue;
				const eq = t.indexOf('=');
				if (eq === -1) continue;
				const key = t.slice(0, eq).trim();
				let val = t.slice(eq + 1).trim();
				val = val.replace(/^['"]|['"]$/g, '');
				if (!process.env[key]) process.env[key] = val;
			}
		}
	} catch (e) {
		console.warn('Could not load .env.local:', e);
	}

	// Verify OpenAI API key
	if (!process.env.OPENAI_API_KEY) {
		console.error('❌ OPENAI_API_KEY is not set');
		process.exit(1);
	}
	console.log('✅ OpenAI API key found');

	const inputFile = path.join(process.cwd(), 'data', 'apropos-articles.json');
	if (!fs.existsSync(inputFile)) {
		console.error('❌ Missing data/apropos-articles.json');
		process.exit(1);
	}
	console.log('✅ Found input file:', inputFile);

	const raw = fs.readFileSync(inputFile, 'utf8');
	const items: Article[] = JSON.parse(raw);
	console.log(`📊 Processing ${items.length} articles...`);
	
	const out: any[] = [];
	let i = 0;
	for (const art of items) {
		i++;
		const base = `${art.title}\n\n${(art.content || '').replace(/\s+/g, ' ').trim()}`.slice(0, 6000);
		try {
			const emb = await getEmbedding(base);
			out.push({
				id: `${i}`,
				url: art.url,
				title: art.title,
				author: art.author,
				category: art.category,
				embedding: emb,
				meta: { date: art.date }
			});
			if (i % 10 === 0) console.log(`📈 Embedded ${i}/${items.length}`);
			await new Promise(r => setTimeout(r, 250));
		} catch (e) {
			console.warn('⚠️ Embedding failed for:', art.title, e);
		}
	}
	
	const outFile = path.join(process.cwd(), 'data', 'articles-embeddings.json');
	fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
	console.log(`✅ Saved ${out.length} embeddings to ${outFile}`);
}

main().catch(err => {
	console.error('❌ Error:', err);
	process.exit(1);
});