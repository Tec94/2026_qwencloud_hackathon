import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeDatabase,
  createDatabase,
  getDatabase,
  migrateDatabase,
} from "./database";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "threadline-database-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  closeDatabase();
  vi.unstubAllEnvs();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { force: true, recursive: true });
  }
});

describe("createDatabase", () => {
  it("rejects non-SQLite DATABASE_URL values before opening a connection", () => {
    expect(() => createDatabase("postgresql://localhost/threadline")).toThrow(
      "DATABASE_URL must use the file: SQLite format.",
    );
  });

  it("creates an in-memory database with migrations and defensive pragmas", () => {
    const context = createDatabase("  file::memory:  ");

    expect(context.filename).toBe(":memory:");
    expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(context.sqlite.pragma("busy_timeout", { simple: true })).toBe(5_000);
    const tables = context.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all();
    expect(tables).toEqual([
      "auth_sessions",
      "care_relationships",
      "demo_workspaces",
      "memories",
      "memory_events",
      "rate_limit_buckets",
      "retrieval_runs",
      "session_messages",
      "session_summaries",
      "therapy_sessions",
      "users",
    ]);

    context.sqlite.close();
  });

  it("creates missing parent directories and a WAL-backed file database", () => {
    const directory = temporaryDirectory();
    const filename = path.join(directory, "nested", "threadline.db");
    const context = createDatabase(`file:${filename}`);

    expect(context.filename).toBe(path.resolve(filename));
    expect(existsSync(filename)).toBe(true);
    expect(context.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(context.sqlite
      .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .get()).toBeGreaterThanOrEqual(11);

    context.sqlite.close();
  });

  it("enables foreign-key enforcement on every created connection", () => {
    const context = createDatabase("file::memory:");

    expect(() =>
      context.sqlite
        .prepare(
          `INSERT INTO users
           (id, workspace_id, role, display_name, is_synthetic, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("patient-1", "missing-workspace", "patient", "Maya", 1, new Date().toISOString()),
    ).toThrow(/FOREIGN KEY constraint failed/i);

    context.sqlite.close();
  });
});

describe("migrateDatabase", () => {
  it("is idempotent on an up-to-date schema", () => {
    const sqlite = new Database(":memory:");

    expect(() => {
      migrateDatabase(sqlite);
      migrateDatabase(sqlite);
    }).not.toThrow();
    expect(sqlite
      .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'memories'")
      .pluck()
      .get()).toBe(1);

    sqlite.close();
  });

  it("adds safety columns to a legacy therapy_sessions table exactly once", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE therapy_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        clinician_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        transcript_deleted_at TEXT,
        finalization_error_code TEXT
      )
    `);

    migrateDatabase(sqlite);
    migrateDatabase(sqlite);

    const columns = sqlite.pragma("table_info(therapy_sessions)") as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(columns.filter(({ name }) => name === "safety_follow_up")).toEqual([
      expect.objectContaining({ dflt_value: "0" }),
    ]);
    expect(columns.filter(({ name }) => name === "safety_reason_codes_json")).toEqual([
      expect.objectContaining({ dflt_value: "'[]'" }),
    ]);

    sqlite.close();
  });
});

describe("database singleton lifecycle", () => {
  it("uses DATABASE_URL, reuses the open connection, and replaces it after close", () => {
    vi.stubEnv("DATABASE_URL", "file::memory:");
    closeDatabase();

    const first = getDatabase();
    const reused = getDatabase();
    expect(reused).toBe(first);
    expect(first.sqlite.open).toBe(true);

    closeDatabase();
    expect(first.sqlite.open).toBe(false);

    const replacement = getDatabase();
    expect(replacement).not.toBe(first);
    expect(replacement.sqlite.open).toBe(true);
    expect(replacement.filename).toBe(":memory:");
  });

  it("can be closed repeatedly before or after initialization", () => {
    vi.stubEnv("DATABASE_URL", "file::memory:");

    expect(() => closeDatabase()).not.toThrow();
    getDatabase();
    expect(() => {
      closeDatabase();
      closeDatabase();
    }).not.toThrow();
  });

  it("surfaces an invalid DATABASE_URL from the environment", () => {
    vi.stubEnv("DATABASE_URL", "https://database.invalid/threadline");
    closeDatabase();

    expect(() => getDatabase()).toThrow("DATABASE_URL must use the file: SQLite format.");
  });
});
