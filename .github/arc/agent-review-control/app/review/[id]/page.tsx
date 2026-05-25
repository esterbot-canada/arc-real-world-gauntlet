'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../../../lib/base-path.ts';
import { agentDisplayFor } from '../../../lib/review/agent-identity.ts';
import { REVIEW_STATUSES, type ReviewStatus } from '../../../lib/review/status.ts';
import type { ReviewItem } from '../../../lib/review/types.ts';
import type { RelatedRunEvidence, RiskReason, RiskReasonGroup } from '../../../lib/risk/types.ts';


type GitReadiness = NonNullable<ReviewItem['git']>;
type ReviewerConcern = ReviewItem['reviewerConcerns']['topConcerns'][number];
type GitReadinessTone = 'good' | 'danger' | 'warn' | 'muted';

function gitReadinessLabel(state?: GitReadiness['state']): string {
  const labels: Record<GitReadiness['state'], string> = {
    clean_repo: 'Git clean',
    review_ready: 'Git ready',
    blocked_dirty_repo: 'Dirty repo block',
    partial_match: 'Partial diff',
    no_matching_diff: 'No matching diff',
    unknown: 'Git unknown',
  };
  return state ? labels[state] : 'Git unknown';
}

function gitReadinessTone(state?: GitReadiness['state']): GitReadinessTone {
  if (state === 'review_ready' || state === 'clean_repo') return 'good';
  if (state === 'blocked_dirty_repo') return 'danger';
  if (state === 'partial_match' || state === 'no_matching_diff') return 'warn';
  return 'muted';
}

function gitReadinessSummary(git?: GitReadiness): string {
  return git?.summary || 'Git readiness was not captured for this review item.';
}

