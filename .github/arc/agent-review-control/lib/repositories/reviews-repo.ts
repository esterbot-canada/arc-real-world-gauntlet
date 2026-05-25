import type { Database } from 'better-sqlite3';
import { getDb } from '../db.ts';
import { transitionReviewStatus, type ReviewStatus } from '../review/status.ts';
import type { ApprovalSnapshot, CompletionEvidence, ReviewerConcernSummary } from '../review/types.ts';
import { ContractsRepository, type StoredReviewRecord } from './contracts-repo.ts';

export class ReviewsRepository {
  #contracts: ContractsRepository;

  constructor(db: Database = getDb()) {
    this.#contracts = new ContractsRepository(db);
  }

  updateStatus(id: string, nextStatus: ReviewStatus): StoredReviewRecord | null {
    const current = this.#contracts.findById(id);
    if (!current) return null;

    const validatedStatus = transitionReviewStatus(current.reviewStatus, nextStatus);
    return this.#contracts.updateReviewStatus(id, validatedStatus);
  }

  approve(id: string, approval: ApprovalSnapshot): StoredReviewRecord | null {
    const current = this.updateStatus(id, 'Human Approved');
    if (!current) return null;
    return this.#contracts.updateApproval(id, approval);
  }

  updateCompletionEvidence(id: string, completionEvidence: CompletionEvidence): StoredReviewRecord | null {
    return this.#contracts.updateCompletionEvidence(id, completionEvidence);
  }

  updateReviewerConcerns(id: string, reviewerConcerns: ReviewerConcernSummary): StoredReviewRecord | null {
    return this.#contracts.updateReviewerConcerns(id, reviewerConcerns);
  }
}
