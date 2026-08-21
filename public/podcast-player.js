/**
 * Apropos Magazine — Webflow podcast hydrator
 * Hydrates designer shells via data-apropos-* attributes. Does not invent UI.
 *
 * Install (site footer):
 * <script src="https://ai.aproposmagazine.com/podcast-player.js" defer data-api-base="https://ai.aproposmagazine.com"></script>
 */
(function () {
  'use strict';

  var ATTR = {
    listen: 'data-apropos-podcast-listen',
    slug: 'data-apropos-podcast-slug',
    player: 'data-apropos-podcast-player',
    artwork: 'data-apropos-podcast-artwork',
    title: 'data-apropos-podcast-title',
    hosts: 'data-apropos-podcast-hosts',
    play: 'data-apropos-podcast-play',
    skipBack: 'data-apropos-podcast-skip-back',
    skipForward: 'data-apropos-podcast-skip-forward',
    speed: 'data-apropos-podcast-speed',
    volume: 'data-apropos-podcast-volume',
    mute: 'data-apropos-podcast-mute',
    sleep: 'data-apropos-podcast-sleep',
    progress: 'data-apropos-podcast-progress',
    time: 'data-apropos-podcast-time',
    currentTime: 'data-apropos-podcast-current-time',
    duration: 'data-apropos-podcast-duration',
    close: 'data-apropos-podcast-close',
    list: 'data-apropos-podcast-list',
    item: 'data-apropos-podcast-item',
    itemTitle: 'data-apropos-podcast-item-title',
    itemHosts: 'data-apropos-podcast-item-hosts',
    itemDate: 'data-apropos-podcast-item-date',
    itemPlay: 'data-apropos-podcast-item-play',
    itemLink: 'data-apropos-podcast-item-link',
  };

  /** Matches the iOS player: 15s back, 30s forward, same rate ladder. */
  var SKIP_BACK_SECONDS = 15;
  var SKIP_FORWARD_SECONDS = 30;
  var RATES = [1, 1.25, 1.5, 2, 0.75];
  /** Matches iOS sleep timer options (minutes). 0 = off. */
  var SLEEP_OPTIONS_MIN = [0, 15, 30, 45];
  var PROGRESS_STORE_KEY = 'apropos.podcast.progress';
  /** Cross-page continuity: Webflow is an MPA, so <audio> dies on navigation. */
  var SESSION_STORE_KEY = 'apropos.podcast.session';
  var SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  /** Fallback when episode has no cover and we're not on its article page. */
  var SHOW_COVER_FALLBACK = 'https://ai.aproposmagazine.com/podcast/show-cover.jpg';
  /** Don't resume when the listener is essentially at the start or the very end. */
  var RESUME_MIN_SECONDS = 10;
  var RESUME_TAIL_SECONDS = 15;

  /**
   * Fallback shell when the Webflow component is missing (Home, topics, …).
   * Classes match the designer component so site CSS + head overrides apply.
   */
  var PLAYER_SHELL =
    '<div data-apropos-podcast-player="" class="audio-player" hidden aria-hidden="true">' +
    '<div class="audio-player__card">' +
    '<div class="audio-player__controls">' +
    '<a aria-label="Skift afspilningshastighed" data-apropos-podcast-speed="" href="#" class="audio-player__speed w-button">1x</a>' +
    '<a aria-label="Spol 15 sekunder tilbage" data-apropos-podcast-skip-back="" href="#" class="audio-player__icon-btn w-button">' +
    '<img src="https://ai.aproposmagazine.com/podcast-icons/gobackward-15.svg" alt="" width="24" height="24" class="audio-player__icon"/>' +
    '</a>' +
    '<a aria-label="Afspil" data-apropos-podcast-play="" href="#" class="audio-player__play w-button">' +
    '<img src="https://ai.aproposmagazine.com/podcast-icons/play-fill.svg" alt="" width="24" height="26" class="audio-player__icon-play"/>' +
    '<img src="https://ai.aproposmagazine.com/podcast-icons/pause-fill.svg" alt="" width="22" height="24" class="audio-player__icon-pause"/>' +
    '</a>' +
    '<a aria-label="Spol 30 sekunder frem" data-apropos-podcast-skip-forward="" href="#" class="audio-player__icon-btn w-button">' +
    '<img src="https://cdn.prod.website-files.com/67dbf17ba540975b5b21c180/6a79bdfe6d2e4c061785746c_goforward-30.svg" alt="" width="24" height="24" class="audio-player__icon"/>' +
    '</a>' +
    '</div>' +
    '<div class="audio-player__meta">' +
    '<img data-apropos-podcast-artwork="" alt="" src="https://cdn.prod.website-files.com/67dbf17ba540975b5b21c180/67ed19b047d73997242e9f86_05AproposMagazine_Random.webp" class="audio-player__artwork"/>' +
    '<div class="audio-player__meta-text">' +
    '<div class="audio-player__title-row"><div class="audio-player__title-mask">' +
    '<p data-apropos-podcast-title="" class="audio-player__title">Artikeltitel</p>' +
    '</div></div>' +
    '<p data-apropos-podcast-hosts="" class="audio-player__hosts">Apropos Magazine</p>' +
    '</div></div>' +
    '<div class="audio-player__cluster">' +
    '<a aria-label="Slå lyd fra" data-apropos-podcast-mute="" href="#" class="audio-player__icon-btn w-button">' +
    '<img src="https://cdn.prod.website-files.com/67dbf17ba540975b5b21c180/6a79affdbf9530ed1ee1ad72_speaker-wave.svg" alt="" width="24" height="24" class="audio-player__icon"/>' +
    '</a>' +
    '<div class="audio-player__volume-wrap">' +
    '<input type="range" min="0" max="100" aria-label="Lydstyrke" data-apropos-podcast-volume="" class="audio-player__volume" value="100"/>' +
    '</div>' +
    '<a aria-label="Luk afspiller" data-apropos-podcast-close="" href="#" class="audio-player__close w-button">×</a>' +
    '</div>' +
    '<div class="audio-player__timeline">' +
    '<p data-apropos-podcast-current-time="" class="audio-player__time">0:00</p>' +
    '<input type="range" min="0" max="1000" aria-label="Position i lyden" data-apropos-podcast-progress="" class="audio-player__progress" value="0"/>' +
    '<p data-apropos-podcast-duration="" class="audio-player__time">0:00</p>' +
    '</div></div></div>';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function scriptEl() {
    return document.currentScript || qs('script[data-api-base][src*="podcast-player"]') || qs('script[src*="podcast-player"]');
  }

  function apiBase() {
    var el = scriptEl();
    var fromAttr = el && el.getAttribute('data-api-base');
    if (fromAttr) return fromAttr.replace(/\/$/, '');
    try {
      if (el && el.src) {
        var u = new URL(el.src);
        return u.origin;
      }
    } catch (e) {
      /* ignore */
    }
    return 'https://ai.aproposmagazine.com';
  }

  function slugFromPath() {
    var parts = location.pathname.split('/').filter(Boolean);
    var articlesIdx = parts.indexOf('articles');
    if (articlesIdx >= 0 && parts[articlesIdx + 1]) return parts[articlesIdx + 1];
    if (parts.length) return parts[parts.length - 1];
    return '';
  }

  function resolveSlug(listenRoot) {
    if (listenRoot) {
      var explicit = listenRoot.getAttribute(ATTR.slug);
      if (explicit && explicit.trim()) return explicit.trim();
    }
    var any = qs('[' + ATTR.slug + ']');
    if (any) {
      var v = any.getAttribute(ATTR.slug);
      if (v && v.trim()) return v.trim();
    }
    return slugFromPath();
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text == null ? '' : String(text);
  }

  /** Only replaces label text when the control is plain text, so custom icons survive. */
  function setControlLabel(el, text) {
    if (!el || el.children.length > 0) return;
    el.textContent = text;
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    var total = Math.floor(sec);
    var s = total % 60;
    var m = Math.floor(total / 60) % 60;
    var h = Math.floor(total / 3600);
    var mm = h > 0 && m < 10 ? '0' + m : String(m);
    return (h > 0 ? h + ':' : '') + mm + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatRate(rate) {
    // Match iOS / screenshot labels: 1x, 1.25x, …
    var label = Number(rate.toFixed(2)).toString();
    return label + 'x';
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('da-DK', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function show(el, on) {
    if (!el) return;
    var isPlayer = el.hasAttribute('data-apropos-podcast-player');
    var isListen = el.hasAttribute(ATTR.listen);
    if (on) {
      el.removeAttribute('hidden');
      el.setAttribute('aria-hidden', 'false');
      if (isListen) {
        // Let CSS use display:contents so the btn_fill pill joins the short-info row.
        el.style.removeProperty('display');
      }
      if (isPlayer) {
        el.classList.remove('is-open');
        void el.offsetWidth;
        requestAnimationFrame(function () {
          el.classList.add('is-open');
          scheduleTitleMarquee(el);
        });
      } else {
        el.classList.add('is-open');
      }
    } else {
      el.setAttribute('aria-hidden', 'true');
      el.classList.remove('is-open');
      if (isPlayer) {
        window.setTimeout(function () {
          if (!el.classList.contains('is-open')) el.setAttribute('hidden', '');
        }, 720);
      } else {
        el.setAttribute('hidden', '');
      }
    }
  }

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_STORE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(PROGRESS_STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* storage may be unavailable */
    }
  }

  function savePosition() {
    var a = state.audio;
    if (!a || !state.episode || !state.episode.id) return;
    var store = readStore();
    if (a.currentTime < RESUME_MIN_SECONDS) {
      delete store[state.episode.id];
    } else {
      store[state.episode.id] = Math.floor(a.currentTime);
    }
    writeStore(store);
  }

  function savedPosition(episode) {
    if (!episode || !episode.id) return 0;
    var value = readStore()[episode.id];
    return typeof value === 'number' && isFinite(value) ? value : 0;
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.episode || !s.episode.audioURL) return null;
      if (s.ts && Date.now() - s.ts > SESSION_MAX_AGE_MS) {
        sessionStorage.removeItem(SESSION_STORE_KEY);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_STORE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function saveSession() {
    try {
      if (state.sessionClosed) {
        clearSession();
        return;
      }
      if (!state.episode || !state.episode.audioURL) return;
      var a = state.audio;
      var root = playerRoot();
      var open = !!(root && (root.classList.contains('is-open') || !root.hasAttribute('hidden')));
      // Prefer wantPlay: browsers pause <audio> before pagehide, which would otherwise drop resume.
      var playing = !!state.wantPlay || !!(a && !a.paused && !a.ended);
      if (!open && !playing) return;
      // Freeze artwork onto the episode so the next page cannot replace it with its og:image.
      attachArtwork(state.episode);
      sessionStorage.setItem(
        SESSION_STORE_KEY,
        JSON.stringify({
          v: 1,
          episode: state.episode,
          t: a ? a.currentTime : 0,
          playing: playing,
          open: open || playing,
          rateIndex: state.rateIndex,
          volume: a ? a.volume : 1,
          muted: !!(a && a.muted),
          ts: Date.now(),
        })
      );
    } catch (e) {
      /* sessionStorage may be unavailable */
    }
  }

  var state = {
    audio: null,
    episode: null,
    seeking: false,
    rateIndex: 0,
    sleepIndex: 0,
    sleepTimerId: null,
    sessionClosed: false,
    lastSessionWrite: 0,
    /** User/intent to keep playing across MPA navigations (browser pauses audio before pagehide). */
    wantPlay: false,
    softNavInFlight: false,
    softNavWired: false,
  };

  function ensurePlayerMounted() {
    var players = qsa('[' + ATTR.player + ']');
    if (players.length > 1) {
      // Keep the last instance (usually footer/injected); remove designer duplicates.
      for (var i = 0; i < players.length - 1; i++) {
        if (players[i].parentNode) players[i].parentNode.removeChild(players[i]);
      }
    }
    if (playerRoot()) return playerRoot();
    var wrap = document.createElement('div');
    wrap.innerHTML = PLAYER_SHELL;
    var node = wrap.firstElementChild;
    if (node) document.body.appendChild(node);
    return node;
  }

  function ensureAudio() {
    if (state.audio) return state.audio;
    var a = document.createElement('audio');
    a.preload = 'metadata';
    a.setAttribute('playsinline', '');
    document.body.appendChild(a);
    state.audio = a;

    a.addEventListener('timeupdate', function () {
      onTimeUpdate();
      // Throttle session writes while playing across navigations.
      if (Date.now() - state.lastSessionWrite > 2000) {
        state.lastSessionWrite = Date.now();
        saveSession();
      }
    });
    a.addEventListener('loadedmetadata', onTimeUpdate);
    a.addEventListener('durationchange', onTimeUpdate);
    a.addEventListener('play', function () {
      state.sessionClosed = false;
      syncPlayUi();
      saveSession();
    });
    a.addEventListener('pause', function () {
      savePosition();
      syncPlayUi();
      saveSession();
    });
    a.addEventListener('ended', function () {
      state.wantPlay = false;
      savePosition();
      syncPlayUi();
      saveSession();
    });
    window.addEventListener('pagehide', function () {
      savePosition();
      saveSession();
    });
    window.addEventListener('beforeunload', function () {
      savePosition();
      saveSession();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        savePosition();
        saveSession();
      }
    });
    return a;
  }

  function playerRoot() {
    return qs('[' + ATTR.player + ']');
  }

  function onTimeUpdate() {
    var a = state.audio;
    var root = playerRoot();
    if (!a || !root) return;
    var dur = a.duration;
    var hasDuration = isFinite(dur) && dur > 0;

    if (!state.seeking) {
      var progress = qs('[' + ATTR.progress + ']', root);
      if (progress && hasDuration) {
        var max = Number(progress.max) || 1000;
        progress.value = String(Math.round((a.currentTime / dur) * max));
      }
      setText(qs('[' + ATTR.currentTime + ']', root), formatTime(a.currentTime));
      setText(
        qs('[' + ATTR.time + ']', root),
        formatTime(a.currentTime) + ' / ' + formatTime(hasDuration ? dur : 0)
      );
    }
    // Spotify-style: total duration on the right of the progress bar
    setText(qs('[' + ATTR.duration + ']', root), formatTime(hasDuration ? dur : 0));
  }

  function syncPlayUi() {
    var root = playerRoot();
    if (!root) return;
    var playing = !!(state.audio && !state.audio.paused);
    root.classList.toggle('is-playing', playing);
    document.documentElement.classList.toggle('apropos-podcast-playing', playing);
    var btn = qs('[' + ATTR.play + ']', root);
    if (btn) {
      btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      btn.setAttribute('aria-label', playing ? 'Pause' : 'Afspil');
      setControlLabel(btn, playing ? 'Pause' : 'Afspil');
    }
  }

  function applyRate() {
    var rate = RATES[state.rateIndex] || 1;
    if (state.audio) state.audio.playbackRate = rate;
    var root = playerRoot();
    if (!root) return;
    var btn = qs('[' + ATTR.speed + ']', root);
    if (btn) {
      setControlLabel(btn, formatRate(rate));
      btn.setAttribute('aria-label', 'Hastighed ' + formatRate(rate) + '. Skift hastighed');
    }
  }

  function skip(seconds) {
    var a = state.audio;
    if (!a || !state.episode) return;
    var dur = isFinite(a.duration) ? a.duration : null;
    var next = a.currentTime + seconds;
    if (next < 0) next = 0;
    if (dur !== null && next > dur) next = dur;
    a.currentTime = next;
    onTimeUpdate();
  }

  function pageArtwork() {
    var meta = qs('meta[property="og:image"]') || qs('meta[name="twitter:image"]');
    return (meta && meta.getAttribute('content')) || '';
  }

  /**
   * Prefer episode.artworkURL. Only use this page's og:image when we are on that
   * episode's article — never borrow the next article's hero on navigation.
   */
  function resolveArtwork(episode) {
    if (episode && episode.artworkURL) return episode.artworkURL;
    var slug = episode && episode.articleSlug;
    if (slug && slugFromPath() === slug) {
      var fromPage = pageArtwork();
      if (fromPage) return fromPage;
    }
    return SHOW_COVER_FALLBACK;
  }

  function attachArtwork(episode) {
    if (!episode) return episode;
    if (!episode.artworkURL) {
      var resolved = resolveArtwork(episode);
      if (resolved) episode.artworkURL = resolved;
    }
    return episode;
  }

  function syncTitleMarquee(root) {
    root = root || playerRoot();
    var title = qs('[' + ATTR.title + ']', root);
    if (!title || !root) return;

    var mask = title.closest
      ? title.closest('.audio-player__title-mask')
      : null;
    if (!mask) mask = title.parentElement;
    if (!mask) return;

    title.classList.remove('is-marquee');
    title.style.removeProperty('--marquee-shift');
    title.style.removeProperty('animation-duration');
    title.style.display = 'inline-block';
    title.style.whiteSpace = 'nowrap';
    title.style.maxWidth = 'none';
    title.style.width = 'auto';
    title.style.transform = 'translate3d(0,0,0)';

    // Player must be visible for a reliable overflow measurement.
    if (root.hasAttribute('hidden') || !root.classList.contains('is-open')) return;
    if (mask.clientWidth < 8) return;

    void title.offsetWidth;
    var overflow = Math.ceil(title.scrollWidth - mask.clientWidth);
    if (overflow > 4) {
      // Negative shift moves the title left → right edge becomes readable.
      title.style.setProperty('--marquee-shift', -overflow + 'px');
      // Slow: ~12px/s, clamped for short/long titles.
      var duration = Math.max(18, Math.min(48, overflow / 12));
      title.style.animationDuration = duration + 's';
      title.classList.add('is-marquee');
    }
  }

  function scheduleTitleMarquee(root) {
    root = root || playerRoot();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        syncTitleMarquee(root);
        // Remeasure after the open slide finishes — mask width can change.
        window.setTimeout(function () {
          syncTitleMarquee(root);
        }, 780);
      });
    });
  }

  function fillPlayer(episode) {
    var root = playerRoot();
    if (!root || !episode) return;
    setText(qs('[' + ATTR.title + ']', root), episode.title || '');
    setText(qs('[' + ATTR.hosts + ']', root), (episode.hosts || []).join(', ') || episode.subtitle || '');
    scheduleTitleMarquee(root);

    var art = qs('[' + ATTR.artwork + ']', root);
    if (art) {
      var src = resolveArtwork(episode);
      if (src) {
        art.setAttribute('src', src);
        art.setAttribute('alt', episode.title ? 'Cover for ' + episode.title : '');
        art.style.display = '';
      } else {
        art.removeAttribute('src');
        art.style.display = 'none';
      }
    }
  }

  function updateMediaSession(episode) {
    if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
    var artwork = resolveArtwork(episode);
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: episode.title || 'Apropos Magazine',
        artist: (episode.hosts || []).join(', ') || 'Apropos Magazine',
        album: 'Apropos Magazine',
        artwork: artwork ? [{ src: artwork }] : [],
      });
      navigator.mediaSession.setActionHandler('play', function () {
        state.wantPlay = true;
        var a = ensureAudio();
        var p = a.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      });
      navigator.mediaSession.setActionHandler('pause', function () {
        state.wantPlay = false;
        if (state.audio) state.audio.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', function () {
        skip(-SKIP_BACK_SECONDS);
      });
      navigator.mediaSession.setActionHandler('seekforward', function () {
        skip(SKIP_FORWARD_SECONDS);
      });
    } catch (e) {
      /* media session is best effort */
    }
  }

  function openEpisode(episode, autoplay, opts) {
    if (!episode || !episode.audioURL) return;
    opts = opts || {};
    state.sessionClosed = false;
    attachArtwork(episode);
    var isNewEpisode = !state.episode || state.episode.id !== episode.id;
    state.episode = episode;
    fillPlayer(episode);
    var a = ensureAudio();
    if (opts.volume != null && isFinite(opts.volume)) a.volume = Math.min(1, Math.max(0, opts.volume));
    if (opts.muted != null) a.muted = !!opts.muted;
    if (isNewEpisode || !a.src || a.src.indexOf(episode.audioURL.split('?')[0]) === -1) {
      a.src = episode.audioURL;
      var resumeAt =
        opts.seekTo != null && isFinite(opts.seekTo) ? Number(opts.seekTo) : savedPosition(episode);
      if (resumeAt > 0) {
        a.addEventListener(
          'loadedmetadata',
          function () {
            var dur = a.duration;
            if (!isFinite(dur) || resumeAt < dur - RESUME_TAIL_SECONDS) a.currentTime = resumeAt;
            onTimeUpdate();
          },
          { once: true }
        );
      }
    } else if (opts.seekTo != null && isFinite(opts.seekTo) && opts.seekTo > 0) {
      try {
        a.currentTime = Number(opts.seekTo);
      } catch (e) {
        /* ignore seek race */
      }
    }
    applyRate();
    updateMediaSession(episode);
    show(playerRoot(), true);
    scheduleTitleMarquee(playerRoot());
    if (autoplay !== false) {
      state.wantPlay = true;
      var p = a.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          // Browser autoplay policy after MPA navigation — keep wantPlay so next hop retries.
          syncPlayUi();
          saveSession();
        });
      }
    }
    syncPlayUi();
    onTimeUpdate();
    saveSession();
  }

  function closePlayer() {
    state.wantPlay = false;
    if (state.audio) {
      savePosition();
      state.audio.pause();
    }
    state.sessionClosed = true;
    clearSession();
    show(playerRoot(), false);
    syncPlayUi();
  }

  function restoreSession() {
    var session = readSession();
    if (!session || !session.episode) return false;
    if (!(session.playing || session.open)) return false;
    if (typeof session.rateIndex === 'number' && session.rateIndex >= 0) {
      state.rateIndex = session.rateIndex % RATES.length;
    }
    if (session.playing) state.wantPlay = true;
    openEpisode(session.episode, !!session.playing, {
      seekTo: session.t || 0,
      volume: session.volume,
      muted: session.muted,
    });
    return true;
  }

  function onControlClick(root, attr, handler) {
    var el = qs('[' + attr + ']', root);
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      handler();
    });
  }

  function wirePlayerControls() {
    var root = playerRoot();
    if (!root || root.getAttribute('data-apropos-wired') === '1') return;
    root.setAttribute('data-apropos-wired', '1');

    onControlClick(root, ATTR.play, function () {
      var a = ensureAudio();
      if (!state.episode) return;
      if (a.paused) {
        state.wantPlay = true;
        var p = a.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } else {
        state.wantPlay = false;
        a.pause();
      }
    });

    onControlClick(root, ATTR.skipBack, function () {
      skip(-SKIP_BACK_SECONDS);
    });

    onControlClick(root, ATTR.skipForward, function () {
      skip(SKIP_FORWARD_SECONDS);
    });

    onControlClick(root, ATTR.speed, function () {
      state.rateIndex = (state.rateIndex + 1) % RATES.length;
      applyRate();
    });

    onControlClick(root, ATTR.close, closePlayer);

    onControlClick(root, ATTR.mute, function () {
      var a = ensureAudio();
      a.muted = !a.muted;
      root.classList.toggle('is-muted', a.muted);
      var muteBtn = qs('[' + ATTR.mute + ']', root);
      if (muteBtn) muteBtn.setAttribute('aria-pressed', a.muted ? 'true' : 'false');
      var volumeEl = qs('[' + ATTR.volume + ']', root);
      if (volumeEl && !a.muted) {
        var max = Number(volumeEl.max) || 100;
        volumeEl.value = String(Math.round(a.volume * max));
      }
    });

    onControlClick(root, ATTR.sleep, function () {
      state.sleepIndex = (state.sleepIndex + 1) % SLEEP_OPTIONS_MIN.length;
      if (state.sleepTimerId) {
        clearTimeout(state.sleepTimerId);
        state.sleepTimerId = null;
      }
      var minutes = SLEEP_OPTIONS_MIN[state.sleepIndex];
      var sleepBtn = qs('[' + ATTR.sleep + ']', root);
      if (sleepBtn) {
        sleepBtn.setAttribute(
          'aria-label',
          minutes ? 'Sovetimer ' + minutes + ' min' : 'Sovetimer slået fra'
        );
        sleepBtn.classList.toggle('is-active', minutes > 0);
      }
      if (minutes > 0) {
        state.sleepTimerId = setTimeout(function () {
          state.wantPlay = false;
          if (state.audio) state.audio.pause();
          state.sleepTimerId = null;
          state.sleepIndex = 0;
          if (sleepBtn) {
            sleepBtn.classList.remove('is-active');
            sleepBtn.setAttribute('aria-label', 'Sovetimer slået fra');
          }
        }, minutes * 60 * 1000);
      }
    });

    var volume = qs('[' + ATTR.volume + ']', root);
    if (volume) {
      volume.addEventListener('input', function () {
        var a = ensureAudio();
        var max = Number(volume.max) || 100;
        var next = Number(volume.value) / max;
        a.volume = Math.min(1, Math.max(0, next));
        a.muted = a.volume === 0;
        root.classList.toggle('is-muted', a.muted);
        var muteBtn = qs('[' + ATTR.mute + ']', root);
        if (muteBtn) muteBtn.setAttribute('aria-pressed', a.muted ? 'true' : 'false');
      });
    }

    var progress = qs('[' + ATTR.progress + ']', root);
    if (progress) {
      var seekTo = function () {
        var a = ensureAudio();
        var dur = a.duration;
        if (!isFinite(dur) || dur <= 0) return;
        var max = Number(progress.max) || 1000;
        a.currentTime = (Number(progress.value) / max) * dur;
      };
      progress.addEventListener('pointerdown', function () {
        state.seeking = true;
      });
      progress.addEventListener('pointerup', function () {
        state.seeking = false;
      });
      progress.addEventListener('input', function () {
        state.seeking = true;
        seekTo();
        setText(
          qs('[' + ATTR.currentTime + ']', root),
          formatTime(state.audio ? state.audio.currentTime : 0)
        );
      });
      progress.addEventListener('change', function () {
        seekTo();
        state.seeking = false;
        savePosition();
        onTimeUpdate();
      });
    }

    applyRate();
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function hydrateListen() {
    var listen = qs('[' + ATTR.listen + ']');
    if (!listen) return Promise.resolve();

    var slug = resolveSlug(listen);
    if (!slug) {
      show(listen, false);
      return Promise.resolve();
    }

    var url = apiBase() + '/api/podcast/public/episode?slug=' + encodeURIComponent(slug);
    return fetchJson(url)
      .then(function (res) {
        var ep = res.body && res.body.found ? res.body.episode : null;
        if (!ep) {
          show(listen, false);
          return;
        }
        show(listen, true);
        listen.setAttribute('data-apropos-ready', '1');
        var btn = listen.matches('button, a') ? listen : qs('button, a, [role="button"]', listen) || listen;
        if (btn.getAttribute('data-apropos-wired') === '1') return;
        btn.setAttribute('data-apropos-wired', '1');
        if (savedPosition(ep) > 0) setControlLabel(btn, 'Forts\u00e6t lytning');
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          openEpisode(ep, true);
        });
      })
      .catch(function () {
        show(listen, false);
      });
  }

  function hydrateList() {
    var list = qs('[' + ATTR.list + ']');
    if (!list) return Promise.resolve();

    var template = qs('[' + ATTR.item + ']', list);
    if (!template) return Promise.resolve();

    var limitAttr = list.getAttribute('data-limit');
    var limit = limitAttr ? parseInt(limitAttr, 10) : 20;
    if (!isFinite(limit) || limit < 1) limit = 20;

    var url = apiBase() + '/api/podcast/public/episodes?limit=' + encodeURIComponent(String(limit));
    return fetchJson(url)
      .then(function (res) {
        var episodes = (res.body && res.body.episodes) || [];
        // Remove previous clones
        qsa('[' + ATTR.item + ']:not([data-apropos-template])', list).forEach(function (node) {
          if (node !== template) node.parentNode && node.parentNode.removeChild(node);
        });
        template.setAttribute('data-apropos-template', '1');
        template.setAttribute('hidden', '');

        episodes.forEach(function (ep) {
          var node = template.cloneNode(true);
          node.removeAttribute('data-apropos-template');
          node.removeAttribute('hidden');
          node.removeAttribute('id');
          setText(qs('[' + ATTR.itemTitle + ']', node), ep.title || '');
          setText(qs('[' + ATTR.itemHosts + ']', node), (ep.hosts || []).join(', '));
          var dateEl = qs('[' + ATTR.itemDate + ']', node);
          if (dateEl) {
            var label = formatDate(ep.publishedAt);
            setText(dateEl, label);
            if (ep.publishedAt) dateEl.setAttribute('datetime', ep.publishedAt);
          }
          var link = qs('[' + ATTR.itemLink + ']', node);
          if (link && ep.articleUrl) {
            link.setAttribute('href', ep.articleUrl);
          }
          var play = qs('[' + ATTR.itemPlay + ']', node) || node;
          play.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('a[' + ATTR.itemLink + ']')) return;
            e.preventDefault();
            openEpisode(ep, true);
          });
          list.appendChild(node);
        });
      })
      .catch(function () {
        /* leave template hidden */
      });
  }

  function isPlayingNow() {
    return !!(state.audio && !state.audio.paused && !state.audio.ended);
  }

  function shouldKeepAudioAlive() {
    return !!state.wantPlay || isPlayingNow();
  }

  function isSoftNavCandidate(anchor, event) {
    if (!anchor || !shouldKeepAudioAlive()) return false;
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    var raw = anchor.getAttribute('href');
    if (!raw || raw.charAt(0) === '#') return false;
    var lower = raw.toLowerCase();
    if (
      lower.indexOf('mailto:') === 0 ||
      lower.indexOf('tel:') === 0 ||
      lower.indexOf('javascript:') === 0
    ) {
      return false;
    }
    var url;
    try {
      url = new URL(anchor.href, location.href);
    } catch (e) {
      return false;
    }
    if (url.origin !== location.origin) return false;
    if (url.pathname === location.pathname && url.search === location.search) return false;
    return true;
  }

  function stripIncomingPlayers(root) {
    if (!root || !root.querySelectorAll) return;
    qsa('[' + ATTR.player + ']', root).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function reinitWebflow() {
    try {
      if (!window.Webflow) return;
      if (typeof window.Webflow.destroy === 'function') window.Webflow.destroy();
      if (typeof window.Webflow.ready === 'function') window.Webflow.ready();
      if (typeof window.Webflow.require === 'function') {
        var ix2 = window.Webflow.require('ix2');
        if (ix2 && typeof ix2.init === 'function') ix2.init();
      }
    } catch (e) {
      /* Webflow runtime is best-effort after soft nav */
    }
  }

  function afterSoftNav() {
    // New page may include its own player shell — keep the live one with audio.
    ensurePlayerMounted();
    wirePlayerControls();
    show(playerRoot(), true);
    syncPlayUi();
    onTimeUpdate();
    scheduleTitleMarquee(playerRoot());
    return Promise.all([hydrateListen(), hydrateList()]).then(function () {
      reinitWebflow();
      // If something paused during swap, resume.
      if (state.wantPlay && state.audio && state.audio.paused) {
        var p = state.audio.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    });
  }

  function softNavigate(url, opts) {
    opts = opts || {};
    if (state.softNavInFlight) return Promise.resolve();
    state.softNavInFlight = true;
    saveSession();
    document.documentElement.classList.add('apropos-podcast-softnav');

    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then(function (res) {
        if (!res.ok) throw new Error('soft-nav ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.body) throw new Error('soft-nav parse');

        var audio = state.audio;
        var player = playerRoot();
        var persist = [];
        if (audio) persist.push(audio);
        if (player) {
          player.setAttribute('data-apropos-persist', '1');
          persist.push(player);
        }

        document.title = doc.title || document.title;

        // Drop old body nodes except the live audio + player.
        Array.prototype.slice.call(document.body.childNodes).forEach(function (node) {
          if (persist.indexOf(node) !== -1) return;
          document.body.removeChild(node);
        });

        // Import new markup, skip scripts/noscript (already booted) and player shells.
        Array.prototype.slice.call(doc.body.childNodes).forEach(function (node) {
          if (node.nodeType === 1) {
            var tag = node.tagName;
            if (tag === 'SCRIPT' || tag === 'NOSCRIPT') return;
            if (node.hasAttribute && node.hasAttribute(ATTR.player)) return;
            stripIncomingPlayers(node);
          }
          document.body.appendChild(document.importNode(node, true));
        });

        persist.forEach(function (node) {
          document.body.appendChild(node);
        });

        if (!opts.replace) {
          history.pushState({ aproposPodcastSoft: 1 }, '', url);
        } else {
          history.replaceState({ aproposPodcastSoft: 1 }, '', url);
        }
        try {
          document.dispatchEvent(new CustomEvent('apropos:softnav', { detail: { url: url } }));
        } catch (e) {}
        if (window.AproposTheme && typeof window.AproposTheme.apply === 'function') {
          window.AproposTheme.apply();
        }
        window.scrollTo(0, 0);
        return afterSoftNav();
      })
      .catch(function () {
        // Fall back to hard navigation — session restore will try to resume.
        saveSession();
        location.href = url;
      })
      .then(function () {
        state.softNavInFlight = false;
        document.documentElement.classList.remove('apropos-podcast-softnav');
      });
  }

  function wireSoftNavigation() {
    if (state.softNavWired) return;
    state.softNavWired = true;

    document.addEventListener(
      'click',
      function (e) {
        var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!isSoftNavCandidate(anchor, e)) return;
        e.preventDefault();
        softNavigate(anchor.href);
      },
      true
    );

    window.addEventListener('popstate', function (e) {
      // Only handle history entries we created — never hijack normal back/forward.
      if (!e.state || !e.state.aproposPodcastSoft) return;
      if (!shouldKeepAudioAlive()) {
        location.reload();
        return;
      }
      softNavigate(location.href, { replace: true });
    });
  }

  function retryAutoplay() {
    if (!state.wantPlay || !state.audio || !state.audio.paused) return;
    var p = state.audio.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function boot() {
    ensurePlayerMounted();
    wirePlayerControls();
    wireSoftNavigation();
    var restored = restoreSession();
    if (!restored) show(playerRoot(), false);
    else {
      // Hard navigation fallback: retry autoplay a few times (Safari is strict).
      window.setTimeout(retryAutoplay, 0);
      window.setTimeout(retryAutoplay, 250);
      window.setTimeout(retryAutoplay, 800);
      window.addEventListener('pageshow', retryAutoplay);
      document.addEventListener(
        'pointerdown',
        function once() {
          retryAutoplay();
          document.removeEventListener('pointerdown', once, true);
        },
        true
      );
    }
    var marqueeTimer = null;
    window.addEventListener('resize', function () {
      if (marqueeTimer) window.clearTimeout(marqueeTimer);
      marqueeTimer = window.setTimeout(function () {
        syncTitleMarquee(playerRoot());
      }, 120);
    });
    return Promise.all([hydrateListen(), hydrateList()]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
