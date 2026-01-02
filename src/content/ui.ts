import type { Settings } from "../utils/types";

let panelEl: HTMLElement | null = null;
let postBarEl: HTMLElement | null = null;
let pill: HTMLButtonElement | null = null;
let busyMask: HTMLElement | null = null;
let panelOpenedAt = 0;

let toneValue: Settings["tone"] = "professional";
let lengthValue: Settings["length"] = "keep";
let modelValue: Settings["model"] = "gpt-4o-mini";
let contextValue = "";
let includeThreadContext = false;

/** Create a floating pill that follows the caret. */
export function ensurePill(opts: {
  onClick: () => void;
  onPolish: () => void;
  onGrammar: () => void;
}) {
  if (pill) return;

  pill = document.createElement("button");
  pill.id = "ep-pill";
  pill.textContent = "Polish ✨";
  pill.style.cssText =
    "position:fixed; left:-9999px; top:-9999px; padding:6px 10px; border-radius:999px; background:#1a73e8; color:#fff; border:none; box-shadow:0 2px 6px rgba(0,0,0,.2); cursor:pointer; z-index:2147483646; display:none; pointer-events:none;";

  // Prevent focus/blur race
  pill.addEventListener(
    "mousedown",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  pill.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onClick?.();
    },
    true
  );

  document.body.appendChild(pill);

  // Wire action buttons when panel is present
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target as HTMLElement;
      if (t?.id === "ep-polish") opts.onPolish();
      if (t?.id === "ep-grammar") opts.onGrammar();
    },
    true
  );
}

export function showPill() {
  if (pill) {
    pill.style.display = "inline-block";
    pill.style.pointerEvents = "auto";
  }
}
export function hidePill() {
  if (pill) {
    pill.style.display = "none";
    pill.style.pointerEvents = "none";
  }
}
export function setPillPointerEvents(enabled: boolean) {
  if (!pill) return;
  pill.style.pointerEvents = enabled ? "auto" : "none";
}

/** Position pill next to caret, but ONLY using rects from contenteditable. */
export function updatePillPositionNearCaret(scopeEl?: HTMLElement) {
  if (!pill) return;
  const r = getCaretRect(scopeEl);
  if (!r) return;
  const margin = 8;
  let left = r.left + window.scrollX + r.width + margin;
  let top = r.top + window.scrollY - 4;

  const maxLeft =
    window.scrollX +
    (document.documentElement.clientWidth - pill.offsetWidth - margin);
  const maxTop =
    window.scrollY +
    (document.documentElement.clientHeight - pill.offsetHeight - margin);

  left = Math.min(Math.max(window.scrollX + margin, left), maxLeft);
  top = Math.min(Math.max(window.scrollY + margin, top), maxTop);

  pill.style.left = `${left}px`;
  pill.style.top = `${top}px`;
}

/**
 * Get caret rect ONLY if selection is inside the given contenteditable scope.
 * No DOM writes; avoids breaking inputs/search boxes.
 */
function getCaretRect(scopeEl?: HTMLElement): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const node = sel.anchorNode;
  if (!node || !scopeEl) return null;

  // Ensure selection is inside our editor
  if (!(scopeEl === (node as Node) || scopeEl.contains(node as Node))) return null;

  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects && rects.length) return rects[rects.length - 1];

  // Fallback to the range's bounding rect only (no DOM insertion)
  const rect = range.getBoundingClientRect?.();
  if (rect && Number.isFinite(rect.top)) return rect as DOMRect;

  return null;
}

