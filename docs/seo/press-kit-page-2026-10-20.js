(function () {
  "use strict";

  function initializePressCopy() {
    var root = document.getElementById("press-main");
    if (!root) return;

    // Native scrolling respects the page-local offset below the sticky navigation.
    var contactLink = root.querySelector('a[href="#press-contact-heading"]');
    if (contactLink && contactLink.getAttribute("data-press-anchor-ready") !== "true") {
      contactLink.setAttribute("data-press-anchor-ready", "true");
      contactLink.addEventListener("click", function (event) {
        var heading = document.getElementById("press-contact-heading");
        if (!heading) return;
        event.preventDefault();
        event.stopPropagation();
        heading.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", "#press-contact-heading");
      });
    }

    var language = document.documentElement.lang || root.getAttribute("data-press-locale") || "da";
    var english = language.toLowerCase().indexOf("en") === 0;
    var copied = english ? "Description copied." : "Præsentationen er kopieret.";
    var selected = english ? "Text selected. Choose Copy in your browser." : "Teksten er markeret. Vælg Kopiér i din browser.";
    var unavailable = english ? "Select the description and copy it manually." : "Markér præsentationen og kopiér den manuelt.";

    root.querySelectorAll("[data-press-copy-target]").forEach(function (control) {
      if (control.getAttribute("data-press-copy-ready") === "true") return;
      var source = document.getElementById(control.getAttribute("data-press-copy-target"));
      var status = document.getElementById(control.getAttribute("aria-describedby"));
      if (!source || !status || !root.contains(source) || !root.contains(status)) return;

      // Webflow's native HTML importer preserves anchors; upgrade only these two controls.
      var button = control;
      if (control.tagName !== "BUTTON") {
        button = document.createElement("button");
        Array.from(control.attributes).forEach(function (attribute) {
          if (attribute.name !== "href" && attribute.name !== "target" && attribute.name !== "rel" && attribute.name !== "role") {
            button.setAttribute(attribute.name, attribute.value);
          }
        });
        button.textContent = control.textContent;
        control.replaceWith(button);
      }
      button.type = "button";
      button.setAttribute("data-press-copy-ready", "true");

      button.addEventListener("click", async function () {
        var paragraphs = Array.from(source.querySelectorAll("p"));
        var text = paragraphs.length ? paragraphs.map(function (paragraph) { return paragraph.textContent.trim(); }).join("\n\n") : source.textContent.trim();
        if (!text) return;
        button.disabled = true;
        status.textContent = "";
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("clipboard-unavailable");
          await navigator.clipboard.writeText(text);
          status.textContent = copied;
        } catch (error) {
          var selection = window.getSelection();
          if (selection) {
            var range = document.createRange();
            range.selectNodeContents(source);
            selection.removeAllRanges();
            selection.addRange(range);
            status.textContent = selected;
          } else {
            status.textContent = unavailable;
          }
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePressCopy, { once: true });
  } else {
    initializePressCopy();
  }
})();
