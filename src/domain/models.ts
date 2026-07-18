export const USER_ROLES = ["patient", "clinician"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MEMORY_CATEGORIES = [
  "goal",
  "preference",
  "coping_strategy",
  "trigger",
  "symptom",
  "context",
  "follow_up",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryStatus =
  | "proposed"
  | "active"
  | "superseded"
  | "disputed"
  | "forgotten"
  | "rejected";

export type TherapySessionStatus = "active" | "finalizing" | "finalized" | "failed";

export type ConsentStatus = "granted" | "revoked";
export type SummaryStatus = "pending_review" | "reviewed";

export interface Principal {
  sessionId: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  displayName: string;
  expiresAt: Date;
}

export interface ChatMessage {
  id?: string;
  role: "patient" | "assistant";
  content: string;
  createdAt?: Date;
}

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  patientId: string;
  sourceSessionId: string;
  category: MemoryCategory;
  statement: string | null;
  importance: number;
  confidence: number;
  status: MemoryStatus;
  embedding: number[] | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  effectiveAt: Date;
  supersedesId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrievalScoreBreakdown {
  semantic: number;
  importance: number;
  recency: number;
  confidence: number;
  total: number;
}

export interface RetrievedMemory {
  id: string;
  category: MemoryCategory;
  statement: string;
  score: RetrievalScoreBreakdown;
  estimatedCharacters: number;
}

export interface RetrievalTrace {
  id?: string;
  candidateCount: number;
  selected: RetrievedMemory[];
  contextCharacters: number;
  contextLimit: number;
  model: string;
  promptVersion: string;
  latencyMs?: number;
  createdAt?: Date;
}

export interface RiskAssessment {
  level: "none" | "elevated" | "high";
  routeToSupport: boolean;
  reasonCodes: string[];
  source: "rules" | "model" | "combined";
}

export interface ExtractedMemory {
  category: MemoryCategory;
  statement: string;
  importance: number;
  confidence: number;
  supersedesMemoryId?: string | null;
}

export interface SessionExtraction {
  narrative: string;
  themes: string[];
  followUps: string[];
  safetyFlags: string[];
  memories: ExtractedMemory[];
}

export interface SessionSummaryView {
  id: string;
  sessionId: string;
  narrative: string;
  themes: string[];
  followUps: string[];
  safetyFlags: string[];
  status: SummaryStatus;
  model: string;
  promptVersion: string;
  transcriptDeletedAt: Date | null;
  createdAt: Date;
}

export interface MemoryView {
  id: string;
  patientId: string;
  sourceSessionId: string;
  category: MemoryCategory;
  statement: string | null;
  importance: number;
  confidence: number;
  status: MemoryStatus;
  effectiveAt: Date;
  supersedesId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
