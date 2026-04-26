import { NextRequest, NextResponse } from "next/server";

import { ensureUser, listConversations } from "@/lib/firestore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";

  if (!userId) {
    return NextResponse.json({ error: "userId est obligatoire." }, { status: 400 });
  }

  try {
    await ensureUser(userId);
    const conversations = await listConversations(userId);

    return NextResponse.json({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

