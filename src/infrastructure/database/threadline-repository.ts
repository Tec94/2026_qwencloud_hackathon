import type Database from "better-sqlite3";
import { AppError } from "@/domain/errors";
import type {
  MemoryCategory,
  MemoryRecord,
  MemoryStatus,
  MemoryView,
  Principal,
  RetrievalTrace,
  SessionSummaryView,
  TherapySessionStatus,
  UserRole,
} from "@/domain/models";
import type {
  DemoIdentity,
  FinalizeMemoryInput,
  SessionView,
  ThreadlineRepositoryPort,
} from "@/domain/ports/repository";
import type { ChatMessage, SessionExtraction } from "@/domain/models";
import { getDatabase, type DatabaseContext } from "./database";

interface IdentityRow {
  workspace_id: string;
  user_id: string;
  role: UserRole;
  display_name: string;
  expires_at: string;
}

interface PrincipalRow extends IdentityRow {
  session_id: string;
  session_expires_at: string;
}

interface SessionRow {
  id: string;
  patient_id: string;
  clinician_id: string | null;
  status: TherapySessionStatus;
  started_at: string;
  ended_at: string | null;
  transcript_deleted_at: string | null;
  safety_follow_up: number;
  safety_reason_codes_json: string;
  message_count: number;
}

interface MessageRow {
  id: string;
  author_role: "patient" | "assistant";
  content: string;
  created_at: string;
}

