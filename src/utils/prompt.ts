import type { Settings, Mode } from "./types";

export const SYSTEM = `You are an assistant that rewrites emails clearly, politely, and concisely. Maintain factual content, fix grammar, keep simple formatting (lists, line breaks), and avoid adding commitments or promises. Do not invent details. If the draft is already strong, make minimal edits.`;

export function buildPrompt(email: string, s: Settings, mode: Mode) {
  const modeHint =
    mode === "grammar"
      ? "Only fix grammar, clarity, and tone-neutral issues."
      : "Rewrite with requested tone and length.";

  const context = (s.context || "").slice(0, 140);
  const threadContext = s.threadContext || "";

  return `
<draft>
${email}
</draft>

<style>
 tone=${s.tone}; length=${s.length}; dialect=en_US; preserve_voice=true
</style>

<context>${context}</context>

${threadContext ? `<thread_context>\n${threadContext}\n</thread_context>\n` : ""}

Task: ${modeHint} Return ONLY the revised email body. Keep greetings/sign-offs intact unless awkward. Avoid adding new facts or commitments.`;
}
