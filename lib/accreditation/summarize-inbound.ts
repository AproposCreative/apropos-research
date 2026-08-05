import { getOpenAIClient } from '@/lib/openai';
import { appendAiAudit } from '@/lib/accreditation/audit-store';
import { isAutomationEnabled } from '@/lib/accreditation/agent-control';
import { composeLivSystemPrompt } from '@/lib/accreditation/liv-system-prompt';
import { loadMemoryForReply } from '@/lib/accreditation/memory-store';
import { resolveAccreditationModelForTask } from '@/lib/accreditation/models';
import { getRequestById } from '@/lib/accreditation/request-store';
import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import type { AccreditationEmailThread } from '@/lib/accreditation/types';

export async function summarizeAccreditationInbound(params: {
  subject: string;
  from: string;
  text: string;
  thread?: AccreditationEmailThread;
}): Promise<{ aiSummary: string; suggestedReply: string; novelQuestion: boolean }> {
  const openai = getOpenAIClient();
  const fallback = {
    aiSummary: 'Indgående mail modtaget. Gennemgå manuelt før svar.',
    suggestedReply:
      'Tak for jeres svar. Vi vender tilbage med de ønskede oplysninger om Apropos Magazine og akkrediteringsanmodningen.',
    novelQuestion: true,
  };

  if (!openai) return fallback;

  const request = params.thread?.requestId
    ? await getRequestById(params.thread.requestId)
    : undefined;
  const memory = await loadMemoryForReply({
    requestId: params.thread?.requestId,
    contactEmail: params.from,
  });
  const composed = composeLivSystemPrompt({
    task: 'external_dialogue',
    automationEnabled: await isAutomationEnabled(),
    request: request || undefined,
    threadMessages: params.thread?.messages?.map((m) => ({
      direction: m.direction,
      text: m.aiSummary || (m.text || m.subject || '').slice(0, 280),
      subject: m.subject,
    })),
    taskInstructions: [
      'Opsummer indgående promotor-mail kort.',
      'Foreslå et professionelt svarudkast (ikke robotagtigt).',
      'Vurder novelQuestion (nyt/uvant spørgsmål der bør eskaleres).',
      'Respektér leverings-invarianten: godkendelse ≠ billetter leveret.',
      'Brug aldrig em dash (U+2014) eller en dash (U+2013); brug ASCII -.',
      'FAKTA-DISCIPLIN: brug KUN deterministiske læsertal fra system-prompten (1.700 / 20.000).',
      'Opfind ALDRIG artikler, analytics, ansøgere, bylines eller publicerings-løfter.',
      'Link kun til kendte Apropos-URL’er fra konteksten; ellers sig du tjekker / stil et præcist spørgsmål.',
      'Hvis skribent/navn mangler eller er tvetydigt: sig du tjekker eller spørg præcist - opfind ikke navnet.',
      'Hvis kontakten retter et navn/fakta: bekræft rettelsen eksplicit i svaret.',
      'Returnér JSON: {"summary":"...","suggestedReply":"...","novelQuestion":true|false}',
      memory ? `\nPersistent hukommelse (ingen fulde mailbodies):\n${memory}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  });
  const model = resolveAccreditationModelForTask('external_dialogue');

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: composed.prompt },
        {
          role: 'user',
          content: [
            `Fra: ${params.from}`,
            `Emne: ${params.subject}`,
            '',
            params.text.slice(0, 4000),
          ].join('\n'),
        },
      ],
      response_format: { type: 'json_object' },
    });

    await appendAiAudit({
      requestId: params.thread?.requestId,
      type: 'ai_external_dialogue',
      detail: `Inbound summarize/reply draft (${model})`,
      model,
      promptVersion: composed.promptVersion,
      task: composed.task,
      lane: composed.lane,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as {
      summary?: string;
      suggestedReply?: string;
      novelQuestion?: boolean;
    };
    return {
      aiSummary: sanitizeLivOutput(parsed.summary?.trim() || fallback.aiSummary),
      suggestedReply: sanitizeLivOutput(
        parsed.suggestedReply?.trim() || fallback.suggestedReply
      ),
      novelQuestion: Boolean(parsed.novelQuestion),
    };
  } catch {
    return fallback;
  }
}
