import { NextRequest, NextResponse } from "next/server";

import { getConversation, listMessages } from "@/lib/firestore";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";

  if (!userId) {
    return NextResponse.json({ error: "userId est obligatoire." }, { status: 400 });
  }

  const { conversationId } = await context.params;

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId est obligatoire." }, { status: 400 });
  }

  try {
    const conversation = await getConversation(userId, conversationId);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
    }

    const messages = await listMessages(userId, conversationId);
    return NextResponse.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

