(function () {
  var STICKY_SEL = ".progress-sticky";
  var LISTEN_SEL = "[data-apropos-podcast-listen]";
  var PLAYER_SEL = "[data-apropos-podcast-player]";
  var FAB_ID = "apropos-listen-fab";
  var STYLE_ID = "apropos-listen-fab-css";
  var booting = false;

  function reduceMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function isEnglish() {
    try {
      if ((location.pathname || "").indexOf("/en/") === 0) return true;
      var lang = (document.documentElement.lang || "").toLowerCase();
      return lang.indexOf("en") === 0;
    } catch (e) {
      return false;
    }
  }

  function labelText() {
    return isEnglish() ? "Listen" : "Lyt til artiklen";
  }

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + FAB_ID + "{",
      "position:fixed;right:max(16px,env(safe-area-inset-right));",
      "bottom:max(20px,env(safe-area-inset-bottom));",
      "z-index:998;display:inline-flex;align-items:center;gap:10px;",
      "min-height:44px;padding:12px 18px 12px 14px;margin:0;border:0;",
      "border-radius:999px;cursor:pointer;font:inherit;font-size:14px;",
      "font-weight:500;letter-spacing:0.01em;line-height:1;white-space:nowrap;",
      "color:#fcfcfc;background:rgba(18,18,18,0.52);",
      "border:1px solid rgba(255,255,255,0.18);",
      "-webkit-backdrop-filter:blur(18px) saturate(1.2);",
      "backdrop-filter:blur(18px) saturate(1.2);",
      "box-shadow:0 10px 40px rgba(0,0,0,0.28);",
      "transform:translate3d(0,120%,0);opacity:0;pointer-events:none;",
      "transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .4s ease,background .2s ease,border-color .2s ease,bottom .35s ease;",
      "-webkit-tap-highlight-color:transparent;",
      "}",
      "#" + FAB_ID + ".is-visible{",
      "transform:translate3d(0,0,0);opacity:1;pointer-events:auto;",
      "}",
      "#" + FAB_ID + ".is-player-open{bottom:max(96px,calc(env(safe-area-inset-bottom) + 76px));}",
      "#" + FAB_ID + " .apropos-listen-fab__icon{",
      "display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 auto;",
      "}",
      "#" + FAB_ID + " .apropos-listen-fab__icon svg{display:block;width:18px;height:18px;}",
      "#" + FAB_ID + ":hover{background:rgba(18,18,18,0.68);border-color:rgba(255,255,255,0.28);}",
      "#" + FAB_ID + ":focus-visible{outline:2px solid rgba(255,255,255,0.45);outline-offset:3px;}",
      "html:not(.apropos-theme-dark) #" + FAB_ID + ",body:not(.apropos-theme-dark) #" + FAB_ID + "{",
      "color:#121212;background:rgba(255,255,255,0.62);",
      "border-color:rgba(18,18,18,0.12);",
      "box-shadow:0 10px 36px rgba(0,0,0,0.12);",
      "}",
      "html:not(.apropos-theme-dark) #" + FAB_ID + ":hover,body:not(.apropos-theme-dark) #" + FAB_ID + ":hover{",
      "background:rgba(255,255,255,0.82);border-color:rgba(18,18,18,0.2);",
      "}",
      "@media (prefers-reduced-motion:reduce){",
      "#" + FAB_ID + "{transition:opacity .2s ease;transform:none;}",
      "#" + FAB_ID + ".is-visible{opacity:1;}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function iconSvg() {
    return (
      '<span class="apropos-listen-fab__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4.5 12a3 3 0 0 1 3-3h1.25v6H7.5a3 3 0 0 1-3-3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M15.25 9H16.5a3 3 0 0 1 0 6h-1.25V9Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M8.75 15.5V8.75A3.25 3.25 0 0 1 12 5.5v0a3.25 3.25 0 0 1 3.25 3.25V15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      "</svg></span>"
    );
  }

  function ensureFab() {
    var existing = document.getElementById(FAB_ID);
    if (existing) return existing;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = FAB_ID;
    btn.setAttribute("aria-label", labelText());
    btn.innerHTML = iconSvg() + '<span class="apropos-listen-fab__label">' + labelText() + "</span>";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      triggerListen();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function listenReady() {
    var listen = document.querySelector(LISTEN_SEL);
    return !!(listen && listen.getAttribute("data-apropos-ready") === "1" && !listen.hidden);
  }

  function triggerListen() {
    var listen = document.querySelector(LISTEN_SEL);
    if (!listen) return;
    var btn =
      (listen.matches("button, a") && listen) ||
      listen.querySelector("button, a, [role='button']");
    if (btn) btn.click();
  }

  function stickyStuck() {
    var el = document.querySelector(STICKY_SEL);
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    var top = el.getBoundingClientRect().top;
    return top <= 1.5;
  }

  function playerOpen() {
    var player = document.querySelector(PLAYER_SEL);
    if (!player) return false;
    if (player.hasAttribute("hidden")) return false;
    if (player.getAttribute("aria-hidden") === "true") return false;
    var cs = window.getComputedStyle(player);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function update() {
    var fab = document.getElementById(FAB_ID);
    if (!fab) return;
    var show = listenReady() && stickyStuck();
    fab.classList.toggle("is-visible", show);
    fab.classList.toggle("is-player-open", playerOpen());
    var label = fab.querySelector(".apropos-listen-fab__label");
    if (label && label.textContent !== labelText()) {
      label.textContent = labelText();
      fab.setAttribute("aria-label", labelText());
    }
  }

  function boot() {
    if (booting) return;
    if (!document.querySelector(STICKY_SEL)) return;
    if (!document.querySelector(LISTEN_SEL)) return;
    booting = true;
    ensureCss();
    ensureFab();

    // Wait until podcast hydrator marks listen ready (or give up quietly)
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      update();
      if (listenReady() || tries > 40) window.clearInterval(timer);
    }, 250);

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    document.addEventListener("apropos:softnav", function () {
      setTimeout(update, 120);
    });

    // Observe player show/hide
    var player = document.querySelector(PLAYER_SEL);
    if (player && window.MutationObserver) {
      new MutationObserver(update).observe(player, {
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden", "class", "style"],
      });
    }
    var listen = document.querySelector(LISTEN_SEL);
    if (listen && window.MutationObserver) {
      new MutationObserver(update).observe(listen, {
        attributes: true,
        attributeFilter: ["hidden", "data-apropos-ready", "class"],
      });
    }

    update();
    booting = false;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 80);
    });
  } else {
    setTimeout(boot, 80);
  }
  window.addEventListener("load", function () {
    setTimeout(boot, 120);
  });
})();
