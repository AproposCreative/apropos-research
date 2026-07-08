import { NextRequest, NextResponse } from 'next/server';
import { cosineSimilarity, getEmbedding, loadEmbeddingsRemoteOrLocal } from '@/lib/embeddings';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

// Simple similarity + length checks as a preflight for plagiarism/fake signals
export async function POST(request: NextRequest) {
	const requestId = getRequestId(request);
	const requestLogger = createRequestLogger(requestId);
	
	try {
		const { title, content } = await request.json();
		if (!content || typeof content !== 'string') {
			requestLogger.warn('Missing content in moderation check');
			return NextResponse.json(
				createErrorResponse('content is required', {
					statusCode: 400,
					errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
					requestId,
				}),
				{ status: 400 }
			);
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
		// Heuristic thresholds — målt mod Apropos-corpus (egne artikler).
		// Sænket fra 0.93/0.88 → 0.85/0.78 efter Liv-paraphrasing-incident
		// (apr 2026): den eksisterende generator producerede tekst der lå
		// for tæt på inspirationskilden, men under den gamle 0.93-tærskel.
		const plagiarismRisk = maxSim >= 0.85 ? 'high' : maxSim >= 0.78 ? 'medium' : 'low';
		const wordCount = (content.trim().split(/\s+/).filter(Boolean)).length;
		const tooShort = wordCount < 300;
		
		requestLogger.info('Moderation check completed', {
			wordCount,
			maxSim,
			plagiarismRisk,
			tooShort,
		});
		
		return NextResponse.json(
			createSuccessResponse({
				metrics: { wordCount, maxSim, plagiarismRisk },
				nearest: plagiarismRisk !== 'low' ? { id: nearest?.id, title: nearest?.title, url: nearest?.url, author: nearest?.author } : null
			}, { requestId })
		);
	} catch (e) {
		const errorObj = e instanceof Error ? e : new Error(String(e));
		requestLogger.error('Moderation check failed', errorObj);
		return NextResponse.json(
			createErrorResponse('moderation check failed', {
				statusCode: 500,
				errorCode: ErrorCode.INTERNAL_ERROR,
				requestId,
			}),
			{ status: 500 }
		);
	}
}


