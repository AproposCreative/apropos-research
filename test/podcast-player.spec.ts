import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/podcast-player.js', 'utf8');
function harness() {
  let now = 0;
  const nodes = new Map<string, any>();
  const events: any[] = [];
  const handlers: Record<string, (() => void)[]> = {};
  const audio = { currentTime: 0, duration: 100, playbackRate: 1, volume: 1, muted: false,
    seeking: false, paused: false, ended: false, setAttribute() {},
    addEventListener(type: string, fn: () => void) { (handlers[type] ||= []).push(fn); },
  };
  const document = { readyState: 'loading', currentScript: null, addEventListener() {},
    querySelector: (selector: string) => nodes.get(selector) || null,
    querySelectorAll: () => [], createElement: () => audio, body: { appendChild() {} } };
  const window: any = { addEventListener() {}, setTimeout() {},
    gtag: (...args: any[]) => events.push(args) };
  const location = { pathname: '/articles/book' };
  // Execute the actual shipped file; expose internals only within this isolated VM.
  const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.test={state,ensureAudio,resetListening,sampleListening,coveredSeconds,resolveArtwork,attachArtwork,apiBase,get listening(){return listening;}};})();');
  runInNewContext(instrumented, { window, document, location, performance: { now: () => now },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} } });
  const t = window.test;
  t.state.episode = { id: 'book-id', articleSlug: 'book', title: 'Bogen', audioURL: 'https://storage.test/audio?token=private' };
  t.ensureAudio();
  t.resetListening('byline');
  const emit = (type: string) => handlers[type]?.forEach(fn => fn());
  const advance = (seconds: number, content = seconds * audio.playbackRate) => {
    now += seconds * 1000; audio.currentTime += content; t.sampleListening();
  };
  const consent = (value = true) => window.AproposPodcast.configureAnalytics({ measurementId: 'G-TEST1234', consent: value });
  const names = () => events.map(e => e[1]);
  return { t, audio, events, names, emit, advance, consent, window, nodes, location };
}

describe('real podcast player: consent-gated listening, not clicks or seeks', () => {
  it('sends nothing by default, including after a full playthrough', () => {
    const h = harness(); h.emit('playing'); h.advance(100); h.emit('ended');
    expect(h.events).toEqual([]);
  });
  it('counts one real start and one qualified listen, not pause/resume duplicates', () => {
    const h = harness(); h.consent(); h.emit('playing'); h.advance(15);
    h.audio.paused = true; h.emit('pause'); h.advance(10, 0);
    h.audio.paused = false; h.emit('playing'); h.advance(15);
    expect(h.names().filter(n => n === 'audio_start')).toHaveLength(1);
    expect(h.names().filter(n => n === 'audio_listen')).toHaveLength(1);
    expect(h.events.find(e => e[1] === 'audio_listen')[2].listened_seconds).toBe(30);
    expect(JSON.stringify(h.events)).not.toMatch(/private|token|audioURL/);
  });
  it('cannot turn a seek to the end into a qualified listen or completion', () => {
    const h = harness(); h.consent(); h.emit('playing'); h.advance(2);
    h.audio.seeking = true; h.emit('seeking'); h.advance(1, 95);
    h.audio.seeking = false; h.emit('seeked'); h.advance(3);
    h.audio.ended = true; h.emit('ended');
    expect(h.names()).not.toContain('audio_listen');
    expect(h.names()).not.toContain('audio_complete');
    expect(h.names()).not.toContain('audio_progress');
  });
  it('counts unique content coverage, not repeated listening to the same segment', () => {
    const h = harness(); h.consent(); h.emit('playing'); h.advance(20);
    h.emit('seeking'); h.audio.currentTime = 0; h.emit('seeked'); h.advance(20);
    expect(h.names()).toContain('audio_listen');
    expect(h.names()).not.toContain('audio_progress');
  });
  it('emits progress milestones once and completion only after actually covering the audio', () => {
    const h = harness(); h.consent(); h.emit('playing');
    for (let i = 0; i < 10; i++) h.advance(10);
    h.audio.ended = true; h.emit('ended'); h.emit('ended');
    expect(h.events.filter(e => e[1] === 'audio_progress').map(e => e[2].percent)).toEqual([25, 50, 75, 90]);
    expect(h.names().filter(n => n === 'audio_complete')).toHaveLength(1);
  });
  it('measures wall-clock listening at 2x, not media elapsed seconds', () => {
    const h = harness(); h.audio.playbackRate = 2; h.consent(); h.emit('playing');
    h.advance(15); expect(h.names()).not.toContain('audio_listen');
    h.advance(15); expect(h.events.find(e => e[1] === 'audio_listen')[2].listened_seconds).toBe(30);
  });
  it('does not count stalled, paused or muted time', () => {
    const h = harness(); h.consent(); h.emit('playing'); h.advance(60, 0);
    h.audio.muted = true; h.emit('volumechange'); h.advance(60); h.advance(60);
    expect(h.names()).not.toContain('audio_listen');
  });
  it('never backfills pre-consent activity and stops on withdrawal', () => {
    const h = harness(); h.advance(45); h.consent(); h.advance(10);
    expect(h.names()).not.toContain('audio_listen');
    const before = h.events.length; h.consent(false); h.advance(45); h.emit('ended');
    expect(h.events).toHaveLength(before);
  });
  it('ignores invalid destinations and analytics failures never break audio', () => {
    const h = harness(); h.window.AproposPodcast.configureAnalytics({ measurementId: 'not-ga', consent: true });
    h.emit('playing'); h.advance(40); expect(h.events).toEqual([]);
    h.consent(); h.window.gtag = () => { throw new Error('blocked'); };
    expect(() => { h.emit('playing'); h.advance(40); }).not.toThrow();
  });
});

describe('episode artwork identity', () => {
  const ep = () => ({ id: 'book', articleSlug: 'book', artworkURL: 'https://ai.aproposmagazine.com/podcast/show-cover.jpg' });
  it('uses the actual current article hero instead of the generic manifest cover', () => {
    const h = harness(); h.nodes.set('.paralax-image-mobile', { getAttribute: () => 'https://cdn.test/book.webp' });
    expect(h.t.resolveArtwork(ep())).toBe('https://cdn.test/book.webp');
  });
  it('freezes the playing article image across navigation, never borrowing the next hero', () => {
    const h = harness(); h.nodes.set('.paralax-image-mobile', { getAttribute: () => 'https://cdn.test/book.webp' });
    const episode = ep(); h.t.attachArtwork(episode); h.location.pathname = '/articles/other';
    h.nodes.set('.paralax-image-mobile', { getAttribute: () => 'https://cdn.test/other.webp' });
    expect(h.t.resolveArtwork(episode)).toBe('https://cdn.test/book.webp');
  });
  it('refreshes a retained generic image when the correct article is opened', () => {
    const h = harness(); h.nodes.set('.paralax-image-mobile', { getAttribute: () => 'https://cdn.test/book.webp' });
    expect(h.t.resolveArtwork({ ...ep(), articleArtworkURL: ep().artworkURL })).toBe('https://cdn.test/book.webp');
  });
  it('retains the configured API origin when soft navigation removes the embed', () => {
    const h = harness();
    h.nodes.set('script[data-api-base][src*="podcast-player"]', { getAttribute: () => 'https://audio.test/' });
    expect(h.t.apiBase()).toBe('https://audio.test');
    h.nodes.clear();
    expect(h.t.apiBase()).toBe('https://audio.test');
  });
});
