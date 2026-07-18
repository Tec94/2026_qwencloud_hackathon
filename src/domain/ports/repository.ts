import type {
  ChatMessage,
  MemoryRecord,
  MemoryView,
  Principal,
  RetrievalTrace,
  SessionExtraction,
  SessionSummaryView,
  TherapySessionStatus,
  UserRole,
} from "../models";

export interface DemoIdentity {
  workspaceId: string;
  userId: string;
  role: UserRole;
  displayName: string;
  expiresAt: Date;
}

export interface SessionView {
  id: string;
  patientId: string;
  clinicianId: string | null;
  status: TherapySessionStatus;
  startedAt: Date;
  endedAt: Date | null;
  transcriptDeletedAt: Date | null;
  safetyFollowUp: boolean;
  safetyReasonCodes: string[];
  messageCount: number;
}

export interface FinalizeMemoryInput {
  id: string;
  embedding: number[];
  embeddingModel: string;
}

export interface ThreadlineRepositoryPort {
  createWorkspace(): DemoIdentity[];
  findWorkspaceIdentity(workspaceId: string, role: UserRole): DemoIdentity | null;
  createAuthSession(identity: DemoIdentity, tokenHash: string, expiresAt: Date): string;
  findPrincipalByTokenHash(tokenHash: string, now?: Date): Principal | null;
  revokeAuthSession(sessionId: string): void;
  createTherapySession(principal: Principal): SessionView;
  getTherapySession(principal: Principal, sessionId: string): SessionView | null;
  listTherapySessions(principal: Principal): SessionView[];
  appendMessage(sessionId: string, message: ChatMessage): void;
  listMessages(sessionId: string): ChatMessage[];
  countMessages(sessionId: string): number;
  listActiveMemories(patientId: string, workspaceId: string): MemoryRecord[];
  listMemoriesForPrincipal(principal: Principal, patientId: string): MemoryView[];
  saveRetrievalRun(sessionId: string, trace: RetrievalTrace): RetrievalTrace;
  flagSafetyFollowUp(sessionId: string, reasonCodes: string[]): void;
  listRetrievalRuns(principal: Principal, sessionId: string): RetrievalTrace[];
  markSessionFinalizing(sessionId: string): void;
  markSessionFailed(sessionId: string): void;
  finalizeSession(
    principal: Principal,
    sessionId: string,
    extraction: SessionExtraction,
    memories: FinalizeMemoryInput[],
    model: string,
    promptVersion: string,
  ): { summary: SessionSummaryView; memories: MemoryView[] };
  getSessionSummary(principal: Principal, sessionId: string): SessionSummaryView | null;
  assertMemoryEditable(principal: Principal, memoryId: string): MemoryView;
  updateMemory(
    principal: Principal,
    memoryId: string,
    changes: {
      statement?: string;
      importance?: number;
      embedding?: number[];
      embeddingModel?: string;
    },
  ): MemoryView;
  transitionMemory(
    principal: Principal,
    memoryId: string,
    action: "approve" | "reject" | "dispute" | "forget",
  ): MemoryView;
  consumeRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number };
  acquireConcurrency(key: string, limit: number, ttlMs: number): boolean;
  releaseConcurrency(key: string): void;
  cleanupExpired(now?: Date): { workspaces: number; sessions: number; rateLimits: number };
  isHealthy(): boolean;
}
