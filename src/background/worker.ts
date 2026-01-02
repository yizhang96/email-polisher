/// <reference types="chrome" />
import { SYSTEM, buildPrompt } from "../utils/prompt";   // add ".ts" if your editor needs it
import type { Settings, Mode } from "../utils/types";    // add ".ts" if your editor needs it

interface Payload { text: string; settings: Settings; mode: Mode; }
type SendResponse = (res: { ok: boolean; text?: string; error?: string }) => void;

console.debug("[email-polisher] SW boot");

// Optional PING
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse: SendResponse) => {
  if (msg?.type === "PING") { sendResponse({ ok: true, text: "pong" }); return true; }
});

// Main POLISH handler
chrome.runtime.onMessage.addListener((msg: { type?: string; payload?: Payload }, _sender, sendResponse: SendResponse) => {
  if (msg?.type !== "POLISH") return;

  (async () => {
    try {
      const { text, settings, mode } = msg.payload as Payload;
      const { openaiKey } = await chrome.storage.local.get("openaiKey");
      const key = (openaiKey || "").trim();
      if (!key.startsWith("sk-")) {
        try {
          chrome.runtime.openOptionsPage();
        } catch {
          // Ignore if options page can't be opened from this context.
        }
        throw new Error("Missing or invalid OpenAI API key. Open the extension options to set it.");
      }

      const prompt = buildPrompt(text || "", settings, mode);
      const model = settings?.model || "gpt-4o-mini";

      // Use Responses API for selected model
      const out = await callResponsesAPI(key, prompt, model);
      sendResponse({ ok: true, text: out });
    } catch (e: any) {
      console.error("[email-polisher] POLISH error:", e);
      const m = String(e?.message || e);
      if (m.includes("insufficient_quota") || m.includes("quota")) {
        sendResponse({ ok: false, error: "OpenAI: quota exceeded or no billing set for this key." });
      } else {
        sendResponse({ ok: false, error: m });
      }
    }
  })();

  return true; // async
});

/** Prefer Responses API (no temperature; use max_output_tokens). */
async function callResponsesAPI(
  apiKey: string,
  prompt: string,
  model: "gpt-5-mini" | "gpt-4o" | "gpt-4o-mini"
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: prompt,
      // No temperature — many GPT-5 variants only allow default
      max_output_tokens: 800
      // If you still get non-text tool outputs, you could add:
      // "metadata": { "force_text": true }
    })
  });

  const raw = await res.text();
  console.debug("[email-polisher] OpenAI status:", res.status, "body:", raw.slice(0, 400));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${raw || "(no body)"}`);

  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error("OpenAI response was not JSON."); }

  // 1) Standard convenience field
  let text: string | undefined = json?.output_text?.trim?.();

  // 2) Stitch from output[].content[].text
  if (!text && Array.isArray(json?.output)) {
    const parts: string[] = [];
    for (const item of json.output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") parts.push(c.text);
          else if (c?.text?.value) parts.push(String(c.text.value));
        }
      }
    }
    text = parts.join("\n").trim();
  }

  if (text && text.length > 0) return text;

  // 3) Fallback to Chat Completions with gpt-4o (plain text) if absolutely needed
  console.warn("[email-polisher] Empty Responses text — falling back to gpt-4o chat");
  return await callChatCompletions_gpt4o(apiKey, prompt);
}

/** Simple fallback to Chat Completions (no temperature; modern param name). */
async function callChatCompletions_gpt4o(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt }
      ],
      response_format: { type: "text" },
      max_completion_tokens: 800
    })
  });

  const raw = await res.text();
  console.debug("[email-polisher] OpenAI (fallback) status:", res.status, "body:", raw.slice(0, 400));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${raw || "(no body)"}`);

  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error("OpenAI fallback response was not JSON."); }

  const choice = json?.choices?.[0];
  const msg = choice?.message;
  if (typeof msg?.content === "string" && msg.content.trim()) return msg.content.trim();

  if (Array.isArray(msg?.content)) {
    const text = msg.content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return (part.text?.value ?? part.text ?? "").toString();
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }

  throw new Error("Empty response from fallback (no text in choices[0].message).");
}
