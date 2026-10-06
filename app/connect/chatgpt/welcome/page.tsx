import type { Metadata } from 'next';
import { MCP_STARTER_PROMPTS, MCP_WELCOME_POSTER, MCP_WELCOME_VIDEO } from '@/lib/mcp/welcome-content';
import styles from './welcome.module.css';

export const metadata: Metadata = { title: 'Kom i gang med Apropos AI', robots: { index: false, follow: false } };
export default function McpWelcomePage() {
  return <div className={styles.canvas}><main className={styles.page}>
    <header className={styles.header}>
      {/* Existing brand artwork; no third-party embeds or tracking. */}
      <img src="/images/apropos-ai-icon.png" width={56} height={56} alt="Apropos Magazine" />
      <span>Apropos AI</span><a href="/connect/chatgpt">Min forbindelse</a>
    </header>
    <section className={styles.intro}><h1>Din redaktion.<br />Nu i chatten.</h1>
      <p>Fra første kladde til din godkendelse. Et kort overblik over Apropos AI i ChatGPT.</p>
    </section>
    <video className={styles.video} controls playsInline preload="none" poster={MCP_WELCOME_POSTER} aria-label="Introduktion til Apropos AI, med danske tekster">
      <source src={MCP_WELCOME_VIDEO} type="video/mp4" />
      <track kind="captions" src="/onboarding/apropos-ai-2026-10-06.vtt" srcLang="da" label="Dansk" />
      <a href={MCP_WELCOME_VIDEO}>Hent introduktionsvideoen</a>
    </video>
    <section className={styles.prompts}><h2>Prøv det selv</h2><p>Åbn en chat, vælg Apropos AI, og skriv for eksempel:</p>
      {MCP_STARTER_PROMPTS.map(prompt => <blockquote key={prompt}>{prompt}</blockquote>)}
    </section>
    <section className={styles.notes}><h2>Du har sidste ord</h2>
      <p>Chatten hjælper med teksten, kilderne, billederne og SEO. Systemet viser mangler og spørger til felter, der ikke er indlysende. Du godkender den konkrete version før udgivelse.</p>
      <p>Til film og TV bruger vi officielle stills. Illustrationer laves i chatten med Apropos-prompten. Gemte billeder kan genbruges.</p>
      <p>Nye chatforløb køber ikke automatisk research, omskrivninger eller billeder via API. Nødvendige slutkontroller kræver særskilt prisaccept. Dit ChatGPT-abonnements muligheder og grænser gælder stadig.</p>
      <p>Videoen viser et illustreret eksempel på arbejdsgangen, ikke en faktisk publicering. En blokering eller manglende godkendelse stopper udgivelsen.</p>
    </section>
    <footer className={styles.footer}><a href="/connect/chatgpt">Administrér din forbindelse</a><p>Intro · 6. oktober 2026. Ingen autoplay eller ekstra AI-kald ved afspilning.</p></footer>
  </main></div>;
}
