import { getOpenAIClient, models } from '@/lib/openai';
import type { FundingEmailThread } from '@/lib/funding/types';

export async function summarizeInboundEmail(params: {
  subject: string;
  from: string;
  text: string;
  thread?: FundingEmailThread;
}): Promise<{ aiSummary: string; suggestedReply: string }> {
  const openai = getOpenAIClient();
  const fallback = {
    aiSummary: 'Indgående mail modtaget. Gennemgå manuelt før svar.',
    suggestedReply:
      'Tak for jeres svar. Vi vender tilbage med de ønskede oplysninger om Apropos Magazine og vores kulturjournalistiske projekt.',
  };

  if (!openai) return fallback;

  const threadContext = params.thread
    ? `Trådemne: ${params.thread.subject}\nTidligere beskeder: ${params.thread.messages.length}`
    : '';

  try {
    const completion = await openai.chat.completions.create({
      model: models.default,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Du hjælper Apropos Magazine med funding-korrespondance på dansk. Opsummer indgående mail kort og foreslå et professionelt svarudkast. Opfind ikke fakta, deadlines eller beløb. Det er ikke juridisk rådgivning.',
        },
        {
          role: 'user',
          content: [
            threadContext,
            `Fra: ${params.from}`,
            `Emne: ${params.subject}`,
            '',
            params.text.slice(0, 6000),
            '',
            'Returnér JSON: {"summary":"...","suggestedReply":"..."}',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as { summary?: string; suggestedReply?: string };
    return {
      aiSummary: parsed.summary?.trim() || fallback.aiSummary,
      suggestedReply: parsed.suggestedReply?.trim() || fallback.suggestedReply,
    };
  } catch {
    return fallback;
  }
}
