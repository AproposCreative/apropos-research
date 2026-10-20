/* Page-local enhancement. The presentation remains readable without JavaScript. */
document.addEventListener("DOMContentLoaded", function () {
  var button = document.getElementById("press-copy-button");
  var copy = document.getElementById("press-boilerplate");
  var status = document.getElementById("press-copy-status");
  if (!button || !copy || !status) return;
  // Webflow's native button element exports an anchor. Use a real button so
  // keyboard activation and button semantics do not depend on link behavior.
  if (button.tagName !== "BUTTON") {
    var nativeButton = document.createElement("button");
    nativeButton.id = button.id;
    nativeButton.className = button.className;
    nativeButton.type = "button";
    nativeButton.textContent = button.textContent;
    button.replaceWith(nativeButton);
    button = nativeButton;
  }
  button.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(copy.textContent.trim());
      status.textContent = "Præsentationen er kopieret.";
    } catch (_) {
      var range = document.createRange();
      range.selectNodeContents(copy);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = "Teksten er markeret. Vælg Kopiér i din browser.";
    }
  });
});