interface MemoryRow {
  id: string;
  workspace_id: string;
  patient_id: string;
  source_session_id: string;
  category: MemoryCategory;
  statement: string | null;
  importance: number;
  confidence_basis_points: number;
  status: MemoryStatus;
  embedding_blob: Buffer | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  effective_at: string;
  supersedes_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SummaryRow {
  id: string;
  session_id: string;
  narrative: string;
  themes_json: string;
  follow_ups_json: string;
  safety_flags_json: string;
  status: "pending_review" | "reviewed";
  model: string;
  prompt_version: string;
  transcript_deleted_at: string | null;
  created_at: string;
}

interface RetrievalRow {
  id: string;
  candidate_count: number;
  selected_json: string;
  context_characters: number;
  context_limit: number;
  model: string;
  prompt_version: string;
  latency_ms: number | null;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function bufferToVector(buffer: Buffer | null, dimensions: number | null): number[] | null {
  if (!buffer || !dimensions || buffer.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) {
    return null;
  }
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return Array.from(new Float32Array(copy));
}

function sessionView(row: SessionRow): SessionView {
  return {
    id: row.id,
    patientId: row.patient_id,
    clinicianId: row.clinician_id,
    status: row.status,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    transcriptDeletedAt: row.transcript_deleted_at ? new Date(row.transcript_deleted_at) : null,
    safetyFollowUp: row.safety_follow_up === 1,
    safetyReasonCodes: parseJsonArray(row.safety_reason_codes_json),
    messageCount: row.message_count,
  };
}

function memoryRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    patientId: row.patient_id,
    sourceSessionId: row.source_session_id,
    category: row.category,
    statement: row.statement,
    importance: row.importance,
    confidence: row.confidence_basis_points / 10_000,
    status: row.status,
    embedding: bufferToVector(row.embedding_blob, row.embedding_dimensions),
    embeddingModel: row.embedding_model,
    embeddingDimensions: row.embedding_dimensions,
    effectiveAt: new Date(row.effective_at),
    supersedesId: row.supersedes_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function memoryView(row: MemoryRow): MemoryView {
  const record = memoryRecord(row);
  return {
    id: record.id,
    patientId: record.patientId,
    sourceSessionId: record.sourceSessionId,
    category: record.category,
    statement: record.statement,
    importance: record.importance,
    confidence: record.confidence,
    status: record.status,
    effectiveAt: record.effectiveAt,
    supersedesId: record.supersedesId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function summaryView(row: SummaryRow): SessionSummaryView {
  return {
    id: row.id,
    sessionId: row.session_id,
    narrative: row.narrative,
    themes: parseJsonArray(row.themes_json),
    followUps: parseJsonArray(row.follow_ups_json),
    safetyFlags: parseJsonArray(row.safety_flags_json),
    status: row.status,
    model: row.model,
    promptVersion: row.prompt_version,
    transcriptDeletedAt: row.transcript_deleted_at ? new Date(row.transcript_deleted_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export class ThreadlineRepository implements ThreadlineRepositoryPort {
  private readonly sqlite: Database.Database;

  constructor(context: DatabaseContext = getDatabase()) {
    this.sqlite = context.sqlite;
  }

  createWorkspace(): DemoIdentity[] {
    const workspaceId = crypto.randomUUID();
    const patientId = crypto.randomUUID();
    const clinicianId = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare("INSERT INTO demo_workspaces (id, seed_version, created_at, expires_at) VALUES (?, 1, ?, ?)")
        .run(workspaceId, createdAt, expiresAt);
      const insertUser = this.sqlite.prepare(
        "INSERT INTO users (id, workspace_id, role, display_name, is_synthetic, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      );
      insertUser.run(patientId, workspaceId, "patient", "Maya Chen", createdAt);
      insertUser.run(clinicianId, workspaceId, "clinician", "Dr. Chen", createdAt);
      this.sqlite
        .prepare(
          `INSERT INTO care_relationships
           (id, workspace_id, patient_id, clinician_id, consent_status, consented_at)
           VALUES (?, ?, ?, ?, 'granted', ?)`,
        )
        .run(crypto.randomUUID(), workspaceId, patientId, clinicianId, createdAt);
    })();

    const expiry = new Date(expiresAt);
    return [
      { workspaceId, userId: patientId, role: "patient", displayName: "Maya Chen", expiresAt: expiry },
      {
        workspaceId,
        userId: clinicianId,
        role: "clinician",
        displayName: "Dr. Chen",
        expiresAt: expiry,
      },
    ];
  }

  findWorkspaceIdentity(workspaceId: string, role: UserRole): DemoIdentity | null {
    const row = this.sqlite
      .prepare(
        `SELECT w.id AS workspace_id, u.id AS user_id, u.role, u.display_name, w.expires_at
         FROM demo_workspaces w JOIN users u ON u.workspace_id = w.id
         WHERE w.id = ? AND u.role = ? AND w.expires_at > ?`,
      )
      .get(workspaceId, role, nowIso()) as IdentityRow | undefined;
    return row
      ? {
          workspaceId: row.workspace_id,
          userId: row.user_id,
          role: row.role,
          displayName: row.display_name,
          expiresAt: new Date(row.expires_at),
        }
      : null;
  }

  createAuthSession(identity: DemoIdentity, tokenHash: string, expiresAt: Date): string {
    const id = crypto.randomUUID();
    this.sqlite
      .prepare(
        `INSERT INTO auth_sessions
         (id, token_hash, workspace_id, user_id, role, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tokenHash,
        identity.workspaceId,
        identity.userId,
        identity.role,
        nowIso(),
        expiresAt.toISOString(),
      );
    return id;
  }

  findPrincipalByTokenHash(tokenHash: string, now = new Date()): Principal | null {
    const row = this.sqlite
      .prepare(
        `SELECT a.id AS session_id, a.workspace_id, a.user_id, a.role, u.display_name,
                w.expires_at, a.expires_at AS session_expires_at
         FROM auth_sessions a
         JOIN users u ON u.id = a.user_id
         JOIN demo_workspaces w ON w.id = a.workspace_id
         WHERE a.token_hash = ? AND a.expires_at > ? AND w.expires_at > ?`,
      )
      .get(tokenHash, now.toISOString(), now.toISOString()) as PrincipalRow | undefined;
    return row
      ? {
          sessionId: row.session_id,
          workspaceId: row.workspace_id,
          userId: row.user_id,
          role: row.role,
          displayName: row.display_name,
          expiresAt: new Date(
            row.session_expires_at < row.expires_at ? row.session_expires_at : row.expires_at,
          ),
        }
      : null;
  }

  revokeAuthSession(sessionId: string): void {
    this.sqlite.prepare("DELETE FROM auth_sessions WHERE id = ?").run(sessionId);
  }

  createTherapySession(principal: Principal): SessionView {
    if (principal.role !== "patient") {
      throw new AppError("FORBIDDEN", "Only the patient can begin a reflection session.", 403);
    }
    const relationship = this.sqlite
      .prepare(
        `SELECT clinician_id FROM care_relationships
         WHERE workspace_id = ? AND patient_id = ? AND consent_status = 'granted'`,
      )
      .get(principal.workspaceId, principal.userId) as { clinician_id: string } | undefined;
    if (!relationship) {
      throw new AppError("CONSENT_REQUIRED", "Memory consent must be active before a session begins.", 409);
    }
    const id = crypto.randomUUID();
    const startedAt = nowIso();
    this.sqlite
      .prepare(
        `INSERT INTO therapy_sessions
         (id, workspace_id, patient_id, clinician_id, status, started_at)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      )
      .run(id, principal.workspaceId, principal.userId, relationship.clinician_id, startedAt);
    return {
      id,
      patientId: principal.userId,
      clinicianId: relationship.clinician_id,
      status: "active",
      startedAt: new Date(startedAt),
      endedAt: null,
      transcriptDeletedAt: null,
      safetyFollowUp: false,
      safetyReasonCodes: [],
      messageCount: 0,
    };
  }

  getTherapySession(principal: Principal, sessionId: string): SessionView | null {
    const row = this.authorizedSessionRow(principal, sessionId);
    return row ? sessionView(row) : null;
  }

  listTherapySessions(principal: Principal): SessionView[] {
    const column = principal.role === "patient" ? "patient_id" : "clinician_id";
    const consentClause =
      principal.role === "clinician"
        ? `AND EXISTS (
             SELECT 1 FROM care_relationships c
             WHERE c.workspace_id = t.workspace_id
               AND c.patient_id = t.patient_id
               AND c.clinician_id = t.clinician_id
               AND c.consent_status = 'granted'
           )`
        : "";
    const rows = this.sqlite
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM session_messages m WHERE m.session_id = t.id) AS message_count
         FROM therapy_sessions t
         WHERE t.workspace_id = ? AND t.${column} = ?
         ${consentClause}
         ORDER BY t.started_at DESC LIMIT 100`,
      )
      .all(principal.workspaceId, principal.userId) as SessionRow[];
    return rows.map(sessionView);
  }

  appendMessage(sessionId: string, message: ChatMessage): void {
    this.sqlite
      .prepare(
        "INSERT INTO session_messages (id, session_id, author_role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        message.id ?? crypto.randomUUID(),
        sessionId,
        message.role,
        message.content,
        message.createdAt?.toISOString() ?? nowIso(),
      );
  }

  listMessages(sessionId: string): ChatMessage[] {
    const rows = this.sqlite
      .prepare(
        "SELECT id, author_role, content, created_at FROM session_messages WHERE session_id = ? ORDER BY created_at, rowid",
      )
      .all(sessionId) as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.author_role,
      content: row.content,
      createdAt: new Date(row.created_at),
    }));
  }

  countMessages(sessionId: string): number {
    const row = this.sqlite
      .prepare("SELECT COUNT(*) AS count FROM session_messages WHERE session_id = ?")
      .get(sessionId) as { count: number };
    return row.count;
  }

  listActiveMemories(patientId: string, workspaceId: string): MemoryRecord[] {
    const rows = this.sqlite
      .prepare(
        `SELECT m.* FROM memories m
         WHERE m.workspace_id = ? AND m.patient_id = ? AND m.status = 'active'
           AND EXISTS (
             SELECT 1 FROM care_relationships c
             WHERE c.workspace_id = m.workspace_id AND c.patient_id = m.patient_id
               AND c.consent_status = 'granted'
           )
         ORDER BY m.effective_at DESC`,
      )
      .all(workspaceId, patientId) as MemoryRow[];
    return rows.map(memoryRecord);
  }

  listMemoriesForPrincipal(principal: Principal, patientId: string): MemoryView[] {
    this.assertPatientAccess(principal, patientId);
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM memories WHERE workspace_id = ? AND patient_id = ?
         ORDER BY created_at DESC`,
      )
      .all(principal.workspaceId, patientId) as MemoryRow[];
    return rows.map(memoryView);
  }

  saveRetrievalRun(sessionId: string, trace: RetrievalTrace): RetrievalTrace {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    this.sqlite
      .prepare(
        `INSERT INTO retrieval_runs
         (id, session_id, candidate_count, selected_json, context_characters,
          context_limit, model, prompt_version, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        sessionId,
        trace.candidateCount,
        JSON.stringify(trace.selected),
        trace.contextCharacters,
        trace.contextLimit,
        trace.model,
        trace.promptVersion,
        trace.latencyMs ?? null,
        createdAt,
      );
    if (trace.selected.length > 0) {
      const session = this.sqlite
        .prepare("SELECT workspace_id, patient_id FROM therapy_sessions WHERE id = ?")
        .get(sessionId) as { workspace_id: string; patient_id: string } | undefined;
      if (session) {
        const insertEvent = this.sqlite.prepare(
          `INSERT INTO memory_events
           (id, workspace_id, memory_id, actor_id, action, before_json, after_json, created_at)
           VALUES (?, ?, ?, ?, 'retrieved', NULL, NULL, ?)`,
        );
        this.sqlite.transaction(() => {
          for (const selected of trace.selected) {
            insertEvent.run(
              crypto.randomUUID(),
              session.workspace_id,
              selected.id,
              session.patient_id,
              createdAt,
            );
          }
        })();
      }
    }
    return { ...trace, id, createdAt: new Date(createdAt) };
  }

  flagSafetyFollowUp(sessionId: string, reasonCodes: string[]): void {
    this.sqlite
      .prepare(
        `UPDATE therapy_sessions
         SET safety_follow_up = 1, safety_reason_codes_json = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify([...new Set(reasonCodes)].slice(0, 8)), sessionId);
  }

  listRetrievalRuns(principal: Principal, sessionId: string): RetrievalTrace[] {
    if (!this.authorizedSessionRow(principal, sessionId)) {
      throw new AppError("NOT_FOUND", "Session not found.", 404);
    }
    const rows = this.sqlite
      .prepare("SELECT * FROM retrieval_runs WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as RetrievalRow[];
    return rows.map((row) => ({
      id: row.id,
      candidateCount: row.candidate_count,
      selected: JSON.parse(row.selected_json) as RetrievalTrace["selected"],
      contextCharacters: row.context_characters,
      contextLimit: row.context_limit,
      model: row.model,
      promptVersion: row.prompt_version,
      latencyMs: row.latency_ms ?? undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  markSessionFinalizing(sessionId: string): void {
    const result = this.sqlite
      .prepare(
        `UPDATE therapy_sessions SET status = 'finalizing', finalization_error_code = NULL
         WHERE id = ? AND status IN ('active', 'failed')`,
      )
      .run(sessionId);
    if (result.changes !== 1) {
      throw new AppError("SESSION_NOT_ACTIVE", "This session cannot be finalized again.", 409);
    }
  }

  markSessionFailed(sessionId: string): void {
    this.sqlite
      .prepare(
        "UPDATE therapy_sessions SET status = 'failed', finalization_error_code = 'EXTRACTION_FAILED' WHERE id = ? AND status = 'finalizing'",
      )
      .run(sessionId);
  }

  finalizeSession(
    principal: Principal,
    sessionId: string,
    extraction: SessionExtraction,
    memoryInputs: FinalizeMemoryInput[],
    model: string,
    promptVersion: string,
  ): { summary: SessionSummaryView; memories: MemoryView[] } {
    const session = this.authorizedSessionRow(principal, sessionId);
    if (!session || principal.role !== "patient" || session.status !== "finalizing") {
      throw new AppError("SESSION_NOT_ACTIVE", "This session is not ready to finalize.", 409);
    }
    const byId = new Map(memoryInputs.map((memory) => [memory.id, memory]));
    if (byId.size !== extraction.memories.length) {
      throw new AppError("EXTRACTION_FAILED", "Memory extraction could not be saved safely.", 502);
    }
    const summaryId = crypto.randomUUID();
    const completedAt = nowIso();

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO session_summaries
           (id, session_id, patient_id, narrative, themes_json, follow_ups_json,
            safety_flags_json, status, model, prompt_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?)`,
        )
        .run(
          summaryId,
          sessionId,
          session.patient_id,
          extraction.narrative,
          JSON.stringify(extraction.themes),
          JSON.stringify(extraction.followUps),
          JSON.stringify(extraction.safetyFlags),
          model,
          promptVersion,
          completedAt,
        );

      const insertMemory = this.sqlite.prepare(
        `INSERT INTO memories
         (id, workspace_id, patient_id, source_session_id, category, statement,
          importance, confidence_basis_points, status, embedding_blob, embedding_model,
          embedding_dimensions, effective_at, supersedes_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertEvent = this.sqlite.prepare(
        `INSERT INTO memory_events
         (id, workspace_id, memory_id, actor_id, action, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, 'proposed', NULL, ?, ?)`,
      );
      extraction.memories.forEach((memory, index) => {
        const stored = memoryInputs[index];
        if (!stored) throw new Error("Missing extracted memory embedding.");
        insertMemory.run(
          stored.id,
          principal.workspaceId,
          session.patient_id,
          sessionId,
          memory.category,
          memory.statement,
          memory.importance,
          Math.round(memory.confidence * 10_000),
          vectorToBuffer(stored.embedding),
          stored.embeddingModel,
          stored.embedding.length,
          completedAt,
          memory.supersedesMemoryId ?? null,
          completedAt,
          completedAt,
        );
        insertEvent.run(
          crypto.randomUUID(),
          principal.workspaceId,
          stored.id,
          principal.userId,
          JSON.stringify({ category: memory.category, statement: memory.statement }),
          completedAt,
        );
      });

      this.sqlite.prepare("DELETE FROM session_messages WHERE session_id = ?").run(sessionId);
      this.sqlite
        .prepare(
          `UPDATE therapy_sessions
           SET status = 'finalized', ended_at = ?, transcript_deleted_at = ?, finalization_error_code = NULL
           WHERE id = ?`,
        )
        .run(completedAt, completedAt, sessionId);
    })();

    const summary = this.getSessionSummary(principal, sessionId);
    if (!summary) throw new Error("Finalized summary was not persisted.");
    return {
      summary,
      memories: this.listMemoriesForPrincipal(principal, session.patient_id).filter(
        (memory) => memory.sourceSessionId === sessionId,
      ),
    };
  }

  getSessionSummary(principal: Principal, sessionId: string): SessionSummaryView | null {
    if (!this.authorizedSessionRow(principal, sessionId)) {
      throw new AppError("NOT_FOUND", "Session not found.", 404);
    }
    const row = this.sqlite
      .prepare(
        `SELECT s.*, t.transcript_deleted_at
         FROM session_summaries s JOIN therapy_sessions t ON t.id = s.session_id
         WHERE s.session_id = ?`,
      )
      .get(sessionId) as SummaryRow | undefined;
    return row ? summaryView(row) : null;
  }

  assertMemoryEditable(principal: Principal, memoryId: string): MemoryView {
    return memoryView(this.editableMemoryRow(principal, memoryId));
  }

  updateMemory(
    principal: Principal,
    memoryId: string,
    changes: {
      statement?: string;
      importance?: number;
      embedding?: number[];
      embeddingModel?: string;
    },
  ): MemoryView {
    const memory = this.editableMemoryRow(principal, memoryId);
    const nextStatement = changes.statement ?? memory.statement;
    const nextImportance = changes.importance ?? memory.importance;
    const updatedAt = nowIso();
    this.sqlite.transaction(() => {
      const embedding = changes.embedding ? vectorToBuffer(changes.embedding) : memory.embedding_blob;
      const embeddingModel = changes.embedding ? (changes.embeddingModel ?? memory.embedding_model) : memory.embedding_model;
      const embeddingDimensions = changes.embedding ? changes.embedding.length : memory.embedding_dimensions;
      this.sqlite
        .prepare(
          `UPDATE memories SET statement = ?, importance = ?, embedding_blob = ?,
           embedding_model = ?, embedding_dimensions = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          nextStatement,
          nextImportance,
          embedding,
          embeddingModel,
          embeddingDimensions,
          updatedAt,
          memoryId,
        );
      this.insertMemoryEvent(
        principal,
        memoryId,
        "edited",
        { statement: memory.statement, importance: memory.importance },
        { statement: nextStatement, importance: nextImportance },
        updatedAt,
      );
    })();
    return memoryView(this.requiredMemoryRow(memoryId));
  }

  transitionMemory(
    principal: Principal,
    memoryId: string,
    action: "approve" | "reject" | "dispute" | "forget",
  ): MemoryView {
    const memory = this.authorizedMemoryRow(principal, memoryId);
    if (!memory) throw new AppError("NOT_FOUND", "Memory not found.", 404);
    if ((action === "approve" || action === "reject") && principal.role !== "clinician") {
      throw new AppError("FORBIDDEN", "Only the linked clinician can review this memory.", 403);
    }
    if ((action === "dispute" || action === "forget") && principal.role !== "patient") {
      throw new AppError("FORBIDDEN", "Only the patient can change this memory state.", 403);
    }
    const allowed: Record<typeof action, MemoryStatus[]> = {
      approve: ["proposed", "disputed"],
      reject: ["proposed", "disputed"],
      dispute: ["proposed", "active"],
      forget: ["proposed", "active", "disputed", "superseded", "rejected"],
    };
    if (!allowed[action].includes(memory.status)) {
      throw new AppError("CONFLICT", "That memory action is not available in its current state.", 409);
    }
    const nextStatus: MemoryStatus = {
      approve: "active",
      reject: "rejected",
      dispute: "disputed",
      forget: "forgotten",
    }[action] as MemoryStatus;
    const updatedAt = nowIso();

    this.sqlite.transaction(() => {
      if (action === "approve" && memory.supersedes_id) {
        const superseded = this.sqlite
          .prepare(
            `UPDATE memories SET status = 'superseded', updated_at = ?
             WHERE id = ? AND workspace_id = ? AND patient_id = ? AND status = 'active'`,
          )
          .run(updatedAt, memory.supersedes_id, principal.workspaceId, memory.patient_id);
        if (superseded.changes === 1) {
          this.insertMemoryEvent(
            principal,
            memory.supersedes_id,
            "superseded",
            { status: "active" },
            { status: "superseded", supersededBy: memoryId },
            updatedAt,
          );
        }
      }
      if (action === "forget") {
        this.sqlite
          .prepare(
            `UPDATE memories
             SET status = 'forgotten', statement = NULL, embedding_blob = NULL,
                 embedding_model = NULL, embedding_dimensions = NULL, updated_at = ?
             WHERE id = ?`,
          )
          .run(updatedAt, memoryId);
        this.sqlite
          .prepare("UPDATE memory_events SET before_json = NULL, after_json = NULL WHERE memory_id = ?")
          .run(memoryId);
        this.scrubMemoryFromRetrievalRuns(memory);
        this.insertMemoryEvent(principal, memoryId, "forgotten", null, null, updatedAt);
      } else {
        this.sqlite
          .prepare("UPDATE memories SET status = ?, updated_at = ? WHERE id = ?")
          .run(nextStatus, updatedAt, memoryId);
        this.insertMemoryEvent(
          principal,
          memoryId,
          action === "approve" ? "approved" : action === "reject" ? "rejected" : "disputed",
          { status: memory.status },
          { status: nextStatus },
          updatedAt,
        );
      }
      if (action === "approve" || action === "reject") {
        const pending = this.sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM memories WHERE source_session_id = ? AND status IN ('proposed','disputed')",
          )
          .get(memory.source_session_id) as { count: number };
        if (pending.count === 0) {
          this.sqlite
            .prepare(
              `UPDATE session_summaries SET status = 'reviewed', reviewed_at = ?, reviewer_id = ?
               WHERE session_id = ?`,
            )
            .run(updatedAt, principal.userId, memory.source_session_id);
        }
      }
    })();
    return memoryView(this.requiredMemoryRow(memoryId));
  }

  consumeRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; retryAfterMs: number } {
    const current = Date.now();
    return this.sqlite.transaction(() => {
      const row = this.sqlite
        .prepare("SELECT count, expires_at FROM rate_limit_buckets WHERE key = ? AND kind = 'window'")
        .get(key) as { count: number; expires_at: string } | undefined;
      const expiryMs = row ? new Date(row.expires_at).getTime() : 0;
      if (!row || expiryMs <= current) {
        const expiresAt = new Date(current + windowMs).toISOString();
        this.sqlite
          .prepare(
            `INSERT INTO rate_limit_buckets
             (key, kind, count, window_started_at, expires_at, updated_at)
             VALUES (?, 'window', 1, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET kind = 'window', count = 1,
               window_started_at = excluded.window_started_at,
               expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
          )
          .run(key, new Date(current).toISOString(), expiresAt, new Date(current).toISOString());
        return { allowed: true, retryAfterMs: 0 };
      }
      if (row.count >= limit) {
        return { allowed: false, retryAfterMs: Math.max(1, expiryMs - current) };
      }
      this.sqlite
        .prepare("UPDATE rate_limit_buckets SET count = count + 1, updated_at = ? WHERE key = ?")
        .run(new Date(current).toISOString(), key);
      return { allowed: true, retryAfterMs: 0 };
    })();
  }

  acquireConcurrency(key: string, limit: number, ttlMs: number): boolean {
    const current = Date.now();
    return this.sqlite.transaction(() => {
      const row = this.sqlite
        .prepare("SELECT count, expires_at FROM rate_limit_buckets WHERE key = ? AND kind = 'concurrency'")
        .get(key) as { count: number; expires_at: string } | undefined;
      const expired = !row || new Date(row.expires_at).getTime() <= current;
      if (expired) {
        const timestamp = new Date(current).toISOString();
        this.sqlite
          .prepare(
            `INSERT INTO rate_limit_buckets
             (key, kind, count, window_started_at, expires_at, updated_at)
             VALUES (?, 'concurrency', 1, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET kind = 'concurrency', count = 1,
               window_started_at = excluded.window_started_at,
               expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
          )
          .run(key, timestamp, new Date(current + ttlMs).toISOString(), timestamp);
        return true;
      }
      if (row.count >= limit) return false;
      this.sqlite
        .prepare("UPDATE rate_limit_buckets SET count = count + 1, updated_at = ? WHERE key = ?")
        .run(new Date(current).toISOString(), key);
      return true;
    })();
  }

  releaseConcurrency(key: string): void {
    this.sqlite
      .prepare(
        `UPDATE rate_limit_buckets SET count = MAX(0, count - 1), updated_at = ?
         WHERE key = ? AND kind = 'concurrency'`,
      )
      .run(nowIso(), key);
  }

  cleanupExpired(now = new Date()): { workspaces: number; sessions: number; rateLimits: number } {
    const nowValue = now.toISOString();
    const staleSessionThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
    return this.sqlite.transaction(() => {
      const sessions = this.sqlite
        .prepare(
          `DELETE FROM session_messages WHERE session_id IN (
             SELECT id FROM therapy_sessions
             WHERE status IN ('active','failed') AND started_at < ?
           )`,
        )
        .run(staleSessionThreshold).changes;
      this.sqlite.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(nowValue);
      const workspaces = this.sqlite
        .prepare("DELETE FROM demo_workspaces WHERE expires_at <= ?")
        .run(nowValue).changes;
      const rateLimits = this.sqlite
        .prepare("DELETE FROM rate_limit_buckets WHERE expires_at <= ?")
        .run(nowValue).changes;
      return { workspaces, sessions, rateLimits };
    })();
  }

  isHealthy(): boolean {
    const row = this.sqlite.prepare("SELECT 1 AS healthy").get() as { healthy: number };
    return row.healthy === 1;
  }

  private authorizedSessionRow(principal: Principal, sessionId: string): SessionRow | null {
    const row = this.sqlite
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM session_messages m WHERE m.session_id = t.id) AS message_count
         FROM therapy_sessions t
         WHERE t.id = ? AND t.workspace_id = ?
           AND (
             (? = 'patient' AND t.patient_id = ?)
             OR (
               ? = 'clinician' AND t.clinician_id = ?
               AND EXISTS (
                 SELECT 1 FROM care_relationships c
                 WHERE c.workspace_id = t.workspace_id
                   AND c.patient_id = t.patient_id
                   AND c.clinician_id = t.clinician_id
                   AND c.consent_status = 'granted'
               )
             )
           )`,
      )
      .get(
        sessionId,
        principal.workspaceId,
        principal.role,
        principal.userId,
        principal.role,
        principal.userId,
      ) as SessionRow | undefined;
    return row ?? null;
  }

  private assertPatientAccess(principal: Principal, patientId: string): void {
    if (principal.role === "patient") {
      if (principal.userId !== patientId) {
        throw new AppError("FORBIDDEN", "You cannot access another patient’s memories.", 403);
      }
      return;
    }
    const relationship = this.sqlite
      .prepare(
        `SELECT 1 FROM care_relationships
         WHERE workspace_id = ? AND patient_id = ? AND clinician_id = ?
           AND consent_status = 'granted'`,
      )
      .get(principal.workspaceId, patientId, principal.userId);
    if (!relationship) {
      throw new AppError("FORBIDDEN", "That patient is not linked to this clinician.", 403);
    }
  }

  private authorizedMemoryRow(principal: Principal, memoryId: string): MemoryRow | null {
    const row = this.sqlite
      .prepare("SELECT * FROM memories WHERE id = ? AND workspace_id = ?")
      .get(memoryId, principal.workspaceId) as MemoryRow | undefined;
    if (!row) return null;
    this.assertPatientAccess(principal, row.patient_id);
    return row;
  }

  private editableMemoryRow(principal: Principal, memoryId: string): MemoryRow {
    if (principal.role !== "clinician") {
      throw new AppError("FORBIDDEN", "Only the linked clinician can edit a proposed memory.", 403);
    }
    const memory = this.authorizedMemoryRow(principal, memoryId);
    if (!memory) throw new AppError("NOT_FOUND", "Memory not found.", 404);
    if (memory.status !== "proposed" && memory.status !== "disputed") {
      throw new AppError("CONFLICT", "Only proposed or disputed memories can be edited.", 409);
    }
    return memory;
  }

  private requiredMemoryRow(memoryId: string): MemoryRow {
    const row = this.sqlite.prepare("SELECT * FROM memories WHERE id = ?").get(memoryId) as
      | MemoryRow
      | undefined;
    if (!row) throw new Error("Memory disappeared during an atomic update.");
    return row;
  }

  private scrubMemoryFromRetrievalRuns(memory: MemoryRow): void {
    const rows = this.sqlite
      .prepare(
        `SELECT r.id, r.selected_json
         FROM retrieval_runs r
         JOIN therapy_sessions t ON t.id = r.session_id
         WHERE t.workspace_id = ? AND t.patient_id = ? AND r.selected_json LIKE ?`,
      )
      .all(memory.workspace_id, memory.patient_id, `%${memory.id}%`) as Array<{
      id: string;
      selected_json: string;
    }>;
    const update = this.sqlite.prepare(
      "UPDATE retrieval_runs SET selected_json = ?, context_characters = ? WHERE id = ?",
    );

    for (const row of rows) {
      let selected: unknown;
      try {
        selected = JSON.parse(row.selected_json);
      } catch {
        continue;
      }
      if (!Array.isArray(selected)) continue;

      const remaining = selected.filter(
        (entry) =>
          !(
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            entry.id === memory.id
          ),
      );
      if (remaining.length === selected.length) continue;

      const contextCharacters = remaining.reduce(
        (total, entry) =>
          total +
          (typeof entry === "object" &&
          entry !== null &&
          "estimatedCharacters" in entry &&
          typeof entry.estimatedCharacters === "number"
            ? entry.estimatedCharacters
            : 0),
        0,
      );
      update.run(JSON.stringify(remaining), contextCharacters, row.id);
    }
  }

  private insertMemoryEvent(
    principal: Principal,
    memoryId: string,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    createdAt: string,
  ): void {
    this.sqlite
      .prepare(
        `INSERT INTO memory_events
         (id, workspace_id, memory_id, actor_id, action, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        principal.workspaceId,
        memoryId,
        principal.userId,
        action,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        createdAt,
      );
  }
}
