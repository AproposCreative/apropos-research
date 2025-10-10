import { NextRequest, NextResponse } from 'next/server';
import { cosineSimilarity, getEmbedding, loadEmbeddingsRemoteOrLocal } from '@/lib/embeddings';

// Simple similarity + length checks as a preflight for plagiarism/fake signals
export async function POST(request: NextRequest) {
	try {
		const { title, content } = await request.json();
		if (!content || typeof content !== 'string') {
			return NextResponse.json({ error: 'content is required' }, { status: 400 });
		}
		const emb = await getEmbedding(`${title || ''}\n\n${content}`);
		const corpus = await loadEmbeddingsRemoteOrLocal();
		let maxSim = 0;
		let nearest: any = null;
		for (const item of corpus) {
			const sim = cosineSimilarity(emb, item.embedding);
			if (sim > maxSim) {
				maxSim = sim;
				nearest = item;
			}
		}
		// Heuristic thresholds (to be tuned)
		const plagiarismRisk = maxSim >= 0.93 ? 'high' : maxSim >= 0.88 ? 'medium' : 'low';
		const wordCount = (content.trim().split(/\s+/).filter(Boolean)).length;
		const tooShort = wordCount < 300;
		return NextResponse.json({
			ok: true,
			metrics: { wordCount, maxSim, plagiarismRisk },
			nearest: plagiarismRisk !== 'low' ? { id: nearest?.id, title: nearest?.title, url: nearest?.url, author: nearest?.author } : null
		});
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: 'moderation check failed' }, { status: 500 });
	}
}


