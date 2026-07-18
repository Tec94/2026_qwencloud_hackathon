import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getDatabaseUrlForRuntime } from "@/lib/server/runtime-config";
import { schema } from "./schema";

export interface DatabaseContext {
  sqlite: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;
  filename: string;
}

function databaseFilename(databaseUrl?: string): string {
  const value = databaseUrl?.trim() || "file:./data/threadline.db";
  if (!value.startsWith("file:")) {
    throw new Error("DATABASE_URL must use the file: SQLite format.");
  }
  const filename = value.slice("file:".length);
  return filename === ":memory:" ? filename : path.resolve(filename);
}

export function migrateDatabase(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS demo_workspaces (
      id TEXT PRIMARY KEY,
      seed_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('patient','clinician')),
      display_name TEXT NOT NULL,
      is_synthetic INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_workspace_role_unique ON users(workspace_id, role);
    CREATE INDEX IF NOT EXISTS users_workspace_idx ON users(workspace_id);
    CREATE TABLE IF NOT EXISTS care_relationships (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clinician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consent_status TEXT NOT NULL DEFAULT 'granted' CHECK(consent_status IN ('granted','revoked')),
      consented_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS care_relationship_unique ON care_relationships(workspace_id, patient_id, clinician_id);
    CREATE INDEX IF NOT EXISTS care_relationship_patient_idx ON care_relationships(patient_id, consent_status);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('patient','clinician')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS therapy_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clinician_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','finalizing','finalized','failed')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      transcript_deleted_at TEXT,
      finalization_error_code TEXT,
      safety_follow_up INTEGER NOT NULL DEFAULT 0,
      safety_reason_codes_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS therapy_sessions_patient_status_idx ON therapy_sessions(patient_id, status, started_at);
    CREATE INDEX IF NOT EXISTS therapy_sessions_workspace_idx ON therapy_sessions(workspace_id, started_at);
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
      author_role TEXT NOT NULL CHECK(author_role IN ('patient','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_messages_session_created_idx ON session_messages(session_id, created_at);
    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE REFERENCES therapy_sessions(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      narrative TEXT NOT NULL,
      themes_json TEXT NOT NULL,
      follow_ups_json TEXT NOT NULL,
      safety_flags_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','reviewed')),
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      reviewed_at TEXT,
      reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_summaries_patient_status_idx ON session_summaries(patient_id, status, created_at);
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_session_id TEXT NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('goal','preference','coping_strategy','trigger','symptom','context','follow_up')),
      statement TEXT,
      importance INTEGER NOT NULL CHECK(importance BETWEEN 1 AND 5),
      confidence_basis_points INTEGER NOT NULL CHECK(confidence_basis_points BETWEEN 0 AND 10000),
      status TEXT NOT NULL CHECK(status IN ('proposed','active','superseded','disputed','forgotten','rejected')),
      embedding_blob BLOB,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      effective_at TEXT NOT NULL,
      supersedes_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memories_patient_status_idx ON memories(patient_id, status, effective_at);
    CREATE INDEX IF NOT EXISTS memories_source_session_idx ON memories(source_session_id);
    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES demo_workspaces(id) ON DELETE CASCADE,
      memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memory_events_memory_created_idx ON memory_events(memory_id, created_at);
    CREATE TABLE IF NOT EXISTS retrieval_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
      candidate_count INTEGER NOT NULL,
      selected_json TEXT NOT NULL,
      context_characters INTEGER NOT NULL,
      context_limit INTEGER NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      latency_ms INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS retrieval_runs_session_created_idx ON retrieval_runs(session_id, created_at);
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('window','concurrency')),
      count INTEGER NOT NULL,
      window_started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON rate_limit_buckets(expires_at);
  `);
  const therapyColumns = sqlite.pragma("table_info(therapy_sessions)") as Array<{ name: string }>;
  if (!therapyColumns.some((column) => column.name === "safety_follow_up")) {
    sqlite.exec("ALTER TABLE therapy_sessions ADD COLUMN safety_follow_up INTEGER NOT NULL DEFAULT 0");
  }
  if (!therapyColumns.some((column) => column.name === "safety_reason_codes_json")) {
    sqlite.exec("ALTER TABLE therapy_sessions ADD COLUMN safety_reason_codes_json TEXT NOT NULL DEFAULT '[]'");
  }
}

export function createDatabase(databaseUrl?: string): DatabaseContext {
  const filename = databaseFilename(databaseUrl);
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") sqlite.pragma("journal_mode = WAL");
  migrateDatabase(sqlite);
  return { sqlite, orm: drizzle(sqlite, { schema }), filename };
}

let singleton: DatabaseContext | undefined;

export function getDatabase(): DatabaseContext {
  singleton ??= createDatabase(getDatabaseUrlForRuntime());
  return singleton;
}

export function closeDatabase(): void {
  singleton?.sqlite.close();
  singleton = undefined;
}
