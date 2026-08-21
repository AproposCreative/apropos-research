# Webflow podcast design handoff

The hydrator script binds via `data-apropos-*` attributes only — structure must stay, styling is yours.

> Status: the player is a native Webflow component, **Apropos Podcast Player** (group `Podcast`, id `89c07986-0955-3b58-fa08-1fe5c1f9cd69`). Layout is a **single-line pill bar**: left transport (`1x` · −15 · play/pause · +30 · sleep) · center artwork + title/hosts + progress · right mute + volume slider. AirPlay / queue / transcript are omitted (no reliable web equivalents). Sleep + speaker icons are on the Webflow CDN; other icons use `/podcast-icons/` on `ai.aproposmagazine.com`. Opens with opacity + slide-up via `.is-open`. Placed on Articles Template + `/podcasts`. Keep the `data-apropos-*` attributes when editing.

## 1. Article template — listen button

Place near byline. Visible in Designer; script hides it when no episode exists.

```html
<div data-apropos-podcast-listen hidden>
  <button type="button">Lyt til artiklen</button>
</div>
```

Optional: set `data-apropos-podcast-slug` on the wrapper if slug is not in the URL path `/articles/{slug}`.

## 2. Global player (site-wide component)

One instance per page — the `Apropos Podcast Player` component. Structure as built:

```html
<div class="audio-player" data-apropos-podcast-player hidden aria-hidden="true">
  <div class="audio-player__card">
    <div class="audio-player__top">
      <img class="audio-player__artwork" data-apropos-podcast-artwork alt="" />
      <div class="audio-player__content">
        <p class="audio-player__label">Lyt til artiklen</p>
        <p class="audio-player__title" data-apropos-podcast-title>Artikeltitel</p>
        <p class="audio-player__hosts" data-apropos-podcast-hosts>Apropos Magazine</p>
      </div>
      <a class="audio-player__close" href="#" data-apropos-podcast-close>Luk</a>
    </div>
    <div class="audio-player__timeline">
      <p class="audio-player__time" data-apropos-podcast-current-time>0:00</p>
      <input class="audio-player__progress" type="range" data-apropos-podcast-progress min="0" max="1000" value="0" />
      <p class="audio-player__time" data-apropos-podcast-duration>0:00</p>
    </div>
    <div class="audio-player__controls">
      <a class="audio-player__speed" href="#" data-apropos-podcast-speed>1×</a>
      <a class="audio-player__skip" href="#" data-apropos-podcast-skip-back>−15</a>
      <a class="audio-player__play" href="#" data-apropos-podcast-play>Afspil</a>
      <a class="audio-player__skip" href="#" data-apropos-podcast-skip-forward>+30</a>
      <input class="audio-player__volume" type="range" data-apropos-podcast-volume min="0" max="100" value="100" />
    </div>
  </div>
</div>
```

The script toggles `hidden` + `aria-hidden` and `is-open` / `is-playing` on the root, plus
`apropos-podcast-playing` on `<html>` if you need page-level styling.

The component root is visible on the Designer canvas (custom code does not run there). Published
pages hide/show the player with opacity + `translateY` on `.is-open` in site head CSS — not
`display:none`, so the open animation can run. The hydrator adds `.is-open` on the next frame after
removing `hidden`.

Behaviour parity with the iOS app: 15s back, 30s forward, rate cycle 1× → 1,25× → 1,5× → 2× → 0,75×,
resume position per episode via `localStorage`, and lock-screen metadata through the Media Session API.

Text on `data-apropos-podcast-play` and `-speed` is only rewritten when the control holds plain text,
so replacing the label with an icon is safe.

Artwork has no manifest field yet: the script falls back to the page's `og:image`, and hides the
`<img>` when nothing is available.

## 3. `/podcasts` list page

```html
<div data-apropos-podcast-list>
  <article data-apropos-podcast-item hidden>
    <h3 data-apropos-podcast-item-title>Titel</h3>
    <p data-apropos-podcast-item-hosts>Hosts</p>
    <time data-apropos-podcast-item-date></time>
    <button type="button" data-apropos-podcast-item-play>Afspil</button>
    <a data-apropos-podcast-item-link href="#">Læs artiklen</a>
  </article>
</div>
```

The item with `data-apropos-podcast-item` is a template: script clones it for each episode.

## Attribute contract

| Attribute | Role |
|-----------|------|
| `data-apropos-podcast-listen` | Listen button wrapper (article) |
| `data-apropos-podcast-slug` | Optional explicit article slug |
| `data-apropos-podcast-player` | Player root |
| `data-apropos-podcast-artwork` | `<img>` for episode/article artwork |
| `data-apropos-podcast-title` | Episode title in player |
| `data-apropos-podcast-hosts` | Hosts line in player |
| `data-apropos-podcast-play` | Play/pause |
| `data-apropos-podcast-skip-back` | Skip back 15s |
| `data-apropos-podcast-skip-forward` | Skip forward 30s |
| `data-apropos-podcast-speed` | Cycle playback rate |
| `data-apropos-podcast-volume` | Volume range (0–100) |
| `data-apropos-podcast-progress` | Seek range |
| `data-apropos-podcast-current-time` | Elapsed time text |
| `data-apropos-podcast-duration` | Duration text |
| `data-apropos-podcast-time` | Alternative combined `elapsed / duration` text |
| `data-apropos-podcast-close` | Close player |
| `data-apropos-podcast-list` | List container |
| `data-apropos-podcast-item` | List item template |
| `data-apropos-podcast-item-title` | Item title |
| `data-apropos-podcast-item-hosts` | Item hosts |
| `data-apropos-podcast-item-date` | Item date |
| `data-apropos-podcast-item-play` | Item play button |
| `data-apropos-podcast-item-link` | Link to article |

## Script install

Hosted at `https://ai.aproposmagazine.com/podcast-player.js` (after deploy).

Site footer custom code (or registered hosted script):

```html
<script
  src="https://ai.aproposmagazine.com/podcast-player.js"
  defer
  data-api-base="https://ai.aproposmagazine.com"
></script>
```

Paste-klare midlertidige skaller (indtil AI-design er klar):  
[`docs/webflow-embeds/`](./webflow-embeds/)

## API

- `GET {apiBase}/api/podcast/public/episode?slug={slug}`
- `GET {apiBase}/api/podcast/public/episodes?limit=20`

## Lokal verifikation

Med `next dev`: åbn `http://localhost:3000/podcast-player-demo.html`
