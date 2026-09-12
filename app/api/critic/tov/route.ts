import { NextRequest, NextResponse } from 'next/server';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getOpenAIClient, models } from '@/lib/openai';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { isLivAuthor, loadLivVoice } from '@/lib/liv/voice';
import { livModels } from '@/lib/liv/model-config';
import { withLivCostRequest } from '@/lib/liv/cost-context';

const client = getOpenAIClient();

const CRITIC_SYSTEM = `Du er en skarp, men hjælpsom redaktør for Apropos Magazine.
Evaluer en kladde efter TOV: rytme, sanselighed, personligt nærvær, intro/afslutning, og forfatterprofil.
Returnér korte, præcise forbedringsforslag i punktform. Dansk.`;

export async function POST(request: NextRequest) {
	try { return await withLivCostRequest(request, 'tov', () => handlePost(request)); }
	catch { return NextResponse.json({ error: 'Ugyldig intern budgetkontekst.' }, { status: 401 }); }
}

async function handlePost(request: NextRequest) {
	const requestId = getRequestId(request);
	const requestLogger = createRequestLogger(requestId);
	
	try {
		const { text, author } = await request.json();
		
		if (!text) {
			requestLogger.warn('Missing text in request');
			return NextResponse.json(
				createErrorResponse('Text is required', {
					statusCode: 400,
					errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
					requestId,
				}),
				{ status: 400 }
			);
		}

		if (!client) {
		requestLogger.error('OpenAI client not initialized');
			return NextResponse.json(
				createErrorResponse('OpenAI API key not configured', {
					statusCode: 500,
					errorCode: ErrorCode.MISSING_API_KEY,
					requestId,
				}),
				{ status: 500 }
			);
		}

		const liv = typeof author === 'string' && isLivAuthor(author);
		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: [CRITIC_SYSTEM, ...(liv ? [loadLivVoice().text, 'Bedøm mod denne profil. Kræv konkrete belæg, selvstændig vinkel og passende humor. Afvis opdigtede førstehåndsoplevelser.'] : [])].join('\n') },
			{ role: 'user', content: `Forfatter: ${author || 'Apropos'}\n\nTekst:\n${text}` }
		];
		
		const comp = await client.chat.completions.create({ 
			model: liv ? livModels().article : models.default,
			messages, 
			max_completion_tokens: liv ? 3000 : 600
		});
		
		const tips = comp.choices[0]?.message?.content || '';
		
		requestLogger.info('TOV critic completed', { 
			author: author || 'Apropos',
			tipsLength: tips.length,
		});
		
		return NextResponse.json(
			createSuccessResponse({ ok: true, tips }, { requestId })
		);
	} catch (e) {
		const errorObj = e instanceof Error ? e : new Error(String(e));
		requestLogger.error('Critic failed', errorObj);
		return NextResponse.json(
			createErrorResponse('Critic failed', {
				statusCode: 500,
				errorCode: ErrorCode.INTERNAL_ERROR,
				requestId,
			}),
			{ status: 500 }
		);
	}
}
