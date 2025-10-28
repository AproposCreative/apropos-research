import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const CRITIC_SYSTEM = `Du er en skarp, men hjælpsom redaktør for Apropos Magazine.
Evaluer en kladde efter TOV: rytme, sanselighed, personligt nærvær, intro/afslutning, og forfatterprofil.
Returnér korte, præcise forbedringsforslag i punktform. Dansk.`;

export async function POST(request: NextRequest) {
	try {
		const { text, author } = await request.json();
		if (!text || !client) return NextResponse.json({ error: 'missing text or api' }, { status: 400 });
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: `Forfatter: ${author || 'Apropos'}\n\nTekst:\n${text}` }
    ];
		const comp = await client.chat.completions.create({ model: 'gpt-5-mini', messages, temperature: 1, max_completion_tokens: 600 }); // Updated to GPT-5-mini
		const tips = comp.choices[0]?.message?.content || '';
		return NextResponse.json({ ok: true, tips });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: 'critic failed' }, { status: 500 });
	}
}