/** Side panel (open) */
export function openPanel() {
  if (panelEl) return;

  panelEl = document.createElement("div");
  panelEl.id = "ep-panel";
  panelEl.style.cssText =
    "position:fixed; right:16px; bottom:16px; width:320px; padding:12px; border-radius:12px; background:#fff; box-shadow:0 6px 24px rgba(0,0,0,.12); z-index:2147483647;";
  panelEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <strong style="font-size:14px">Polish settings</strong>
      <button id="ep-close" aria-label="Close" style="background:transparent;border:none;font-size:18px;line-height:1;cursor:pointer">×</button>
    </div>

    <div class="ep-row" style="display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
      <label>Tone</label>
      <div class="ep-seg" data-name="tone">
        <button data-v="professional" class="active">Professional</button>
        <button data-v="warm">Warm</button>
        <button data-v="casual">Casual</button>
      </div>
    </div>

    <div class="ep-row" style="display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
      <label>Length</label>
      <div class="ep-seg" data-name="length">
        <button data-v="shorter">Shorter</button>
        <button data-v="keep" class="active">Keep</button>
      </div>
    </div>

    <div class="ep-row" style="display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
      <label>Model</label>
      <select id="ep-model">
        <option value="gpt-4o-mini" selected>gpt-4o-mini (fast fixer)</option>
        <option value="gpt-5-mini">gpt-5-mini (smart assistant)</option>
        <option value="gpt-4o">gpt-4o (expert editor)</option>
      </select>
    </div>

    <textarea id="ep-context" maxlength="200" placeholder="(Optional) Add more context: include who you're writing to and the goal" style="width:100%;min-height:64px;padding:6px;border:1px solid #ddd;border-radius:8px;"></textarea>

    <label class="ep-check" style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <input id="ep-include-thread" type="checkbox" />
      Include previous messages for context
    </label>

    <div class="ep-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
      <button id="ep-polish">Polish</button>
      <button id="ep-grammar">Grammar-only</button>
    </div>

    <div id="ep-busy" style="display:none;position:absolute;inset:0;background:rgba(255,255,255,.6);backdrop-filter:saturate(1.2) blur(1px);border-radius:12px;align-items:center;justify-content:center;">
      <div class="ep-spinner" aria-label="Processing…"></div>
    </div>
  `;
  document.body.appendChild(panelEl);
  panelOpenedAt = Date.now();

  // Segment toggles
  panelEl.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "ep-close") {
      closePanel();
      return;
    }
    if (t.closest(".ep-seg") && t.tagName === "BUTTON") {
      const seg = t.closest(".ep-seg")!;
      seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      t.classList.add("active");
      const value = t.getAttribute("data-v")!;
      if (seg.getAttribute("data-name") === "tone")
        toneValue = value as Settings["tone"];
      if (seg.getAttribute("data-name") === "length")
        lengthValue = value as Settings["length"];
    }
  });

  panelEl.querySelector("#ep-model")?.addEventListener("change", (e) => {
    modelValue = (e.target as HTMLSelectElement).value as Settings["model"];
  });

  (document.getElementById("ep-context") as HTMLTextAreaElement)?.addEventListener(
    "input",
    (e) => {
      contextValue = (e.target as HTMLTextAreaElement).value.trim();
    }
  );

  (document.getElementById("ep-include-thread") as HTMLInputElement)?.addEventListener(
    "change",
    (e) => {
      includeThreadContext = (e.target as HTMLInputElement).checked;
    }
  );

  busyMask = panelEl.querySelector("#ep-busy") as HTMLElement | null;
}

/** Side panel (close) */
export function closePanel() {
  panelEl?.remove();
  panelEl = null;
}
export function isPanelOpen() {
  return !!panelEl;
}

/** Outside click closes, but ignore the first click right after open to avoid open→close race. */
export function attachGlobalPanelCloseHandlers(isOpen: () => boolean, onClose: () => void) {
  document.addEventListener(
    "mousedown",
    (e) => {
      if (!isOpen()) return;
      if (Date.now() - panelOpenedAt < 180) return;
      const t = e.target as HTMLElement;
      if (panelEl && !panelEl.contains(t) && t !== pill) onClose();
    },
    true
  );
}

/** Current settings from UI state */
export function getSettings(): Settings {
  return {
    tone: toneValue,
    length: lengthValue,
    model: modelValue,
    includeThreadContext,
    context: contextValue,
  };
}

/** Busy overlay in the panel + disable panel controls. */
export function showBusy(state: boolean) {
  if (!panelEl || !busyMask) return;
  (busyMask.style as any).display = state ? "flex" : "none";
  panelEl
    .querySelectorAll("button, textarea")
    .forEach((el) => ((el as HTMLButtonElement).disabled = state));
}

/** Change pill label/disabled while processing. */
export function setPillBusy(state: boolean) {
  if (!pill) return;
  pill.disabled = state;
  pill.style.opacity = state ? "0.7" : "1";
  pill.textContent = state ? "Polishing…" : "Polish ✨";
}

/** Post-actions floating bar (Undo / More / Copy). */
export function showPostActions(handlers: {
  onUndo: () => void;
  onCopy: () => void;
}) {
  if (postBarEl) return;
  postBarEl = document.createElement("div");
  postBarEl.id = "ep-post";
  postBarEl.style.cssText =
    "position:fixed; right:16px; bottom:16px; display:flex; gap:8px; z-index:2147483646;";
  postBarEl.innerHTML = `
    <button id="ep-undo">Undo</button>
    <button id="ep-copy">Copy</button>
  `;
  document.body.appendChild(postBarEl);
  postBarEl.querySelector("#ep-undo")?.addEventListener("click", () => {
    handlers.onUndo();
    removePost();
  });
  postBarEl.querySelector("#ep-copy")?.addEventListener("click", handlers.onCopy);
}
function removePost() {
  postBarEl?.remove();
  postBarEl = null;
}

/** Simple toast */
export function toast(msg: string) {
  const d = document.createElement("div");
  d.textContent = msg;
  Object.assign(d.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    background: "#333",
    color: "#fff",
    padding: "8px 10px",
    borderRadius: "8px",
    zIndex: "2147483647",
    fontSize: "13px",
  } as CSSStyleDeclaration);
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2000);
}

/** Brief highlight after applying polished text. */
export function flashHighlight(el: HTMLElement) {
  el.classList.add("ep-flash");
  setTimeout(() => el.classList.remove("ep-flash"), 900);
}
