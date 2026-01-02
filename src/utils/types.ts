// Shared types for the extension

export type Tone = "professional" | "warm" | "casual";
export type Length = "shorter" | "keep";
export type Mode = "polish" | "grammar";
export type ModelId = "gpt-5-mini" | "gpt-4o" | "gpt-4o-mini";

export interface Settings {
  tone: Tone;
  length: Length;
  model: ModelId;
  includeThreadContext?: boolean;
  threadContext?: string;
  /** Optional micro-context, e.g., "senior collaborator; appreciative but direct" */
  context?: string;
}
