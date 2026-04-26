"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { AI_MODE_CONFIG, AI_MODE_OPTIONS } from "@/lib/ai-modes";
import { DEMO_USER_ID } from "@/lib/demo-user";
import { formatShortDate } from "@/lib/format";
import { DraftTarget, writeAiDraft } from "@/lib/local-draft";
import { AiMode, AttachmentMeta, ConversationRecord, MessageRecord } from "@/lib/types";

interface ConversationsResponse {
  conversations: ConversationRecord[];
  error?: string;
}

interface MessagesResponse {
  messages: MessageRecord[];
  error?: string;
}

interface AiChatResponse {
  conversationId: string;
  conversation: ConversationRecord;
  assistantMessage: MessageRecord;
  error?: string;
}

const DEFAULT_MODE: AiMode = "description";

async function getConversations(userId: string): Promise<ConversationRecord[]> {
  const response = await fetch(`/api/conversations?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as ConversationsResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Impossible de charger les conversations.");
  }

  return payload.conversations ?? [];
}

async function getMessages(userId: string, conversationId: string): Promise<MessageRecord[]> {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages?userId=${encodeURIComponent(userId)}`,
    {
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as MessagesResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Impossible de charger les messages.");
  }

  return payload.messages ?? [];
}

function draftLabel(target: DraftTarget): string {
  return target === "description"
    ? "Le texte est pret pour la description produit."
    : "La proposition de prix est prete pour la fiche produit.";
}

export function ChatApp() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [mode, setMode] = useState<AiMode>(DEFAULT_MODE);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setIsBooting(true);
      setError(null);

      try {
        const initialConversations = await getConversations(DEMO_USER_ID);

        if (cancelled) {
          return;
        }

        setConversations(initialConversations);

        if (initialConversations.length > 0) {
          const firstConversation = initialConversations[0];
          setActiveConversationId(firstConversation.id);
          setMode(firstConversation.lastMode);

          const initialMessages = await getMessages(DEMO_USER_ID, firstConversation.id);
          if (!cancelled) {
            setMessages(initialMessages);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur lors du chargement initial.");
        }
      } finally {
        if (!cancelled) {
          setIsBooting(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshConversationAndMessages(conversationId: string) {
    const [nextConversations, nextMessages] = await Promise.all([
      getConversations(DEMO_USER_ID),
      getMessages(DEMO_USER_ID, conversationId),
    ]);

    setConversations(nextConversations);
    setMessages(nextMessages);
    setActiveConversationId(conversationId);

    const selectedConversation = nextConversations.find((item) => item.id === conversationId);
    if (selectedConversation) {
      setMode(selectedConversation.lastMode);
    }
  }

  async function handleSelectConversation(conversation: ConversationRecord) {
    setSidebarOpen(false);
    setError(null);
    setIsLoadingMessages(true);

    try {
      const nextMessages = await getMessages(DEMO_USER_ID, conversation.id);
      setActiveConversationId(conversation.id);
      setMode(conversation.lastMode);
      setMessages(nextMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  function handleNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setDraft("");
    setPendingFiles([]);
    setError(null);
    setNotice("Nouvelle discussion prete.");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleAttachmentPick(files: FileList | null) {
    if (!files) {
      setPendingFiles([]);
      return;
    }

    setPendingFiles(Array.from(files).slice(0, 5));
  }

  function handleReuse(content: string, target: DraftTarget) {
    writeAiDraft({
      content,
      mode,
      target,
    });

    setNotice(draftLabel(target));
  }

  async function handleSendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedDraft = draft.trim();
    const hasFiles = pendingFiles.length > 0;

    if (!trimmedDraft && !hasFiles) {
      return;
    }

    const messageToSend = trimmedDraft || "Analyse les fichiers joints et propose une reponse utile.";
    const attachments: AttachmentMeta[] = pendingFiles.map((file) => ({
      name: file.name,
      type: file.type || "unknown",
      size: file.size,
    }));

    const optimisticId = `tmp-${Date.now()}`;

    setError(null);
    setNotice(null);
    setIsSending(true);
    setMessages((previous) => [
      ...previous,
      {
        id: optimisticId,
        conversationId: activeConversationId ?? "pending",
        role: "user",
        contenu: messageToSend,
        mode,
        createdAt: Date.now(),
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    ]);

    setDraft("");
    setPendingFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: DEMO_USER_ID,
          conversationId: activeConversationId,
          message: messageToSend,
          mode,
          attachments,
        }),
      });

      const payload = (await response.json()) as AiChatResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Erreur API pendant l'envoi du message.");
      }

      await refreshConversationAndMessages(payload.conversationId);
    } catch (err) {
      setMessages((previous) => previous.filter((entry) => entry.id !== optimisticId));
      setError(err instanceof Error ? err.message : "Echec de l'envoi du message.");
    } finally {
      setIsSending(false);
    }
  }

  const modeConfig = AI_MODE_CONFIG[mode];

  return (
    <div className="relative min-h-screen overflow-hidden text-[var(--text-main)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_90%_at_100%_0%,#d6e8de_0%,transparent_55%),radial-gradient(80%_80%_at_0%_100%,#ecdbc0_0%,transparent_55%)]" />

      <div className="relative mx-auto flex h-screen max-w-[1500px] overflow-hidden border-x border-[var(--line)] bg-[rgba(250,243,232,0.94)] shadow-[0_26px_60px_rgba(67,44,14,0.12)]">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-[var(--line)] bg-[linear-gradient(180deg,#f8efdf_0%,#f5ead9_100%)] p-4 transition-transform md:static md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4">
            <p className="font-display text-2xl text-[var(--text-main)]">ArtSango AI</p>
            <p className="text-xs text-[var(--text-muted)]">Assistant business pour artisans</p>
          </div>

          <div className="mb-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-left text-sm font-medium transition hover:border-[var(--brand)]"
            >
              Nouvelle discussion
            </button>

            <Link
              href="/products/new"
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm font-medium transition hover:border-[var(--brand)]"
            >
              Creation produit
            </Link>
          </div>

          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Historique
          </div>

          <div className="space-y-2 overflow-y-auto pb-24">
            {conversations.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--text-muted)]">
                Aucune conversation pour le moment.
              </p>
            )}

            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void handleSelectConversation(conversation)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isActive
                      ? "border-[var(--brand)] bg-[#ecf7f2]"
                      : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--brand)]"
                  }`}
                >
                  <p className="line-clamp-2 text-sm font-medium">{conversation.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {AI_MODE_CONFIG[conversation.lastMode].label}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatShortDate(conversation.updatedAt)}</p>
                </button>
              );
            })}
          </div>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/35 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          />
        )}

        <section className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(255,249,240,0.92)] px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm md:hidden"
              >
                Menu
              </button>
              <div>
                <p className="font-display text-xl">Chat IA</p>
                <p className="text-xs text-[var(--text-muted)]">{modeConfig.label}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
            >
              Nouvelle
            </button>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-6">
            {(isBooting || isLoadingMessages) && (
              <p className="mx-auto mb-4 max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm text-[var(--text-muted)]">
                Chargement des messages...
              </p>
            )}

            {error && (
              <p className="mx-auto mb-4 max-w-3xl rounded-xl border border-[#f3c7bd] bg-[#fff1ed] p-3 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            {notice && (
              <p className="mx-auto mb-4 max-w-3xl rounded-xl border border-[#bee4d5] bg-[#ecfaf4] p-3 text-sm text-[#0f5e45]">
                {notice}
              </p>
            )}

            {messages.length === 0 && !isBooting && !isLoadingMessages && (
              <div className="mx-auto max-w-3xl rounded-2xl border border-[#b2d4c5] bg-[linear-gradient(145deg,#0d7a61,#0b5d4a)] p-6 text-white shadow-[0_22px_48px_rgba(12,62,49,0.24)]">
                <h1 className="font-display text-3xl">Bienvenue sur ArtSango AI</h1>
                <p className="mt-2 text-sm text-[#def7ec]">
                  Choisis un mode, ecris ton besoin et recois une reponse exploitable pour vendre plus vite.
                </p>
              </div>
            )}

            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
                >
                  <article
                    className={`max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-7 shadow-sm ${
                      message.role === "assistant"
                        ? "border-[var(--line)] bg-[var(--panel)]"
                        : "border-[#0f6e56] bg-[linear-gradient(145deg,#0b7b62,#095e4c)] text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.contenu}</p>

                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-3 rounded-lg border border-dashed border-current/35 p-2 text-xs">
                        <p className="font-semibold">Fichiers attaches</p>
                        <ul className="mt-1 space-y-1">
                          {message.attachments.map((file) => (
                            <li key={`${message.id}-${file.name}`}>
                              {file.name} ({file.type})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p
                      className={`mt-2 text-xs ${
                        message.role === "assistant" ? "text-[var(--text-muted)]" : "text-white/75"
                      }`}
                    >
                      {formatShortDate(message.createdAt)}
                    </p>

                    {message.role === "assistant" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1 text-xs font-medium text-[var(--text-main)]"
                          onClick={() => handleReuse(message.contenu, "description")}
                        >
                          Utiliser en description
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1 text-xs font-medium text-[var(--text-main)]"
                          onClick={() => handleReuse(message.contenu, "prix")}
                        >
                          Utiliser en prix
                        </button>
                      </div>
                    )}
                  </article>
                </div>
              ))}
            </div>
          </main>

          <footer className="border-t border-[var(--line)] bg-[rgba(255,249,240,0.96)] p-4">
            <form onSubmit={(event) => void handleSendMessage(event)} className="mx-auto max-w-4xl">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--text-muted)]">{modeConfig.helper}</p>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as AiMode)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
                >
                  {AI_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((file) => (
                    <span
                      key={`${file.name}-${file.size}`}
                      className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs"
                    >
                      {file.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 w-10 rounded-xl border border-[var(--line)] bg-[var(--panel)] text-xl font-semibold"
                  aria-label="Ajouter un fichier"
                >
                  +
                </button>

                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  rows={3}
                  placeholder={modeConfig.placeholder}
                  className="min-h-[74px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none ring-[var(--brand)] transition focus:ring-2"
                />

                <button
                  type="submit"
                  disabled={isSending}
                  className="h-10 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending ? "Envoi..." : "Envoyer"}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                onChange={(event) => handleAttachmentPick(event.target.files)}
              />
            </form>
          </footer>
        </section>
      </div>
    </div>
  );
}



