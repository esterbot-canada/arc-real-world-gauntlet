import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db.ts';
import type { AgentReviewContract } from '../contracts/schema.ts';
import { emptyReviewerConcernSummary } from '../review/concerns.ts';
import type { ApprovalSnapshot, CompletionEvidence, IngestMetadata, ReviewerConcernSummary, ReviewValidationSnapshot } from '../review/types.ts';
import type { ReviewStatus } from '../review/status.ts';

export type StoredReviewRecord = {
  id: string;
  rawInput: string;
  rawJson: string;
  rawData: unknown;
  contract: AgentReviewContract;
  validation: ReviewValidationSnapshot;
  ingestMetadata: IngestMetadata;
  approval: ApprovalSnapshot;
  completionEvidence: CompletionEvidence;
  reviewerConcerns: ReviewerConcernSummary;
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
};

type ReviewRow = {
  id: string;
  raw_input: string;
  raw_json: string;
  raw_data_json: string;
  contract_json: string;
  validation_json: string;
  ingest_metadata_json: string;
  approval_json: string;
  completion_evidence_json: string;
  reviewer_concerns_json: string;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(row: ReviewRow): StoredReviewRecord {
  return {
    id: row.id,
    rawInput: row.raw_input,
    rawJson: row.raw_json,
    rawData: JSON.parse(row.raw_data_json),
    contract: JSON.parse(row.contract_json),
    validation: JSON.parse(row.validation_json),
    ingestMetadata: JSON.parse(row.ingest_metadata_json || '{}'),
    approval: JSON.parse(row.approval_json || '{}'),
    completionEvidence: JSON.parse(row.completion_evidence_json || '{}'),
    reviewerConcerns: { ...emptyReviewerConcernSummary(), ...JSON.parse(row.reviewer_concerns_json || '{}') },
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateStoredReviewInput = {
  rawInput: string;
  rawJson: string;
  rawData: unknown;
  contract: AgentReviewContract;
  validation: ReviewValidationSnapshot;
  ingestMetadata?: IngestMetadata;
};

export class ContractsRepository {
  #db: Database;

  constructor(db: Database = getDb()) {
    this.#db = db;
  }

  list(): StoredReviewRecord[] {
    const rows = this.#db.prepare('SELECT * FROM review_items ORDER BY created_at DESC').all() as ReviewRow[];
    return rows.map(toRecord);
  }

  findById(id: string): StoredReviewRecord | null {
    const row = this.#db.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as ReviewRow | undefined;
    return row ? toRecord(row) : null;
  }

  findByRawJson(rawJson: string): StoredReviewRecord | null {
    const row = this.#db.prepare('SELECT * FROM review_items WHERE raw_json = ? ORDER BY created_at DESC LIMIT 1').get(rawJson) as ReviewRow | undefined;
    return row ? toRecord(row) : null;
  }

  create(input: CreateStoredReviewInput): StoredReviewRecord {
    const timestamp = nowIso();
    const record: StoredReviewRecord = {
      id: randomUUID(),
      ...input,
      ingestMetadata: input.ingestMetadata ?? {},
      approval: {},
      completionEvidence: {},
      reviewerConcerns: emptyReviewerConcernSummary(),
      reviewStatus: 'Needs Review',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#db.prepare(`
      INSERT INTO review_items (
        id,
        raw_input,
        raw_json,
        raw_data_json,
        contract_json,
        validation_json,
        ingest_metadata_json,
        approval_json,
        completion_evidence_json,
        reviewer_concerns_json,
        review_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.rawInput,
      record.rawJson,
      JSON.stringify(record.rawData),
      JSON.stringify(record.contract),
      JSON.stringify(record.validation),
      JSON.stringify(record.ingestMetadata),
      JSON.stringify(record.approval),
      JSON.stringify(record.completionEvidence),
      JSON.stringify(record.reviewerConcerns),
      record.reviewStatus,
      record.createdAt,
      record.updatedAt
    );

    return record;
  }

  updateReviewStatus(id: string, reviewStatus: ReviewStatus): StoredReviewRecord | null {
    const updatedAt = nowIso();
    const result = this.#db.prepare('UPDATE review_items SET review_status = ?, updated_at = ? WHERE id = ?').run(reviewStatus, updatedAt, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }


  updateApproval(id: string, approval: ApprovalSnapshot): StoredReviewRecord | null {
    const updatedAt = nowIso();
    const result = this.#db
      .prepare('UPDATE review_items SET approval_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(approval), updatedAt, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  updateCompletionEvidence(id: string, completionEvidence: CompletionEvidence): StoredReviewRecord | null {
    const updatedAt = nowIso();
    const result = this.#db
      .prepare('UPDATE review_items SET completion_evidence_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(completionEvidence), updatedAt, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  updateReviewerConcerns(id: string, reviewerConcerns: ReviewerConcernSummary): StoredReviewRecord | null {
    const updatedAt = nowIso();
    const result = this.#db
      .prepare('UPDATE review_items SET reviewer_concerns_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(reviewerConcerns), updatedAt, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.#db.prepare('DELETE FROM review_items WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
