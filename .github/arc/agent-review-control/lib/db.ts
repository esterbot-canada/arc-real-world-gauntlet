import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppDatabase = Database.Database;

let database: AppDatabase | null = null;

function appRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function defaultDbPath(): string {
  return join(appRoot(), 'data', 'agent-review-control.sqlite');
}

export function getDatabasePath(): string {
  return process.env.AGENT_REVIEW_CONTROL_DB_PATH ?? defaultDbPath();
}

function ensureColumn(db: AppDatabase, table: string, column: string, ddl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function ensureReviewItemsCompatibility(db: AppDatabase): void {
  ensureColumn(db, 'review_items', 'ingest_metadata_json', "ingest_metadata_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'review_items', 'approval_json', "approval_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'review_items', 'completion_evidence_json', "completion_evidence_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'review_items', 'reviewer_concerns_json', "reviewer_concerns_json TEXT NOT NULL DEFAULT '{}'");
}

function runMigrations(db: AppDatabase): void {
  const migrationsDir = join(appRoot(), 'lib', 'migrations');
  const migration = readFileSync(join(migrationsDir, '001_init.sql'), 'utf8');
  db.exec(migration);
  ensureReviewItemsCompatibility(db);
}

export function getDb(): AppDatabase {
  if (database) return database;

  const dbPath = getDatabasePath();
  const parent = dirname(dbPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  database = db;
  return database;
}

export function closeDbForTests(): void {
  database?.close();
  database = null;
}
