import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NextRequest, NextResponse } from "next/server";

import { buildSystemPrompt, isAiMode } from "@/lib/ai-modes";
import {
  createConversation,
  createMessage,
  ensureUser,
  getConversation,
  listRecentMessages,
} from "@/lib/firestore";
import { AiMode, AttachmentMeta, MessageRecord } from "@/lib/types";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_NAME_LENGTH = 120;
const DEFAULT_MODEL = "gpt-4.1-mini";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function sanitizeAttachments(raw: unknown): AttachmentMeta[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.slice(0, MAX_ATTACHMENTS).flatMap((item) => {
    if (!isObject(item)) {
      return [];
    }

    const name =
      typeof item.name === "string"
        ? item.name.trim().slice(0, MAX_ATTACHMENT_NAME_LENGTH)
        : "";
    const type = typeof item.type === "string" ? item.type.trim().slice(0, 120) : "unknown";
    const size = typeof item.size === "number" ? item.size : 0;

    if (!name) {
      return [];
    }

    return [{ name, type, size }];
  });
}

function toModelContent(message: MessageRecord): string {
  if (!message.attachments || message.attachments.length === 0) {
    return message.contenu;
  }

  const fileList = message.attachments
    .map((file) => `- ${file.name} (${file.type})`)
    .join("\n");
  return `${message.contenu}\n\nFichiers joints:\n${fileList}`;
}

function extractAssistantText(text: string | null | undefined): string {
  if (typeof text !== "string") {
    return "";
  }

  return text.trim();
}

function normalizeMode(value: unknown): AiMode | null {
  if (typeof value !== "string") {
    return null;
  }

  return isAiMode(value) ? value : null;
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Corps JSON invalide.");
  }

  if (!isObject(body)) {
    return badRequest("Corps de requete invalide.");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const mode = normalizeMode(body.mode);
  const attachments = sanitizeAttachments(body.attachments);

  if (!userId) {
    return badRequest("userId est obligatoire.");
  }

  if (!mode) {
    return badRequest("mode invalide.");
  }

  if (!message) {
    return badRequest("message est obligatoire.");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return badRequest(`message trop long (max ${MAX_MESSAGE_LENGTH} caracteres).`);
  }

  if (!openaiClient) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY est manquante. Configure .env.local cote serveur avant d'utiliser le chat.",
      },
      { status: 500 },
    );
  }

  try {
    await ensureUser(userId);

    let conversation =
      conversationId.length > 0 ? await getConversation(userId, conversationId) : null;

    if (conversationId.length > 0 && !conversation) {
      return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
    }

    if (!conversation) {
      conversation = await createConversation(userId, message, mode);
    }

    const savedUserMessage = await createMessage({
      userId,
      conversationId: conversation.id,
      role: "user",
      contenu: message,
      mode,
      attachments,
    });

    const recentMessages = await listRecentMessages(userId, conversation.id, 12);

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildSystemPrompt(mode),
      },
      ...recentMessages.map((entry): ChatCompletionMessageParam => {
        if (entry.role === "assistant") {
          return {
            role: "assistant",
            content: toModelContent(entry),
          };
        }

        return {
          role: "user",
          content: toModelContent(entry),
        };
      }),
    ];

    const completion = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
      temperature: 0.4,
      max_tokens: 900,
      messages,
    });

    const assistantText = extractAssistantText(completion.choices[0]?.message?.content);

    if (!assistantText) {
      throw new Error("La reponse IA est vide.");
    }

    const savedAssistantMessage = await createMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      contenu: assistantText,
      mode,
    });

    const refreshedConversation = await getConversation(userId, conversation.id);

    return NextResponse.json({
      conversationId: conversation.id,
      conversation: refreshedConversation ?? conversation,
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


