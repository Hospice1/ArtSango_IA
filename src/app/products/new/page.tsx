"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { AI_MODE_CONFIG, AI_MODE_OPTIONS } from "@/lib/ai-modes";
import { DEMO_USER_ID } from "@/lib/demo-user";
import { extractFirstPrice, formatShortDate } from "@/lib/format";
import { readAiDraft, writeAiDraft } from "@/lib/local-draft";
import { AiMode, ProductRecord } from "@/lib/types";

interface ProductsResponse {
  products: ProductRecord[];
  error?: string;
}

interface ProductResponse {
  product: ProductRecord;
  error?: string;
}

interface AiChatResponse {
  assistantMessage: {
    contenu: string;
  };
  error?: string;
}

const DEFAULT_AI_MODE: AiMode = "description";

async function loadProducts(userId: string): Promise<ProductRecord[]> {
  const response = await fetch(`/api/products?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ProductsResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Impossible de charger les produits.");
  }

  return payload.products ?? [];
}

function defaultTargetFromMode(mode: AiMode): "description" | "prix" {
  return mode === "pricing" ? "prix" : "description";
}

export default function NewProductPage() {
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [prix, setPrix] = useState("");

  const [aiMode, setAiMode] = useState<AiMode>(DEFAULT_AI_MODE);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");

  const [products, setProducts] = useState<ProductRecord[]>([]);

  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setIsLoadingProducts(true);

      try {
        const [initialProducts] = await Promise.all([loadProducts(DEMO_USER_ID)]);

        if (!cancelled) {
          setProducts(initialProducts);

          const lastDraft = readAiDraft();
          if (lastDraft?.content) {
            setAiResult(lastDraft.content);
            setNotice("Dernier contenu IA recharge depuis le chat.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur lors du chargement des produits.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProducts(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshProducts() {
    const nextProducts = await loadProducts(DEMO_USER_ID);
    setProducts(nextProducts);
  }

  async function handleGenerateWithAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = aiPrompt.trim();
    if (!prompt) {
      setError("Ecris une instruction pour lancer la generation IA.");
      return;
    }

    const contextParts = [
      nom ? `Nom produit: ${nom}` : "Nom produit: non renseigne",
      description ? `Description actuelle: ${description}` : "Description actuelle: non renseignee",
      prix ? `Prix actuel: ${prix}` : "Prix actuel: non renseigne",
    ];

    setError(null);
    setNotice(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: DEMO_USER_ID,
          mode: aiMode,
          message: `${prompt}\n\nContexte produit:\n${contextParts.join("\n")}`,
        }),
      });

      const payload = (await response.json()) as AiChatResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Echec de la generation IA.");
      }

      const result = payload.assistantMessage?.contenu?.trim();

      if (!result) {
        throw new Error("La reponse IA est vide.");
      }

      setAiResult(result);
      writeAiDraft({
        content: result,
        mode: aiMode,
        target: defaultTargetFromMode(aiMode),
      });
      setNotice("Contenu IA genere et sauvegarde pour reutilisation.");

      await refreshProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la generation IA.");
    } finally {
      setIsGenerating(false);
    }
  }

  function injectDescription() {
    if (!aiResult.trim()) {
      setError("Aucun contenu IA a injecter.");
      return;
    }

    setDescription(aiResult.trim());
    setNotice("Description mise a jour avec le contenu IA.");
    setError(null);
  }

  function injectPrice() {
    if (!aiResult.trim()) {
      setError("Aucun contenu IA a injecter.");
      return;
    }

    const detected = extractFirstPrice(aiResult);

    if (detected === null) {
      setError("Impossible de detecter un prix dans la reponse IA.");
      return;
    }

    setPrix(detected.toString());
    setNotice("Prix mis a jour depuis la reponse IA.");
    setError(null);
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setNotice(null);

    const parsedPrice = Number.parseFloat(prix.replace(/,/g, "."));

    if (!nom.trim()) {
      setError("Le nom produit est obligatoire.");
      return;
    }

    if (description.trim().length < 10) {
      setError("La description doit contenir au moins 10 caracteres.");
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Le prix doit etre un nombre positif.");
      return;
    }

    setIsSavingProduct(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: DEMO_USER_ID,
          nom: nom.trim(),
          description: description.trim(),
          prix: parsedPrice,
        }),
      });

      const payload = (await response.json()) as ProductResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Impossible de sauvegarder le produit.");
      }

      setNotice("Produit enregistre avec succes.");
      setNom("");
      setDescription("");
      setPrix("");
      await refreshProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde du produit.");
    } finally {
      setIsSavingProduct(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 text-[var(--text-main)] md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_90%_at_100%_0%,#d6e8de_0%,transparent_55%),radial-gradient(80%_80%_at_0%_100%,#ecdbc0_0%,transparent_55%)]" />

      <div className="relative mx-auto grid w-full max-w-[1400px] gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_20px_44px_rgba(68,44,14,0.1)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl">Creation produit</h1>
              <p className="text-sm text-[var(--text-muted)]">
                Enregistre ton produit et remplis les champs avec ArtSango AI.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm font-medium"
            >
              Retour chat
            </Link>
          </div>

          {error && (
            <p className="mb-3 rounded-xl border border-[#f3c7bd] bg-[#fff1ed] p-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          {notice && (
            <p className="mb-3 rounded-xl border border-[#bee4d5] bg-[#ecfaf4] p-3 text-sm text-[#0f5e45]">
              {notice}
            </p>
          )}

          <form className="space-y-3" onSubmit={handleSaveProduct}>
            <label className="block text-sm font-medium">
              Nom du produit
              <input
                type="text"
                value={nom}
                onChange={(event) => setNom(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#fffdf8] px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                placeholder="Ex: Sac raphia Kora"
              />
            </label>

            <label className="block text-sm font-medium">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={6}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#fffdf8] px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                placeholder="Description du produit..."
              />
            </label>

            <label className="block text-sm font-medium">
              Prix
              <input
                type="text"
                value={prix}
                onChange={(event) => setPrix(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#fffdf8] px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                placeholder="Ex: 18000"
              />
            </label>

            <button
              type="submit"
              disabled={isSavingProduct}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSavingProduct ? "Enregistrement..." : "Enregistrer produit"}
            </button>
          </form>

          <div className="mt-6">
            <h2 className="font-display text-2xl">Produits recents</h2>
            {isLoadingProducts ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">Chargement des produits...</p>
            ) : products.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--text-muted)]">
                Aucun produit enregistre pour le moment.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {products.map((product) => (
                  <article
                    key={product.id}
                    className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-3"
                  >
                    <p className="font-semibold">{product.nom}</p>
                    <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{product.description}</p>
                    <p className="mt-1 text-sm font-medium">{product.prix.toLocaleString("fr-FR")} XOF</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatShortDate(product.updatedAt)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_20px_44px_rgba(68,44,14,0.1)]">
          <h2 className="font-display text-3xl">Generer avec IA</h2>
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Lance une generation IA directement depuis la creation produit.
          </p>

          <form onSubmit={handleGenerateWithAi} className="space-y-3">
            <label className="block text-sm font-medium">
              Mode IA
              <select
                value={aiMode}
                onChange={(event) => setAiMode(event.target.value as AiMode)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#fffdf8] px-3 py-2"
              >
                {AI_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-xs text-[var(--text-muted)]">{AI_MODE_CONFIG[aiMode].helper}</p>

            <label className="block text-sm font-medium">
              Instruction
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={5}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#fffdf8] px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                placeholder={AI_MODE_CONFIG[aiMode].placeholder}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isGenerating}
                className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isGenerating ? "Generation..." : "Generer avec IA"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const lastDraft = readAiDraft();
                  if (!lastDraft?.content) {
                    setError("Aucun contenu IA en memoire locale.");
                    return;
                  }
                  setAiResult(lastDraft.content);
                  setNotice("Dernier contenu IA recharge.");
                  setError(null);
                }}
                className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-2 text-sm font-semibold"
              >
                Charger dernier contenu IA
              </button>
            </div>
          </form>

          <div className="mt-5 rounded-xl border border-[var(--line)] bg-[#fffdf8] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Resultat IA
            </p>
            <p className="min-h-[140px] whitespace-pre-wrap text-sm leading-7">
              {aiResult || "Le resultat de l'IA apparaitra ici."}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={injectDescription}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-xs font-medium"
              >
                Injecter dans description
              </button>
              <button
                type="button"
                onClick={injectPrice}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-xs font-medium"
              >
                Injecter dans prix
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}


