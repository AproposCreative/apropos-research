import { ideaId } from './ideas';

export const EDITORIAL_CHAT_URL = 'https://chatgpt.com/c/6acb2584-2f20-83eb-a335-031a584b8d3b';

/** Fixed instructions, never a prompt assembled from untrusted source prose. */
export function editorialIdeaHandoff(id: string) {
  return {
    chatUrl: EDITORIAL_CHAT_URL,
    prompt: `Start eller genoptag kun den valgte redaktionelle idé ${ideaId.parse(id)}. Hent get_editorial_idea og get_workflow(editorial). Kontrollér aktualitet og dubletter, genbrug den stabile submission-identitet, og fortsæt research, tekst, metadata og billeder i ChatGPT. Vis artikelpreview til min personlige godkendelse. Ingen betalt backend-AI eller publicering.`,
  };
}
