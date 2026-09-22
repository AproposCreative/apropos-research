import { expect, it } from 'vitest';
import { loadAproposArticleStructure } from '@/lib/editorial/article-structure';
import { buildPromptSegments, composeSystemPrompt } from '@/lib/ai-chat/build-system-prompt';
import { loadLivVoice } from '@/lib/liv/voice';
import { PROMPT_SEGMENT_IDS } from '@/lib/ai-chat/prompt-segment-types';

it.each(['Liv Brandt', 'Frederik Kragh', 'Casper', 'Milo'])('shares the reader-first rules with %s without replacing their voice', author => {
  const structure = loadAproposArticleStructure();
  const prompt = composeSystemPrompt(buildPromptSegments('Min særlige forfatterstemme', author, {}), {}, null);
  expect(prompt).toContain(structure);
  if (author !== 'Liv Brandt') expect(prompt).toContain('Min særlige forfatterstemme');
  for (const text of ['IKKE har læst researchen', '100–150 ord', 'KLARHED > CLEVERNESS', '10–25 ord',
    'Som udgangspunkt præcis én refleksiv slutoverskrift', '2–4 korte afsnit',
    'Læs Apropos Magazines anmeldelse her (X/6 stjerner).', 'opfind ikke motiver',
    'Mindst én genkendelig menneskelig observation', 'Er svaret nej, omskriv før aflevering']) {
    expect(prompt).toContain(text);
  }
  expect(prompt).not.toContain('Undertitel: [8–14 ord]');
  expect(prompt).not.toContain('no subheadings');
  expect(composeSystemPrompt(buildPromptSegments('', author, {}), { [PROMPT_SEGMENT_IDS.structure]: false }, null)).toContain(structure);
});

it('removes contradictory Liv ending prohibitions while retaining source and experience safeguards', () => {
  const voice = loadLivVoice().text;
  expect(voice).not.toContain('Drop faste slutrubrikker');
  expect(voice).not.toContain('Ingen ekstra opsummering, fast refleksionsrubrik');
  expect(voice).toContain('én varieret refleksiv slutoverskrift');
  expect(voice).toContain('Foregiv aldrig egen visning');
  expect(voice).toContain('Som udgangspunkt ingen citater fra andre anmeldere');
});
