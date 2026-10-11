/**
 * PetaKlien - Kumo-style Tooltip
 * Replaces the browser's native `title` tooltip with Kumo's Tooltip look
 * (base surface, line outline, arrow, 150 ms scale/fade), shown above the
 * element after a short delay. The `title` attribute stays the source of truth:
 * it is parked in data-pk-tip while the tooltip is open and restored afterwards.
 */

(function (root) {
  "use strict";

  const DELAY_MS = 500;
  const OFFSET = 10;
  const MARGIN = 8;

  /**
   * @param {object} opts
   * @param {Element} opts.host   where the tooltip element lives (gets the theme tokens)
   * @param {Element} [opts.scope] only elements inside it get the custom tooltip
   * @param {string} [opts.className]
   */
  function installTooltips({ host, scope = host, className = "pk-tooltip" } = {}) {
    if (!host || host.__pkTooltip) return null;
    const doc = host.ownerDocument || document;
    const tip = doc.createElement("div");
    tip.className = className;
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    const text = doc.createElement("span");
    const arrow = doc.createElement("span");
    arrow.className = className + "-arrow";
    tip.append(text, arrow);
    host.appendChild(tip);

    let target = null;
    let timer = null;

    function park(el) {
      const t = el.getAttribute("title");
      if (t) {
        el.dataset.pkTip = t;
        el.removeAttribute("title"); // no native tooltip on top of ours
      }
    }
    function unpark(el) {
      if (!el || el.dataset.pkTip === undefined) return;
      // code may have set a fresh title while it was open; keep that one
      if (!el.hasAttribute("title")) el.setAttribute("title", el.dataset.pkTip);
      delete el.dataset.pkTip;
    }

    function place() {
      if (!target || !target.isConnected) return hide();
      const r = target.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const vw = doc.documentElement.clientWidth;
      let side = "top";
      let top = r.top - h - OFFSET;
      if (top < MARGIN) { side = "bottom"; top = r.bottom + OFFSET; }
      const center = r.left + r.width / 2;
      const left = Math.min(Math.max(center - w / 2, MARGIN), vw - w - MARGIN);
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.dataset.side = side;
      arrow.style.left = `${Math.round(Math.min(Math.max(center - left, 10), w - 10))}px`;
    }

    function show() {
      const t = target && target.dataset.pkTip;
      if (!t) return;
      text.textContent = t;
      tip.hidden = false;
      tip.classList.remove("is-open");
      place();
      requestAnimationFrame(() => tip.classList.add("is-open"));
    }

    function hide() {
      clearTimeout(timer);
      tip.classList.remove("is-open");
      tip.hidden = true;
      unpark(target);
      target = null;
    }

    function enter(el, delay) {
      if (el === target) return;
      hide();
      if (!el || !scope.contains(el) || tip.contains(el)) return;
      target = el;
      park(el);
      timer = setTimeout(show, delay);
    }

    const titled = (node) => (node && node.closest ? node.closest("[title], [data-pk-tip]") : null);

    doc.addEventListener("pointerover", (e) => enter(titled(e.target), DELAY_MS), true);
    doc.addEventListener("pointerout", (e) => {
      if (target && !(e.relatedTarget && target.contains(e.relatedTarget))) hide();
    }, true);
    doc.addEventListener("focusin", (e) => {
      if (e.target.matches && e.target.matches(":focus-visible")) enter(titled(e.target), 0);
    }, true);
    doc.addEventListener("focusout", hide, true);
    doc.addEventListener("pointerdown", hide, true);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, true);
    (doc.defaultView || window).addEventListener("scroll", hide, true);

    host.__pkTooltip = { hide };
    return host.__pkTooltip;
  }

  const api = { installTooltips };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.PetaKlienTooltip = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
