import { NextRequest, NextResponse } from 'next/server';
import { cosineSimilarity, getEmbedding, loadEmbeddingsRemoteOrLocal } from '@/lib/embeddings';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { withLivCostRequest, withSharedCostContext } from '@/lib/liv/cost-context';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';
import {assessLivCorpusMatches} from '@/lib/liv/corpus-similarity';
import {load} from 'cheerio';

export const runtime = 'nodejs';
export const maxDuration = 120;
// Similarity screens candidates; a full-text, cached review can distinguish
// independent same-subject coverage from borrowing. Uncertainty stays blocking.
export async function POST(request: NextRequest) {
	try { return await withLivCostRequest(request, 'moderation', () =>
		withSharedCostContext({ scope: 'writer', stage: 'moderation' }, () => handlePost(request))); }
	catch (error) {
		if (getLivCostPretransportError(error)) return NextResponse.json({ error: 'AI-budgettet tillader ikke dette kald.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
		return NextResponse.json({ error: 'Ugyldig intern budgetkontekst.' }, { status: 401 });
	}
}

async function handlePost(request: NextRequest) {
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
		const highMatches:Array<{url?:string;similarity:number}>=[];
		for (const item of corpus) {
			const sim = cosineSimilarity(emb, item.embedding);
			if(sim>=0.85) highMatches.push({url:item.url,similarity:sim});
			if (sim > maxSim) {
				maxSim = sim;
				nearest = item;
			}
		}
		// Keep the conservative 0.85 trigger. Do not turn topic similarity into
		// an automatic plagiarism finding or simply raise the threshold.
		let plagiarismRisk = maxSim >= 0.85 ? 'high' : maxSim >= 0.78 ? 'medium' : 'low';
		let corpusReview:Awaited<ReturnType<typeof assessLivCorpusMatches>>|undefined;
		if(plagiarismRisk==='high'){
			const $=load(content); $('script,style,figcaption').remove();
			$('p,h1,h2,h3,h4,li,br').each((_,n)=>{$(n).append(' ');});
			corpusReview=await assessLivCorpusMatches(`${title || ''}\n\n${$.root().text()}`,highMatches);
			if(corpusReview.independent) plagiarismRisk='medium';
		}
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
				...(corpusReview ? {corpusReview} : {}),
				nearest: plagiarismRisk !== 'low' ? { id: nearest?.id, title: nearest?.title, url: nearest?.url, author: nearest?.author } : null
			}, { requestId })
		);
	} catch (e) {
		if (getLivCostPretransportError(e)) throw e;
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
