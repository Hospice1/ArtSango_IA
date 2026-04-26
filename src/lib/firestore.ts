import { randomUUID } from "node:crypto";

import { buildConversationTitle } from "@/lib/ai-modes";
import {
  AiMode,
  AttachmentMeta,
  ConversationRecord,
  MessageRecord,
  MessageRole,
  ProductRecord,
  UserRecord,
} from "@/lib/types";

interface UserStore {
  user: UserRecord;
  conversations: ConversationRecord[];
  messagesByConversation: Map<string, MessageRecord[]>;
  products: ProductRecord[];
}

interface CreateMessageInput {
  userId: string;
  conversationId: string;
  role: MessageRole;
  contenu: string;
  mode: AiMode;
  attachments?: AttachmentMeta[];
}

interface CreateProductInput {
  userId: string;
  nom: string;
  description: string;
  prix: number;
}

const storesByUserId = new Map<string, UserStore>();

function now(): number {
  return Date.now();
}

function createId(prefix: string): string {
  try {
    return `${prefix}_${randomUUID()}`;
  } catch {
    return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function cloneAttachments(value?: AttachmentMeta[]): AttachmentMeta[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  return value.map((file) => ({ ...file }));
}

function cloneConversation(value: ConversationRecord): ConversationRecord {
  return { ...value };
}

function cloneMessage(value: MessageRecord): MessageRecord {
  return {
    ...value,
    attachments: cloneAttachments(value.attachments),
  };
}

function cloneProduct(value: ProductRecord): ProductRecord {
  return { ...value };
}

function cloneUser(value: UserRecord): UserRecord {
  return { ...value };
}

function getOrCreateStore(userId: string): UserStore {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("userId est obligatoire.");
  }

  const existingStore = storesByUserId.get(normalizedUserId);
  if (existingStore) {
    return existingStore;
  }

  const timestamp = now();
  const createdStore: UserStore = {
    user: {
      id: normalizedUserId,
      nom: "Artisan Demo",
      email: `${normalizedUserId}@artsango.local`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    conversations: [],
    messagesByConversation: new Map<string, MessageRecord[]>(),
    products: [],
  };

  storesByUserId.set(normalizedUserId, createdStore);
  return createdStore;
}

function getConversationFromStore(
  store: UserStore,
  conversationId: string,
): ConversationRecord | null {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) {
    return null;
  }

  return store.conversations.find((entry) => entry.id === normalizedConversationId) ?? null;
}

export async function ensureUser(userId: string): Promise<UserRecord> {
  const store = getOrCreateStore(userId);
  store.user.updatedAt = now();
  return cloneUser(store.user);
}

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  const store = getOrCreateStore(userId);

  return [...store.conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => cloneConversation(entry));
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationRecord | null> {
  const store = getOrCreateStore(userId);
  const conversation = getConversationFromStore(store, conversationId);
  return conversation ? cloneConversation(conversation) : null;
}

export async function createConversation(
  userId: string,
  firstMessage: string,
  mode: AiMode,
): Promise<ConversationRecord> {
  const store = getOrCreateStore(userId);
  const timestamp = now();

  const conversation: ConversationRecord = {
    id: createId("conv"),
    userId: userId.trim(),
    title: buildConversationTitle(firstMessage),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMode: mode,
  };

  store.conversations.unshift(conversation);
  store.messagesByConversation.set(conversation.id, []);

  return cloneConversation(conversation);
}

export async function listMessages(userId: string, conversationId: string): Promise<MessageRecord[]> {
  const store = getOrCreateStore(userId);
  const conversation = getConversationFromStore(store, conversationId);

  if (!conversation) {
    return [];
  }

  const entries = store.messagesByConversation.get(conversation.id) ?? [];

  return [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((entry) => cloneMessage(entry));
}

export async function listRecentMessages(
  userId: string,
  conversationId: string,
  limit: number,
): Promise<MessageRecord[]> {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) {
    return [];
  }

  const orderedMessages = await listMessages(userId, conversationId);
  return orderedMessages.slice(-safeLimit).map((entry) => cloneMessage(entry));
}

export async function createMessage(input: CreateMessageInput): Promise<MessageRecord> {
  const store = getOrCreateStore(input.userId);
  const conversation = getConversationFromStore(store, input.conversationId);

  if (!conversation) {
    throw new Error("Conversation introuvable.");
  }

  const normalizedContent = input.contenu.trim();
  if (!normalizedContent) {
    throw new Error("Le message est vide.");
  }

  const timestamp = now();
  const message: MessageRecord = {
    id: createId("msg"),
    conversationId: conversation.id,
    role: input.role,
    contenu: normalizedContent,
    mode: input.mode,
    createdAt: timestamp,
    attachments: cloneAttachments(input.attachments),
  };

  const conversationMessages = store.messagesByConversation.get(conversation.id) ?? [];
  conversationMessages.push(message);
  store.messagesByConversation.set(conversation.id, conversationMessages);

  conversation.updatedAt = timestamp;
  conversation.lastMode = input.mode;

  return cloneMessage(message);
}

export async function listProducts(userId: string): Promise<ProductRecord[]> {
  const store = getOrCreateStore(userId);

  return [...store.products]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => cloneProduct(entry));
}

export async function createProduct(input: CreateProductInput): Promise<ProductRecord> {
  const store = getOrCreateStore(input.userId);

  const nom = input.nom.trim();
  const description = input.description.trim();

  if (!nom) {
    throw new Error("Le nom du produit est obligatoire.");
  }

  if (!description) {
    throw new Error("La description du produit est obligatoire.");
  }

  if (!Number.isFinite(input.prix) || input.prix <= 0) {
    throw new Error("Le prix doit etre un nombre positif.");
  }

  const timestamp = now();
  const product: ProductRecord = {
    id: createId("prod"),
    userId: input.userId.trim(),
    nom,
    description,
    prix: input.prix,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.products.unshift(product);

  return cloneProduct(product);
}
