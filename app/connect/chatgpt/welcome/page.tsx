import type { Metadata } from 'next';
import { MCP_STARTER_PROMPTS, MCP_WELCOME_GUIDANCE } from '@/lib/mcp/welcome-content';
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
    <section className={styles.prompts}><h2>Prøv det selv</h2><p>Åbn en chat, vælg Apropos AI, og skriv for eksempel:</p>
      {MCP_STARTER_PROMPTS.map(prompt => <blockquote key={prompt}>{prompt}</blockquote>)}
    </section>
    <section className={styles.notes}><h2>Du har sidste ord</h2>
      {MCP_WELCOME_GUIDANCE.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </section>
    <footer className={styles.footer}><a href="/connect/chatgpt">Administrér din forbindelse</a></footer>
  </main></div>;
}
