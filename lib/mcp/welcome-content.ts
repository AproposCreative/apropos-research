/** Public, text-only onboarding. No private user/article data. */
export const MCP_WELCOME_VERSION = '2026-10-13-v3';
export const MCP_WELCOME_URL = 'https://ai.aproposmagazine.com/connect/chatgpt/welcome';
export const MCP_STARTER_PROMPTS = [
  'Vis mine seneste kladder, og fortæl kort, hvad de mangler.',
  'Forkort introen. Bevar resten af teksten og alle billeder. Vis ændringen først.',
  'Hent Apropos-billedprompten til dette afsnit, så vi kan lave illustrationen her i chatten.',
] as const;

// Shared by the public guide and the welcome email: one source of truth.
export const MCP_WELCOME_GUIDANCE = [
  'Chatten hjælper med tekst, kilder, billeder og SEO. Bed om et artikelpreview, og læs den gemte version med de faktiske billeder. Mangler og blokeringer skal løses før godkendelse.',
  'Tryk én gang på “Godkend og udgiv” eller “Godkend og planlæg” i previewet. Godkendelsen gælder præcis den viste version og dens billeder. Serveren fortsætter selv; du skal ikke bagefter bekræfte igen i chatten. Ændres artiklen efter godkendelsen, skal den nye version godkendes.',
  '“Åbn eksternt” er et alternativ, ikke et ekstra godkendelsestrin. Brug det, hvis previewet ikke kan vises i chatten. Et link giver ikke andre adgang til din private kladde eller ret til at godkende den.',
  'Til film og TV bruger vi officielle stills. Illustrationer laves i chatten med Apropos-prompten og stilreferencen. Gemte billeder genbruges, når de passer.',
  'Nye ChatGPT-first-forløb bruger ingen betalte backend-AI-kald og kræver ingen særskilt prisaccept. Dit ChatGPT-abonnements funktioner og forbrugsgrænser gælder stadig; abonnement, hosting og øvrige tjenester er ikke gratis.',
  'Hvis noget tager tid eller fejler, bed chatten hente den aktuelle status og kvittering. Opret ikke en ny artikel eller en ny godkendelse for at genoptage samme arbejde. “Godkendt” og “udgivet” er forskellige tilstande; en udgivelse er først verificeret, når du får en liveadresse med readback.',
] as const;

export function mcpWelcomeContent() {
  const subject = 'Apropos AI er forbundet. Kom i gang i chatten.';
  const text = `Velkommen til Apropos AI i ChatGPT.\n\nDin personlige forbindelse er aktiveret. Læs den korte vejledning:\n${MCP_WELCOME_URL}\n\nPrøv i en chat med Apropos AI valgt:\n${MCP_STARTER_PROMPTS.map(x => `• ${x}`).join('\n')}\n\n${MCP_WELCOME_GUIDANCE.join('\n\n')}\n\nMailen sendes én gang efter aktivering, ikke ved hver login eller genforbindelse. Administrér din forbindelse: https://ai.aproposmagazine.com/connect/chatgpt\n\nApropos Magazine`;
  const html = `<!doctype html><html lang="da"><body style="margin:0;background:#080808;color:#f5f5f5;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" style="max-width:100%;width:100%"><tr><td><img src="https://ai.aproposmagazine.com/images/apropos-ai-icon.png" width="64" height="64" alt="Apropos Magazine"><h1 style="font-size:30px;font-weight:500;line-height:1.2">Din redaktion. Nu i chatten.</h1><p style="line-height:1.6;color:#ccc">Apropos AI er forbundet. Vælg Apropos AI i en chat, og prøv eksemplet nedenfor.</p><p><a href="${MCP_WELCOME_URL}" style="display:inline-block;padding:16px 24px;background:#fff;color:#080808;border-radius:10px;text-decoration:none">Læs den korte vejledning</a></p><h2 style="font-size:20px;font-weight:500">Start med én sætning</h2><p style="line-height:1.6">“${MCP_STARTER_PROMPTS[0]}”</p>${MCP_WELCOME_GUIDANCE.map(paragraph => `<p style="line-height:1.6;color:#ccc">${paragraph}</p>`).join('')}<p style="font-size:13px;line-height:1.6;color:#aaa">Én velkomst efter aktivering, ikke et nyhedsbrev. <a style="color:#ddd" href="https://ai.aproposmagazine.com/connect/chatgpt">Administrér forbindelse</a>.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