function compactSha(sha?: string): string {
  if (!sha) return 'Unknown';
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function GitReadinessBadge({ git }: { git?: GitReadiness }) {
  return <span className={`git-readiness-badge git-${gitReadinessTone(git?.state)}`}>{gitReadinessLabel(git?.state)}</span>;
}

function concernSourceLabel(concern: ReviewerConcern): string {
  const labels: Record<ReviewerConcern['source'], string> = {
    human_review: 'Human reviewer',
    bot_review: 'Bot reviewer',
    check_annotation: 'Check annotation',
    unknown: 'Unknown source',
  };
  return labels[concern.source];
}

function concernLocation(concern: ReviewerConcern): string | null {
  if (!concern.path) return null;
  return concern.line ? `${concern.path}:${concern.line}` : concern.path;
}

function OpenConcernsCard({ item }: { item: ReviewItem }) {
  const concerns = item.reviewerConcerns;
  const topConcerns = concerns.topConcerns ?? [];

  return (
    <section className="result-card open-concerns-panel" aria-labelledby="open-concerns-title">
      <div className="risk-summary">
        <div>
          <p className="eyebrow">Open reviewer/bot concerns</p>
          <h2 id="open-concerns-title">
            {concerns.openCount > 0
              ? `${concerns.openCount} open concern${concerns.openCount === 1 ? '' : 's'} before the decision`
              : 'No open concerns ingested yet'}
          </h2>
        </div>
        <div className="pill-row">
          <span className="status-badge neutral">Human: {concerns.humanCount}</span>
          <span className="status-badge neutral">Bot: {concerns.botCount}</span>
          <span className="status-badge neutral">Checks: {concerns.checkCount}</span>
        </div>
      </div>
      {topConcerns.length > 0 ? (
        <ul className="checklist concern-list">
          {topConcerns.map((concern) => (
            <li className={`concern-item concern-${concern.severity}`} key={concern.id}>
              <span className={`status-badge risk-${concern.severity}`}>{concern.severity}</span>{' '}
              <strong>{concernSourceLabel(concern)}{concern.author ? ` · ${concern.author}` : ''}</strong>
              {concernLocation(concern) ? <code>{concernLocation(concern)}</code> : null}
              <p>{concern.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Ingest PR review comments, bot comments, and check annotations to surface exactly where the human should slow down.</p>
      )}
    </section>
  );
}

function GitFileList({ items, emptyLabel, cap }: { items?: string[]; emptyLabel: string; cap?: number }) {
  const list = items ?? [];
  if (list.length === 0) return <span className="muted">{emptyLabel}</span>;
  const visible = cap ? list.slice(0, cap) : list;
  const hidden = cap ? list.length - visible.length : 0;
  return (
    <ul className="compact-list git-file-list">
      {visible.map((item) => <li key={item}><code>{item}</code></li>)}
      {hidden > 0 ? <li className="muted">+{hidden} more</li> : null}
    </ul>
  );
}

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
};

function ValueList({ items, emptyLabel }: { items?: string[]; emptyLabel: string }) {
  if (!items || items.length === 0) return <span className="muted">{emptyLabel}</span>;

  return (
    <ul className="compact-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function FieldPills({ fields, emptyLabel }: { fields: string[]; emptyLabel: string }) {
  if (fields.length === 0) return <span className="muted">{emptyLabel}</span>;

  return (
    <div className="pill-row">
      {fields.map((field) => (
        <span className="pill warning" key={field}>
          {field}
        </span>
      ))}
    </div>
  );
}

function shortRunId(runId: string): string {
  if (runId.length <= 18) return runId;
  return `${runId.slice(0, 8)}…${runId.slice(-6)}`;
}

function compareHref(currentId: string, relatedRunId: string): string {
  const params = new URLSearchParams({ left: currentId, right: relatedRunId });
  return appPath(`/compare?${params.toString()}`);
}

function openRunHref(runId: string): string {
  return appPath(`/review/${encodeURIComponent(runId)}`);
}

function riskActionTargets(reason: RiskReason): { href: string; label: string }[] {
  if (reason.code === 'same-file-overlap') return [{ href: '#related-runs', label: 'View related runs' }, { href: '#files-touched', label: 'View files' }];
  if (reason.code === 'shared-boundary') return [{ href: '#related-runs', label: 'View related runs' }, { href: '#shared-boundaries', label: 'View shared boundaries' }];
  if (reason.code === 'migration-change') return [{ href: '#migration-details', label: 'View migration details' }];
  if (reason.code === 'missing-tests' || reason.code === 'open-questions-unresolved' || reason.code === 'missing-files') return [{ href: '#review-checklist', label: 'View checklist' }];
  return [{ href: '#review-checklist', label: 'View checklist' }];
}

function plainReasonSummary(reason: RiskReason): string {
  return reason.evidence?.plainEnglish ?? reason.message;
}

function evidencePreview(items: string[] | undefined, emptyLabel: string): string {
  if (!items || items.length === 0) return emptyLabel;
  const visible = items.slice(0, 3).join(', ');
  const remaining = items.length - 3;
  return remaining > 0 ? `${visible}, +${remaining} more` : visible;
}

function allRelatedRuns(item: ReviewItem): RelatedRunEvidence[] {
  const runs = new Map<string, RelatedRunEvidence>();
  for (const reason of item.risk.reasons) {
    for (const run of reason.evidence?.relatedRuns ?? []) {
      const existing = runs.get(run.runId);
      runs.set(run.runId, {
        runId: run.runId,
        taskTitle: existing?.taskTitle ?? run.taskTitle,
        agentName: existing?.agentName ?? run.agentName,
        files: [...new Set([...(existing?.files ?? []), ...(run.files ?? [])])],
        boundaries: [...new Set([...(existing?.boundaries ?? []), ...(run.boundaries ?? [])])],
        systems: [...new Set([...(existing?.systems ?? []), ...(run.systems ?? [])])],
      });
    }
  }
  return [...runs.values()];
}

function allSharedBoundaries(item: ReviewItem): string[] {
  return [...new Set(item.risk.reasons.flatMap((reason) => reason.evidence?.relatedRuns?.flatMap((run) => run.boundaries ?? []) ?? []))];
}

function ReasonCard({ reason, currentId }: { reason: RiskReason; currentId: string }) {
  const relatedRuns = reason.evidence?.relatedRuns ?? [];
  const hasStructuredOverlap = relatedRuns.length > 0 && (reason.code === 'same-file-overlap' || reason.code === 'shared-boundary');

  return (
    <article className={`rule-reason-card reason-${reason.severity}`} key={`${reason.code}-${reason.message}`}>
      <div className="reason-card-header">
        <span className={`status-badge risk-${reason.severity}`}>{severityLabel(reason)}</span>
        <div className="action-chip-row" aria-label="Reason navigation actions">
          {riskActionTargets(reason).map((action) => (
            <a className="action-chip" href={action.href} key={`${reason.code}-${action.href}`}>
              {action.label}
            </a>
          ))}
        </div>
      </div>
      <p>{plainReasonSummary(reason)}</p>
      {reason.evidence?.technicalDetail ? <p className="muted"><strong>Technical detail:</strong> {reason.evidence.technicalDetail}</p> : null}
      {hasStructuredOverlap ? (
        <div className="related-run-mini-grid">
          {relatedRuns.map((run) => (
            <div className="related-run-mini-card" key={`${reason.code}-${run.runId}`}>
              <div>
                <strong title={run.runId}>{shortRunId(run.runId)}</strong>
                <span>{run.agentName ?? 'Agent not identified'}</span>
              </div>
              <p>{run.taskTitle ?? 'Untitled related run'}</p>
              <p className="muted">
                {reason.code === 'same-file-overlap'
                  ? `${run.files?.length ?? 0} overlapping file${(run.files?.length ?? 0) === 1 ? '' : 's'}`
                  : `${run.boundaries?.length ?? 0} shared boundar${(run.boundaries?.length ?? 0) === 1 ? 'y' : 'ies'}`}
              </p>
              <p className="muted">
                {reason.code === 'same-file-overlap'
                  ? `Overlap: ${evidencePreview(run.files, 'No exact file list provided')}`
                  : `Boundary: ${evidencePreview(run.boundaries, 'No exact boundary list provided')} · related files: ${run.files?.length ?? 0}`}
              </p>
              <div className="action-chip-row">
                <a className="action-chip" href={openRunHref(run.runId)}>Open run</a>
                <a className="action-chip" href={compareHref(currentId, run.runId)}>Compare with run</a>
                <a className="action-chip" href={reason.code === 'same-file-overlap' ? '#files-touched' : '#shared-boundaries'}>
                  {reason.code === 'same-file-overlap' ? 'View files' : 'View shared boundaries'}
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <p className="muted"><strong>Human check:</strong> {nextCheckForReason(reason)}</p>
    </article>
  );
}

function nextCheckForReason(reason: RiskReason): string {
  const checks: Partial<Record<RiskReason['code'], string>> = {
    'same-file-overlap': 'Compare both runs before approval; decide which change owns the file.',
    'shared-boundary': 'Open the related files together and check whether behavior still fits as one flow.',
    'missing-tests': 'Ask for test evidence or manually run the smallest relevant test before approval.',
    'env-secret-change': 'Verify the exact environment values, secret handling, and deploy target before approval.',
    'config-change': 'Check the runtime config diff, default changes, and whether rollback restores prior behavior.',
    'deployment-change': 'Confirm rollout order, service health checks, and rollback steps before approval.',
    'migration-change': 'Review forward/backward migration safety, data impact, and rollback feasibility.',
    'external-effect': 'Confirm what already happened externally and whether it can be safely repeated or undone.',
    'explicit-high-risk': 'Ask why the agent declared high/critical risk, then review the riskiest path manually.',
    'runtime-sensitive-change': 'Review the runtime/security-sensitive path and confirm rollback before approval.',
    'missing-rollback-note': 'Require a rollback note before approving risky work.',
    'incomplete-sensitive-contract': 'Fill missing contract fields before reviewing implementation quality.',
    'shared-system': 'Check whether the two runs change the same user/system flow.',
    'assumptions-present': 'Confirm or reject each assumption explicitly.',
    'large-change-set': 'Review by subsystem, not as one giant diff.',
    'unclear-rationale': 'Ask the agent for clearer intent before relying on the diff.',
    'isolated-files': 'Sanity-check the diff and tests; no overlap pressure found.',
    'tests-present': 'Confirm tests match the touched behavior, not just unrelated coverage.',
    'clear-rationale': 'Use the stated rationale as the review lens.',
    'rollback-note-present': 'Check that rollback is concrete enough to execute.',
    'missing-files': 'Ask the agent to list touched files or verify against the actual diff before approval.',
    'missing-systems': 'Ask which product/system areas changed before approval.',
    'open-questions-unresolved': 'Resolve every open question before approval.',
    'no-overlap': 'Continue normal review; no merge-conflict signal found.',
  };
  return checks[reason.code] ?? 'Use this signal to guide the human review pass.';
}

function severityLabel(reason: RiskReason): string {
  return `${reason.severity.toUpperCase()} · ${reason.code}`;
}

function priorityLabel(priority: ReviewItem['risk']['reviewPriority']): string {
  const labels: Record<ReviewItem['risk']['reviewPriority'], string> = {
    blocked: 'Blocked',
    high: 'High priority',
    medium: 'Medium priority',
    low: 'Low priority',
  };
  return labels[priority];
}

function actionLabel(action: ReviewItem['risk']['suggestedAction']): string {
  const labels: Record<ReviewItem['risk']['suggestedAction'], string> = {
    approve: 'Approve candidate',
    request_changes: 'Request changes',
    keep_active: 'Keep active',
    supersede: 'Supersede',
    archive: 'Archive',
    reject: 'Reject',
  };
  return labels[action];
}

function ReasonGroup({ title, reasons }: { title: string; reasons: RiskReason[] }) {
  return (
    <section className="result-subsection" aria-labelledby={`${title.toLowerCase().replaceAll(' ', '-')}-title`}>
      <h3 id={`${title.toLowerCase().replaceAll(' ', '-')}-title`}>{title}</h3>
      {reasons.length === 0 ? (
        <span className="muted">No reasons in this severity.</span>
      ) : (
        <div className="rule-reason-stack">
          {reasons.map((reason) => (
            <article className={`rule-reason-card reason-${reason.severity}`} key={`${reason.code}-${reason.message}`}>
              <span className={`status-badge risk-${reason.severity}`}>{severityLabel(reason)}</span>
              <p>{reason.message}</p>
              <p className="muted"><strong>Human check:</strong> {nextCheckForReason(reason)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryReasonGroup({ group }: { group: RiskReasonGroup }) {
  return (
    <article className={`rule-reason-card reason-${group.highestSeverity} ${group.blocking ? 'blocking' : ''}`}>
      <span className={`status-badge risk-${group.highestSeverity}`}>{group.label}</span>
      {group.blocking ? <p className="error-text">Blocks approval until resolved.</p> : null}
      <ul className="compact-list">
        {group.reasons.map((reason) => (
          <li key={`${group.category}-${reason.code}-${reason.message}`}>
            <strong>{reason.severity.toUpperCase()}:</strong> {reason.message}
            <br />
            <span className="muted">Human check: {nextCheckForReason(reason)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function priorityReasons(item: ReviewItem): RiskReason[] {
  const highAndMedium = [...item.risk.highReasons, ...item.risk.mediumReasons];
  return highAndMedium.length > 0 ? highAndMedium : item.risk.lowReasons;
}

function reviewChecklist(item: ReviewItem): string[] {
  const checks = ['Read summary and confirm the intended flow matches the touched files.'];

  if (!item.validation.isComplete) checks.push('Fill missing/invalid contract fields before approving.');
  if (item.contract.files_touched?.length) checks.push('Open touched files and review the actual diff, not just the contract.');
  if (item.risk.highReasons.some((reason) => reason.code === 'same-file-overlap' || reason.code === 'shared-boundary')) {
    checks.push('Compare overlapping runs and decide the safe order/owner.');
  }
  if (item.risk.highReasons.some((reason) => reason.category === 'runtime_security')) {
    checks.push('For runtime/security signals, verify rollout impact, secrets/config safety, and executable rollback before approval.');
  }
  if (!item.contract.tests_run?.length) checks.push('Get test evidence or run the smallest relevant test manually.');
  else checks.push('Check that listed tests cover the risky/touched behavior.');
  if (!item.contract.rollback_note) checks.push('Ask for rollback steps before approval.');
  else checks.push('Confirm rollback note is executable.');
  if (item.contract.open_questions?.length) checks.push('Resolve open questions before marking approved.');
  if (item.contract.assumptions?.length) checks.push('Confirm assumptions are true in the current project context.');

  checks.push('Only mark Human Approved after deterministic signals, evidence, and human judgment agree.');
  return checks;
}

function DetailSkeleton() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Run Detail</p>
        <h1>Loading run…</h1>
      </section>
    </main>
  );
}

export default function ReviewDetailPage({ params }: PageProps) {
  const [id, setId] = useState<string | null>(null);
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then((resolved) => setId(resolved.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    async function loadItem() {
      setLoaded(false);
      setError(null);
      try {
        const response = await fetch(appPath(`/api/contracts/${id}`), { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Failed to load review item.');
        setItem(data.item);
      } catch (loadError) {
        setItem(null);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load review item.');
      } finally {
        setLoaded(true);
      }
    }

    loadItem();
  }, [id]);

  const contractJson = useMemo(() => {
    if (!item) return '';
    return JSON.stringify(item.contract, null, 2);
  }, [item]);

  const reviewFirstReasons = useMemo(() => (item ? priorityReasons(item).slice(0, 5) : []), [item]);
  const agent = useMemo(() => (item ? agentDisplayFor(item) : null), [item]);
  const relatedRuns = useMemo(() => (item ? allRelatedRuns(item) : []), [item]);
  const sharedBoundaries = useMemo(() => (item ? allSharedBoundaries(item) : []), [item]);

  async function changeStatus(nextStatus: ReviewStatus) {
    if (!item) return;
    setError(null);

    try {
      const response = await fetch(appPath(`/api/review/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to update review status.');
      setItem(data.item);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update review status.');
    }
  }

  if (!loaded) return <DetailSkeleton />;

  if (!item) {
    return (
      <main className="page-shell">
        <section className="hero-card">
          <p className="eyebrow">Missing Run</p>
          <h1>Review item not found</h1>
          <p className="lede">{error ?? 'This run is not in the local SQLite queue.'}</p>
          <div className="actions">
            <Link className="button primary" href="/">
              Back to Review Queue
            </Link>
            <Link className="button secondary" href="/inbox">
              Analyze another contract
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="arc-detail-console detail-shell">
      <section className="arc-topbar detail-topbar" aria-labelledby="detail-title">
        <div>
          <p className="section-label">Run Detail Console</p>
          <h1 id="detail-title">{item.contract.task_title ?? 'Untitled run'}</h1>
          <p className="lede">{item.contract.summary ?? 'No summary provided.'}</p>
        </div>
        <div className="detail-topbar-actions">
          <Link className="button secondary small" href="/">
            Back to queue
          </Link>
          <Link className="button secondary small" href="/inbox">
            Analyze another contract
          </Link>
        </div>
        <div className="status-row detail-status-row">
          <span className={item.validation.isComplete ? 'status-badge complete' : 'status-badge warning'}>{item.validation.validationStatus}</span>
          <span className={`status-badge risk-${item.risk.severity}`}>Risk: {item.risk.severity}</span>
          <span className={`status-badge priority-${item.risk.reviewPriority}`}>Priority: {priorityLabel(item.risk.reviewPriority)}</span>
          <span className="status-badge neutral">Action: {actionLabel(item.risk.suggestedAction)}</span>
          <span className="status-badge neutral">{item.risk.confidence}</span>
          <span className="status-badge neutral">{item.reviewStatus}</span>
          <GitReadinessBadge git={item.git} />
        </div>
      </section>

      {error && <div className="error-card" role="alert"><p>{error}</p></div>}

      <OpenConcernsCard item={item} />

      <section className={`result-card git-readiness-panel detail-git-panel git-${gitReadinessTone(item.git?.state)}`} aria-labelledby="git-readiness-title">
        <div className="risk-summary">
          <div>
            <p className="eyebrow">Git Readiness</p>
            <h2 id="git-readiness-title">{gitReadinessLabel(item.git?.state)}</h2>
          </div>
          <GitReadinessBadge git={item.git} />
        </div>
        <p className="muted">{gitReadinessSummary(item.git)}</p>
        {item.git?.error ? <p className="error-text">Git inspection error: {item.git.error}</p> : null}
        <div className="git-readiness-facts">
          <div><span>Branch</span><strong>{item.git?.branch ?? 'Unknown'}</strong></div>
          <div><span>HEAD</span><strong>{compactSha(item.git?.headSha)}</strong></div>
          <div><span>Matching files</span><strong>{item.git?.matchingFiles?.length ?? 0}</strong></div>
          <div><span>Unrelated dirty files</span><strong>{item.git?.unrelatedDirtyFiles?.length ?? 0}</strong></div>
          <div><span>Missing contract files</span><strong>{item.git?.missingContractFiles?.length ?? 0}</strong></div>
        </div>
        <div className="git-readiness-lists">
          <div>
            <h3>Matching files</h3>
            <GitFileList items={item.git?.matchingFiles} emptyLabel="No matching dirty files." />
          </div>
          <div>
            <h3>Unrelated dirty files</h3>
            <GitFileList items={item.git?.unrelatedDirtyFiles} emptyLabel="No unrelated dirty files." cap={12} />
          </div>
          <div>
            <h3>Missing contract files</h3>
            <GitFileList items={item.git?.missingContractFiles} emptyLabel="No missing contract files." />
          </div>
        </div>
        {(item.git?.guidance?.length ?? 0) > 0 ? (
          <ul className="checklist git-guidance-list">
            {item.git?.guidance.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <p className="muted">Run git status manually before approving if readiness is unknown.</p>
        )}
      </section>

      <section className={`result-card first-review-card priority-${item.risk.severity}`} aria-labelledby="review-first-title">
        <div className="risk-summary">
          <div>
            <p className="eyebrow">Risk vs Priority</p>
            <h2 id="review-first-title">Why review this first?</h2>
          </div>
          <div className="pill-row">
            <span className={`status-badge risk-${item.risk.severity}`}>Technical risk: {item.risk.severity}</span>
            <span className={`status-badge priority-${item.risk.reviewPriority}`}>Review priority: {priorityLabel(item.risk.reviewPriority)}</span>
          </div>
        </div>
        {reviewFirstReasons.length === 0 ? (
          <p className="muted">No high or medium priority reasons were found. This is a lower-priority sanity check.</p>
        ) : (
          <div className="rule-reason-stack priority-rule-stack">
            {reviewFirstReasons.map((reason) => (
              <ReasonCard reason={reason} currentId={item.id} key={`review-first-${reason.code}-${reason.message}`} />
            ))}
          </div>
        )}
        {!item.validation.isComplete && (
          <p className="error-text">Incomplete contract: confirm missing or invalid fields before approval.</p>
        )}
      </section>

      {agent && (
        <section className="result-card detail-grid" aria-labelledby="agent-identity-title">
          <div>
            <p className="eyebrow">Agent identity</p>
            <h2 id="agent-identity-title">{agent.name}</h2>
            <p className="muted">{agent.subtitle || 'No role, runtime, or run id provided.'}</p>
          </div>
          <div>
            <h3>Agent IDs</h3>
            <p className="muted">ID: {agent.id ?? 'Not provided'}</p>
            <p className="muted">Session: {agent.sessionId ?? 'Not provided'}</p>
          </div>
          <div>
            <h3>Runtime trace</h3>
            <p className="muted">Runtime/source: {agent.runtime ?? 'Not provided'}</p>
            <p className="muted">Run ID: {agent.runId ?? 'Not provided'}</p>
          </div>
        </section>
      )}

      <section className="result-card evidence-panel" id="related-runs" aria-labelledby="related-runs-title">
        <div className="risk-summary">
          <div>
            <p className="eyebrow">Canonical Evidence</p>
            <h2 id="related-runs-title">Related runs</h2>
          </div>
          <p className="muted">Exact active run IDs surfaced from structured risk evidence.</p>
        </div>
        {relatedRuns.length === 0 ? (
          <p className="muted">No related-run overlap evidence found for this review item.</p>
        ) : (
          <div className="related-run-grid">
            {relatedRuns.map((run) => (
              <article className="related-run-card" key={run.runId}>
                <div className="related-run-card-header">
                  <strong title={run.runId}>{shortRunId(run.runId)}</strong>
                  <span className="status-badge neutral">{run.agentName ?? 'Agent not identified'}</span>
                </div>
                <p>{run.taskTitle ?? 'Untitled related run'}</p>
                <p className="muted">
                  Full run id: <code>{run.runId}</code>
                </p>
                <p className="muted">
                  {(run.files?.length ?? 0)} file{(run.files?.length ?? 0) === 1 ? '' : 's'} · {(run.boundaries?.length ?? 0)} boundar{(run.boundaries?.length ?? 0) === 1 ? 'y' : 'ies'}
                </p>
                <p className="muted">Overlap files: {evidencePreview(run.files, 'None listed')}</p>
                <p className="muted">Shared boundaries: {evidencePreview(run.boundaries, 'None listed')}</p>
                <div className="action-chip-row">
                  <a className="action-chip" href={openRunHref(run.runId)}>Open run</a>
                  <a className="action-chip" href={compareHref(item.id, run.runId)}>Compare with run</a>
                  <a className="action-chip" href="#files-touched">Jump to files</a>
                  <a className="action-chip" href="#shared-boundaries">Jump to boundaries</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="result-card review-checklist-card" id="review-checklist" aria-labelledby="review-checklist-title">
        <p className="eyebrow">Human Review Checklist</p>
        <h2 id="review-checklist-title">What to check next</h2>
        <ol className="checklist">
          {reviewChecklist(item).map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ol>
      </section>

      <section className="result-card lifecycle-card" aria-labelledby="lifecycle-title">
        <div>
          <p className="eyebrow">Review Lifecycle</p>
          <h2 id="lifecycle-title">Move status</h2>
          <p className="muted">Created {new Date(item.createdAt).toLocaleString()} · Updated {new Date(item.updatedAt).toLocaleString()}</p>
        </div>
        <div className="status-controls">
          {REVIEW_STATUSES.map((status) => (
            <button
              className={status === item.reviewStatus ? 'button primary small' : 'button secondary small'}
              key={status}
              type="button"
              onClick={() => changeStatus(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </section>

      <section className="result-card detail-grid evidence-panel" id="files-touched" aria-labelledby="files-touched-title">
        <div>
          <h3 id="files-touched-title">Files touched</h3>
          <ValueList items={item.contract.files_touched} emptyLabel="No files listed." />
        </div>
        <div>
          <h3>Systems touched</h3>
          <ValueList items={item.contract.systems_touched} emptyLabel="No systems listed." />
        </div>
        <div>
          <h3>Tests run</h3>
          <ValueList items={item.contract.tests_run} emptyLabel="No test evidence provided." />
        </div>
      </section>

      <section className="result-card evidence-panel" id="shared-boundaries" aria-labelledby="shared-boundaries-title">
        <div className="risk-summary">
          <div>
            <p className="eyebrow">Canonical Evidence</p>
            <h2 id="shared-boundaries-title">Shared boundaries</h2>
          </div>
          <p className="muted">Deduplicated boundary evidence from related-run explanations.</p>
        </div>
        {sharedBoundaries.length === 0 ? (
          <p className="muted">No shared-boundary evidence found.</p>
        ) : (
          <div className="pill-row">
            {sharedBoundaries.map((boundary) => (
              <span className="pill neutral" key={boundary}>{boundary}</span>
            ))}
          </div>
        )}
      </section>

      <section className="result-card evidence-panel" id="migration-details" aria-labelledby="migration-details-title">
        <div className="risk-summary">
          <div>
            <p className="eyebrow">Canonical Evidence</p>
            <h2 id="migration-details-title">Migration details</h2>
          </div>
          <p className="muted">Plain-English compatibility review first; technical detail second.</p>
        </div>
        {item.risk.reasons.some((reason) => reason.code === 'migration-change') ? (
          <div className="rule-reason-stack">
            {item.risk.reasons.filter((reason) => reason.code === 'migration-change').map((reason) => (
              <ReasonCard reason={reason} currentId={item.id} key={`migration-${reason.message}`} />
            ))}
          </div>
        ) : (
          <p className="muted">No migration or persistent data shape change was declared.</p>
        )}
      </section>

      <section className="result-card detail-grid">
        <div>
          <h3>Open questions</h3>
          <ValueList items={item.contract.open_questions} emptyLabel="No open questions listed." />
        </div>
        <div>
          <h3>Assumptions</h3>
          <ValueList items={item.contract.assumptions} emptyLabel="No assumptions listed." />
        </div>
        <div>
          <h3>Rollback note</h3>
          <p className="muted">{item.contract.rollback_note ?? 'No rollback note provided.'}</p>
        </div>
      </section>

      <section className="result-card detail-grid">
        <div>
          <h3>Missing fields</h3>
          <FieldPills fields={item.validation.missingFields} emptyLabel="No missing required fields." />
        </div>
        <div>
          <h3>Invalid fields</h3>
          {item.validation.invalidFields.length === 0 ? (
            <span className="muted">No invalid fields.</span>
          ) : (
            <ul className="compact-list">
              {item.validation.invalidFields.map((field) => (
                <li key={`${field.field}-${field.reason}`}><strong>{field.field}:</strong> {field.reason}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Unknown fields</h3>
          <FieldPills fields={item.validation.unknownFields} emptyLabel="No unknown fields." />
        </div>
      </section>

      <section className="result-card evidence-panel">
        <div className="risk-summary">
          <div>
            <p className="eyebrow">Risk Reasons</p>
            <h2>Grouped by category</h2>
          </div>
          <p className="muted">Source: {item.risk.source} · recomputed globally on fetch</p>
        </div>
        {item.risk.reasonGroups?.length ? (
          <div className="rule-reason-stack priority-rule-stack">
            {item.risk.reasonGroups.map((group) => (
              <CategoryReasonGroup group={group} key={group.category} />
            ))}
          </div>
        ) : (
          <p className="muted">No category groups found; showing severity fallback below.</p>
        )}
      </section>

      <details className="result-card legacy-reason-details">
        <summary>
          <span>Legacy Severity View</span>
          <span className="muted">Grouped by severity; collapsed to avoid duplicate evidence.</span>
        </summary>
        <div className="risk-summary">
          <div>
            <h2>Grouped by severity</h2>
          </div>
          <p className="muted">Kept for backward-compatible reviewer scanning.</p>
        </div>
        <div className="reason-grid">
          <ReasonGroup title="High severity reasons" reasons={item.risk.highReasons} />
          <ReasonGroup title="Medium severity reasons" reasons={item.risk.mediumReasons} />
          <ReasonGroup title="Low severity reasons" reasons={item.risk.lowReasons} />
        </div>
      </details>

      <section className="result-card raw-grid">
        <div>
          <h3>Full parsed contract</h3>
          <pre>{contractJson}</pre>
        </div>
        <div>
          <h3>Raw Markdown</h3>
          <pre>{item.rawInput}</pre>
        </div>
      </section>

      <div className="actions">
        <Link className="button secondary" href="/">
          Back to Review Queue
        </Link>
      </div>
    </main>
  );
}
