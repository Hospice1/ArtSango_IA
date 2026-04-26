import { AiMode } from "@/lib/types";

export type DraftTarget = "description" | "prix";

export interface AiDraft {
  content: string;
  mode: AiMode;
  target: DraftTarget;
  savedAt: number;
}

interface AiDraftInput {
  content: string;
  mode: AiMode;
  target: DraftTarget;
  savedAt?: number;
}

const STORAGE_KEY = "artsango-ai:last-draft";

export function writeAiDraft(draft: AiDraftInput): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: AiDraft = {
    ...draft,
    savedAt: draft.savedAt ?? new Date().getTime(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readAiDraft(): AiDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AiDraft;
  } catch {
    return null;
  }
}

