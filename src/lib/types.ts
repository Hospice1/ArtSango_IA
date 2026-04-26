export type AiMode = "description" | "improve_text" | "pricing" | "social_posts";

export type MessageRole = "user" | "assistant";

export interface AttachmentMeta {
  name: string;
  type: string;
  size: number;
}

export interface UserRecord {
  id: string;
  nom: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMode: AiMode;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  contenu: string;
  mode: AiMode;
  createdAt: number;
  attachments?: AttachmentMeta[];
}

export interface ProductRecord {
  id: string;
  userId: string;
  nom: string;
  description: string;
  prix: number;
  createdAt: number;
  updatedAt: number;
}

