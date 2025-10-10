import OpenAI from 'openai';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from './firebase';

let client: OpenAI | null = null;

function getClient(): OpenAI {
	if (!client) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
		client = new OpenAI({ apiKey });
	}
	return client;
}

export async function getEmbedding(text: string): Promise<number[]> {
	const openai = getClient();
	const cleaned = (text || '').replace(/\s+/g, ' ').trim();
	const input = cleaned.slice(0, 4000); // safety bound
	const res = await openai.embeddings.create({
		model: 'text-embedding-3-small',
		input
	});
	return res.data[0]?.embedding || [];
}

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type EmbeddedArticle = {
	id: string;
	url?: string;
	title: string;
	author?: string;
	category?: string;
	embedding: number[];
	meta?: Record<string, any>;
};

export function loadEmbeddingsFromDisk(): EmbeddedArticle[] {
	const fs = require('fs');
	const path = require('path');
	const file = path.join(process.cwd(), 'data', 'articles-embeddings.json');
	if (!fs.existsSync(file)) return [];
	const raw = fs.readFileSync(file, 'utf8');
	try {
		const arr = JSON.parse(raw);
		if (Array.isArray(arr)) return arr;
		return [];
	} catch {
		return [];
	}
}

export async function loadEmbeddingsRemoteOrLocal(): Promise<EmbeddedArticle[]> {
	try {
		const r = ref(storage, 'apropos-config/embeddings/articles-embeddings.json');
		const url = await getDownloadURL(r);
		const res = await fetch(url);
		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data)) return data as EmbeddedArticle[];
		}
	} catch {}
	return loadEmbeddingsFromDisk();
}


