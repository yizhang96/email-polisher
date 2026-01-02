/// <reference types="chrome" />
import {
  openPanel,
  closePanel,
  isPanelOpen,
  attachGlobalPanelCloseHandlers,
  ensurePill,
  showPill,
  hidePill,
  updatePillPositionNearCaret,
  showBusy,
  setPillBusy,
  getSettings,
  showPostActions,
  flashHighlight,
  toast,
  setPillPointerEvents,
} from "./ui";
import type { Mode } from "../utils/types";

// Robust editor selectors for Gmail variants
const EDITOR_SELECTORS = [
  'div[aria-label="Message Body"]',
  'div[role="textbox"][contenteditable="true"]',
  'div[contenteditable="true"][g_editable="true"]',
  'div[contenteditable="true"].Am.Al.editable.LW-avf',
];

let originalHTML: string | null = null;
let wiredEditors = new WeakSet<HTMLElement>();
let currentEditor: HTMLElement | null = null;
let lastThreadContext = "";

const THREAD_CONTEXT_LIMIT = 2;
const THREAD_CONTEXT_MAX_CHARS = 900;

/** Find the first visible Gmail compose editor */
function findEditor(): HTMLElement | null {
  for (const sel of EDITOR_SELECTORS) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el && el.isConnected && el.offsetParent !== null) return el;
  }
  return null;
}

function editorContains(node: Node | null): boolean {
  if (!currentEditor || !node) return false;
  return currentEditor === node || currentEditor.contains(node as Node);
}

function editorHasFocus(): boolean {
  const ae = document.activeElement;
  if (!currentEditor) return false;
  return currentEditor === ae || (ae instanceof Node && currentEditor.contains(ae));
}

const runtimeApi =
  (globalThis as any)?.chrome?.runtime || (globalThis as any)?.browser?.runtime || null;

/** Safe sender that retries once if the SW reloaded. */
async function sendMessageSafe<T = any>(msg: any): Promise<T> {
  if (!runtimeApi?.sendMessage) {
    throw new Error("Extension runtime unavailable. Reload the extension and Gmail.");
  }
  try {
    return await runtimeApi.sendMessage(msg);
  } catch (err: any) {
    const m = String(err?.message || err);
    const transient =
      m.includes("Extension context invalidated") ||
      m.includes("The message port closed") ||
      m.includes("Receiving end does not exist");
    if (transient) {
      await new Promise((r) => setTimeout(r, 200));
      return await runtimeApi.sendMessage(msg);
    }
    throw err;
  }
}

function extractThreadMessages(limit = THREAD_CONTEXT_LIMIT): string[] {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("div.a3s.aiL, div.a3s")
  ).filter((el) => el.isConnected && el.offsetParent !== null);

  const messages: string[] = [];
  for (let i = nodes.length - 1; i >= 0 && messages.length < limit; i -= 1) {
    const el = nodes[i];
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".gmail_quote, blockquote").forEach((n) => n.remove());
    const text = (clone.innerText || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) {
      messages.push(text.slice(0, THREAD_CONTEXT_MAX_CHARS));
    }
  }

  return messages.reverse();
}

function refreshThreadContextLog() {
  const msgs = extractThreadMessages();
  lastThreadContext = msgs.join("\n\n---\n\n");
  if (msgs.length) {
    console.log("[email-polisher] Thread context messages:", msgs);
  } else {
    console.log("[email-polisher] Thread context messages: (none found)");
  }
}

/** Open the panel and temporarily disable the pill so it can't steal clicks. */
function openPanelAndMutePill() {
  hidePill();
  setPillPointerEvents(false);
  refreshThreadContextLog();
  openPanel();
}

function restorePillAfterPanelClose() {
  setPillPointerEvents(true);
  if (editorHasFocus()) showPill();
}

async function act(mode: Mode) {
  const editor = currentEditor || findEditor();
  if (!editor) {
    toast("Editor not found. Click inside the message body and try again.");
    return;
  }

  const text = editor.innerText || "";
  originalHTML = editor.innerHTML;

  showBusy(true);
  setPillBusy(true);

  let res: { ok: boolean; text?: string; error?: string } | undefined;
  try {
    const settings = getSettings();
    if (settings.includeThreadContext) {
      settings.threadContext = lastThreadContext;
    }
    res = await sendMessageSafe({
      type: "POLISH",
      payload: { text, settings, mode },
    });
  } catch (err: any) {
    showBusy(false);
    setPillBusy(false);
    toast(err?.message || "Could not reach background worker.");
    return;
  }

  showBusy(false);
  setPillBusy(false);

  if (!res?.ok) {
    toast(res?.error || "Something went wrong");
    return;
  }

  editor.innerText = res.text!;
  flashHighlight(editor);

  showPostActions({
    onUndo: () => {
      const ed = currentEditor || findEditor();
      if (ed && originalHTML) ed.innerHTML = originalHTML;
    },
    onCopy: () => navigator.clipboard.writeText((currentEditor || findEditor())?.innerText || ""),
  });
}

/** Wire a single editor instance once */
function wireEditorOnce(ed: HTMLElement) {
  if (wiredEditors.has(ed)) return;
  wiredEditors.add(ed);

  ed.addEventListener("focus", () => {
    currentEditor = ed;
    if (!isPanelOpen()) {
      setPillPointerEvents(true);
      showPill();
    }
    // Position on next frame (ensures selection metrics ready)
    requestAnimationFrame(() => updatePillPositionNearCaret(ed));
  });

  ed.addEventListener("blur", () => {
    if (!isPanelOpen()) hidePill();
  });

  const reposition = () => {
    // Only track caret while the editor itself has focus
    if (!editorHasFocus() || isPanelOpen()) return;
    updatePillPositionNearCaret(ed);
  };

  ["keyup", "mouseup", "input"].forEach((ev) => ed.addEventListener(ev, reposition));
}

/** Global listeners that respect focus */
document.addEventListener(
  "selectionchange",
  () => {
    // Only update when selection lives inside the editor and editor is focused
    if (!editorHasFocus() || !editorContains(window.getSelection()?.anchorNode || null)) return;
    updatePillPositionNearCaret(currentEditor!);
  },
  { passive: true }
);

document.addEventListener(
  "focusin",
  (e) => {
    const t = e.target as HTMLElement;
    // If focus moved outside the editor, hide/disable the pill immediately
    if (!editorContains(t)) {
      hidePill();
      setPillPointerEvents(false);
    }
  },
  true
);

// MutationObserver: discover editors as they appear
const mo = new MutationObserver(() => {
  const ed = findEditor();
  if (!ed) return;

  currentEditor = ed;
  ensurePill({
    onClick: () => openPanelAndMutePill(),
    onPolish: () => act("polish"),
    onGrammar: () => act("grammar"),
  });

  wireEditorOnce(ed);

  // If the editor is already focused when we first wire it, ensure pill appears
  if (editorHasFocus()) {
    setPillPointerEvents(true);
    showPill();
    requestAnimationFrame(() => updatePillPositionNearCaret(ed));
  }
});
mo.observe(document.documentElement, { childList: true, subtree: true });

// Keyboard: Alt+P open, Esc close
addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.altKey && e.key.toLowerCase() === "p") openPanelAndMutePill();
  if (e.key === "Escape" && isPanelOpen()) {
    closePanel();
    restorePillAfterPanelClose();
  }
});

// Outside-click to dismiss panel
attachGlobalPanelCloseHandlers(
  () => isPanelOpen(),
  () => {
    closePanel();
    restorePillAfterPanelClose();
  }
);
