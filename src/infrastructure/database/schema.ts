import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const demoWorkspaces = sqliteTable("demo_workspaces", {
  id: text("id").primaryKey(),
  seedVersion: integer("seed_version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => demoWorkspaces.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["patient", "clinician"] }).notNull(),
    displayName: text("display_name").notNull(),
    isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_workspace_role_unique").on(table.workspaceId, table.role),
    index("users_workspace_idx").on(table.workspaceId),
  ],
);

export const careRelationships = sqliteTable(
  "care_relationships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => demoWorkspaces.id, { onDelete: "cascade" }),
    patientId: text("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicianId: text("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentStatus: text("consent_status", { enum: ["granted", "revoked"] })
      .notNull()
      .default("granted"),
    consentedAt: text("consented_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("care_relationship_unique").on(table.workspaceId, table.patientId, table.clinicianId),
    index("care_relationship_patient_idx").on(table.patientId, table.consentStatus),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => demoWorkspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["patient", "clinician"] }).notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const therapySessions = sqliteTable(
  "therapy_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => demoWorkspaces.id, { onDelete: "cascade" }),
    patientId: text("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicianId: text("clinician_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["active", "finalizing", "finalized", "failed"] })
      .notNull()
      .default("active"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    transcriptDeletedAt: text("transcript_deleted_at"),
    finalizationErrorCode: text("finalization_error_code"),
    safetyFollowUp: integer("safety_follow_up", { mode: "boolean" }).notNull().default(false),
    safetyReasonCodesJson: text("safety_reason_codes_json").notNull().default("[]"),
  },
  (table) => [
    index("therapy_sessions_patient_status_idx").on(table.patientId, table.status, table.startedAt),
    index("therapy_sessions_workspace_idx").on(table.workspaceId, table.startedAt),
  ],
);

export const sessionMessages = sqliteTable(
  "session_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => therapySessions.id, { onDelete: "cascade" }),
    authorRole: text("author_role", { enum: ["patient", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("session_messages_session_created_idx").on(table.sessionId, table.createdAt)],
);

export const sessionSummaries = sqliteTable(
  "session_summaries",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => therapySessions.id, { onDelete: "cascade" }),
    patientId: text("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    narrative: text("narrative").notNull(),
    themesJson: text("themes_json").notNull(),
    followUpsJson: text("follow_ups_json").notNull(),
    safetyFlagsJson: text("safety_flags_json").notNull(),
    status: text("status", { enum: ["pending_review", "reviewed"] })
      .notNull()
      .default("pending_review"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    reviewedAt: text("reviewed_at"),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("session_summaries_session_unique").on(table.sessionId),
    index("session_summaries_patient_status_idx").on(table.patientId, table.status, table.createdAt),
  ],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => demoWorkspaces.id, { onDelete: "cascade" }),
    patientId: text("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceSessionId: text("source_session_id")
      .notNull()
      .references(() => therapySessions.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["goal", "preference", "coping_strategy", "trigger", "symptom", "context", "follow_up"],
    }).notNull(),
    statement: text("statement"),
    importance: integer("importance").notNull(),
    confidence: integer("confidence_basis_points").notNull(),
    status: text("status", {
      enum: ["proposed", "active", "superseded", "disputed", "forgotten", "rejected"],
    }).notNull(),
    embeddingBlob: blob("embedding_blob", { mode: "buffer" }),
    embeddingModel: text("embedding_model"),
    embeddingDimensions: integer("embedding_dimensions"),
    effectiveAt: text("effective_at").notNull(),
    supersedesId: text("supersedes_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("memories_patient_status_idx").on(table.patientId, table.status, table.effectiveAt),
    index("memories_source_session_idx").on(table.sourceSessionId),
  ],
);

export const memoryEvents = sqliteTable(
  "memory_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => demoWorkspaces.id, { onDelete: "cascade" }),
    memoryId: text("memory_id").references(() => memories.id, { onDelete: "set null" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("memory_events_memory_created_idx").on(table.memoryId, table.createdAt)],
);

export const retrievalRuns = sqliteTable(
  "retrieval_runs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => therapySessions.id, { onDelete: "cascade" }),
    candidateCount: integer("candidate_count").notNull(),
    selectedJson: text("selected_json").notNull(),
    contextCharacters: integer("context_characters").notNull(),
    contextLimit: integer("context_limit").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("retrieval_runs_session_created_idx").on(table.sessionId, table.createdAt)],
);

export const rateLimitBuckets = sqliteTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    kind: text("kind", { enum: ["window", "concurrency"] }).notNull(),
    count: integer("count").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("rate_limit_buckets_expiry_idx").on(table.expiresAt)],
);

export const schema = {
  demoWorkspaces,
  users,
  careRelationships,
  authSessions,
  therapySessions,
  sessionMessages,
  sessionSummaries,
  memories,
  memoryEvents,
  retrievalRuns,
  rateLimitBuckets,
};
