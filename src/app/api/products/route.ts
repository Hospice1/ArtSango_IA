import { NextRequest, NextResponse } from "next/server";

import { createProduct, ensureUser, listProducts } from "@/lib/firestore";

export const runtime = "nodejs";

function sanitizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";

  if (!userId) {
    return NextResponse.json({ error: "userId est obligatoire." }, { status: 400 });
  }

  try {
    await ensureUser(userId);
    const products = await listProducts(userId);
    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json({ error: "Corps de requete invalide." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const userId = sanitizeString(body.userId);
  const nom = sanitizeString(body.nom);
  const description = sanitizeString(body.description);
  const prixRaw = typeof body.prix === "number" ? body.prix : Number.NaN;

  if (!userId) {
    return NextResponse.json({ error: "userId est obligatoire." }, { status: 400 });
  }

  if (nom.length < 2) {
    return NextResponse.json({ error: "Le nom du produit doit avoir au moins 2 caracteres." }, { status: 400 });
  }

  if (description.length < 10) {
    return NextResponse.json(
      { error: "La description du produit doit avoir au moins 10 caracteres." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(prixRaw) || prixRaw <= 0) {
    return NextResponse.json({ error: "Le prix doit etre un nombre positif." }, { status: 400 });
  }

  try {
    await ensureUser(userId);

    const product = await createProduct({
      userId,
      nom,
      description,
      prix: prixRaw,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

