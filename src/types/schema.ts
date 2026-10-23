import { Timestamp } from "@/lib/db/firestore-compat";

export type TenantStatus = "active" | "suspended" | "pendingDeletion";

export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "orderStaff"
  | "knowledgeEditor"
  | "readOnly";

export type ConversationStatus =
  | "open"
  | "waitingForHuman"
  | "resolved"
  | "closed";

export type MessageDirection = "inbound" | "outbound";

export type MessageSenderType =
  | "customer"
  | "assistant"
  | "staff"
  | "system";

export type Channel = "web" | "whatsapp_meta" | "whatsapp_qr";

export type ApiKeyStatus = "active" | "invalid" | "revoked" | "deleted";

export type KnowledgeBaseStatus =
  | "draft"
  | "processing"
  | "published"
  | "failed"
  | "archived";

export interface Tenant {
  tenantId: string;
  businessName: string;
  businessType: string[];
  status: TenantStatus;
  ownerUserId: string;
  country: string;
  timezone: string;
  currency: string;
  enabledModules: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface User {
  userId: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TenantMembership {
  membershipId: string;
  tenantId: string;
  userId: string;
  role: UserRole;
  status: "active" | "invited" | "removed";
  invitedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface KnowledgeBaseItem {
  documentId: string;
  tenantId: string;
  title: string;
  contentReference: string;
  category: "faq" | "policy" | "businessInfo" | "document";
  language: string;
  branchId: string | null;
  sourceType: string;
  sourceReference: string | null;
  status: KnowledgeBaseStatus;
  version: number;
  effectiveAt: Timestamp | null;
  reviewAt: Timestamp | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface KnowledgeChunk {
  chunkId: string;
  tenantId: string;
  documentId: string;
  content: string;
  language: string;
  status: KnowledgeBaseStatus;
  sourceOffsets: Record<string, unknown> | null;
  embeddingReference: string | null;
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Package {
  packageId: string;
  tenantId: string;
  name: string;
  description: string | null;
  priceMinorUnits: number;
  currency: string;
  interval: "monthly" | "yearly" | "oneTime" | null;
  features: string[];
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ApiKeyConfig {
  keyId: string;
  tenantId: string;
  provider: "gemini" | "meta_whatsapp" | "qr_provider";
  credentialType: string;
  ciphertext: string;
  nonceOrIv: string;
  authTag: string | null;
  keyVersion: number;
  maskedHint: string;
  status: ApiKeyStatus;
  lastValidatedAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatSession {
  conversationId: string;
  tenantId: string;
  channel: Channel;
  channelConversationId: string;
  customerReference: string | null;
  status: ConversationStatus;
  assignedTo: string | null;
  aiEnabled: boolean;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatMessage {
  messageId: string;
  tenantId: string;
  conversationId: string;
  providerMessageId: string | null;
  direction: MessageDirection;
  senderType: MessageSenderType;
  content: string;
  processingStatus: "pending" | "processed" | "failed";
  deliveryStatus: "sent" | "delivered" | "read" | "failed" | null;
  sourceReferences: string[];
  toolActionReferences: string[];
  createdAt: Timestamp;
}

export interface ApiKeyMetadata {
  keyId: string;
  tenantId: string;
  provider: "gemini" | "meta_whatsapp" | "qr_provider";
  credentialType: string;
  maskedHint: string;
  status: ApiKeyStatus;
  keyVersion: number;
  lastValidatedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
