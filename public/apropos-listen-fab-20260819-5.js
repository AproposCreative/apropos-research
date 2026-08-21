(function () {
  var STICKY_SEL = ".progress-sticky";
  var LISTEN_SEL = "[data-apropos-podcast-listen]";
  var PLAYER_SEL = "[data-apropos-podcast-player]";
  var FAB_ID = "apropos-listen-fab";
  var STYLE_ID = "apropos-listen-fab-css";
  var booting = false;

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
      "@property --apropos-listen-a{",
      "syntax:'<angle>';inherits:false;initial-value:0deg;",
      "}",
      "@keyframes apropos-listen-spin{to{--apropos-listen-a:360deg}}",

      "#" + FAB_ID + "{",
      "position:fixed;right:max(16px,env(safe-area-inset-right));",
      "bottom:max(20px,env(safe-area-inset-bottom));",
      "z-index:998;isolation:isolate;",
      "display:inline-flex;align-items:center;gap:10px;",
      "min-height:44px;padding:12px 18px 12px 14px;margin:0;",
      "border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:14px;",
      "font-weight:500;letter-spacing:0.01em;line-height:1;white-space:nowrap;",
      "color:#fcfcfc;background:transparent;",
      "-webkit-tap-highlight-color:transparent;",
      "transform:translate3d(0,120%,0);opacity:0;pointer-events:none;",
      "transition:transform .5s cubic-bezier(.22,1,.36,1),opacity .35s ease;",
      "}",

      /* Soft 1px rotating edge — muted whites, not neon */
      "#" + FAB_ID + "::before{",
      "content:'';position:absolute;inset:-1px;border-radius:inherit;z-index:-2;",
      "background:conic-gradient(from var(--apropos-listen-a),",
      "rgba(255,255,255,0.05),rgba(255,255,255,0.55),rgba(255,255,255,0.08),",
      "rgba(255,255,255,0.35),rgba(255,255,255,0.05));",
      "animation:apropos-listen-spin 4s linear infinite;",
      "filter:blur(0.2px);",
      "}",

      /* Original glass fill on top */
      "#" + FAB_ID + "::after{",
      "content:'';position:absolute;inset:1px;border-radius:inherit;z-index:-1;",
      "background:rgba(18,18,18,0.55);",
      "-webkit-backdrop-filter:blur(18px) saturate(1.2);",
      "backdrop-filter:blur(18px) saturate(1.2);",
      "border:1px solid rgba(255,255,255,0.14);",
      "box-shadow:0 10px 40px rgba(0,0,0,0.28),0 0 18px rgba(255,255,255,0.08);",
      "}",

      "#" + FAB_ID + ".is-visible{",
      "transform:translate3d(0,0,0);opacity:1;pointer-events:auto;",
      "}",
      "#" + FAB_ID + " .apropos-listen-fab__icon,",
      "#" + FAB_ID + " .apropos-listen-fab__label{position:relative;z-index:1;}",
      "#" + FAB_ID + " .apropos-listen-fab__icon{",
      "display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 auto;",
      "}",
      "#" + FAB_ID + " .apropos-listen-fab__icon svg{display:block;width:18px;height:18px;}",
      "#" + FAB_ID + ":hover::after{",
      "background:rgba(18,18,18,0.7);border-color:rgba(255,255,255,0.22);",
      "box-shadow:0 10px 40px rgba(0,0,0,0.32),0 0 22px rgba(255,255,255,0.12);",
      "}",
      "#" + FAB_ID + ":focus-visible{outline:2px solid rgba(255,255,255,0.45);outline-offset:4px;}",

      "html:not(.apropos-theme-dark) #" + FAB_ID + ",body:not(.apropos-theme-dark) #" + FAB_ID + "{color:#121212;}",
      "html:not(.apropos-theme-dark) #" + FAB_ID + "::before,body:not(.apropos-theme-dark) #" + FAB_ID + "::before{",
      "background:conic-gradient(from var(--apropos-listen-a),",
      "rgba(18,18,18,0.05),rgba(18,18,18,0.35),rgba(18,18,18,0.06),",
      "rgba(18,18,18,0.22),rgba(18,18,18,0.05));",
      "}",
      "html:not(.apropos-theme-dark) #" + FAB_ID + "::after,body:not(.apropos-theme-dark) #" + FAB_ID + "::after{",
      "background:rgba(255,255,255,0.72);",
      "border-color:rgba(18,18,18,0.1);",
      "box-shadow:0 10px 36px rgba(0,0,0,0.12),0 0 16px rgba(255,255,255,0.35);",
      "}",
      "html:not(.apropos-theme-dark) #" + FAB_ID + ":hover::after,body:not(.apropos-theme-dark) #" + FAB_ID + ":hover::after{",
      "background:rgba(255,255,255,0.88);",
      "}",

      "@media (prefers-reduced-motion:reduce){",
      "#" + FAB_ID + "{transition:opacity .2s ease;transform:none;}",
      "#" + FAB_ID + ".is-visible{opacity:1;}",
      "#" + FAB_ID + "::before{animation:none;}",
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
      btn.classList.remove("is-visible");
      triggerListen();
      window.setTimeout(update, 80);
      window.setTimeout(update, 400);
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
    return el.getBoundingClientRect().top <= 1.5;
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
    var show = listenReady() && stickyStuck() && !playerOpen();
    fab.classList.toggle("is-visible", show);
    fab.setAttribute("aria-hidden", show ? "false" : "true");
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
