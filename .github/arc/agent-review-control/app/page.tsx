'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/base-path.ts';
import { REVIEW_STATUSES, type ReviewStatus } from '../lib/review/status.ts';
import { agentDisplayFor } from '../lib/review/agent-identity.ts';
import { runLabelFor, runSequenceMap } from '../lib/review/run-labels.ts';
import type { ReviewItem } from '../lib/review/types.ts';
import type { RiskReason, RiskReasonGroup } from '../lib/risk/types.ts';


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

function OpenConcernsPanel({ item, compact = false }: { item: ReviewItem; compact?: boolean }) {
  const concerns = item.reviewerConcerns;
  const topConcerns = concerns.topConcerns ?? [];

  return (
    <section className="inspector-section open-concerns-panel" aria-labelledby={`open-concerns-${item.id}`}>
      <span className="section-label">Open reviewer/bot concerns</span>
      <strong id={`open-concerns-${item.id}`}>
        {concerns.openCount > 0
          ? `${concerns.openCount} open concern${concerns.openCount === 1 ? '' : 's'} to read before deciding`
          : 'No open reviewer or bot concerns ingested yet'}
      </strong>
      {concerns.openCount > 0 ? (
        <>
          <p className="muted">
            {concerns.humanCount} human · {concerns.botCount} bot · {concerns.checkCount} check annotation{concerns.checkCount === 1 ? '' : 's'}
          </p>
          <ul className="inspector-list concern-list">
            {topConcerns.slice(0, compact ? 3 : 6).map((concern) => (
              <li className={`concern-item concern-${concern.severity}`} key={concern.id}>
                <span className={`status-badge risk-${concern.severity}`}>{concern.severity}</span>{' '}
                <span>{concernSourceLabel(concern)}{concern.author ? ` · ${concern.author}` : ''}</span>
                {concernLocation(concern) ? <code>{concernLocation(concern)}</code> : null}
                <p>{concern.body}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">Ingest PR review comments, bot comments, and check annotations to make the first 60 seconds evidence-led.</p>
      )}
    </section>
  );
}

type SeedState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

type IngestStatus = {
  tokenConfigured: boolean;
  endpointPath: string;
  endpointUrl: string;
  auth: string;
};

type QueueFilter = 'all' | 'blocked' | 'high-risk' | 'active' | 'stale' | 'needs-human';

type ReviewQueueRowProps = {
  item: ReviewItem;
  sequence: number;
  selected: boolean;
  selectedForCompare: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onDelete: (item: ReviewItem, runLabel: string) => void;
  onStatusChange: (item: ReviewItem, status: ReviewStatus) => void;
};

const NAV_ITEMS = ['Inbox', 'Reviews', 'Policies', 'Evidence', 'Analytics', 'Settings'];

const QUEUE_FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: 'all', label: 'All reviews' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'high-risk', label: 'High risk' },
  { key: 'active', label: 'Active status' },
  { key: 'stale', label: 'Stale' },
  { key: 'needs-human', label: 'Needs human' },
];

function attentionReasons(item: ReviewItem): RiskReason[] {
  const priorityReasons = [...item.risk.highReasons, ...item.risk.mediumReasons];
  return priorityReasons.length > 0 ? priorityReasons : item.risk.lowReasons;
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

function plainDecision(item: ReviewItem): string {
  if (item.risk.reviewPriority === 'blocked') return 'Blocked. Resolve open questions or missing contract evidence before approval.';
  if (item.risk.suggestedAction === 'request_changes') return 'Request changes. Required review evidence or rollback detail is missing.';
  if (item.risk.suggestedAction === 'approve') return 'Approval candidate. No major deterministic risk detected; still perform a normal sanity check.';
  if (item.risk.severity === 'high') return 'High technical risk, not necessarily blocked. Inspect grouped reasons before approving.';
  if (item.risk.severity === 'medium') return 'Human pass recommended. Check assumptions, tests, and shared boundaries.';
  return 'Low deterministic risk. Continue normal reviewer sanity check.';
}

function shortList(items?: string[], limit = 2): string {
  const list = items?.filter(Boolean) ?? [];
  if (list.length === 0) return 'None listed';
  const visible = list.slice(0, limit).join(', ');
  return list.length > limit ? `${visible} +${list.length - limit}` : visible;
}

function evidenceCount(item: ReviewItem): number {
  const tests = item.contract.tests_run?.length ?? 0;
  const files = item.contract.files_touched?.length ?? 0;
  const rollback = item.contract.rollback_note ? 1 : 0;
  return tests + files + rollback;
}

function isActiveStatus(status: ReviewStatus): boolean {
  return status === 'Needs Review' || status === 'In Review' || status === 'Changes Requested';
}

function needsHumanAttention(item: ReviewItem): boolean {
  return !item.validation.isComplete || item.risk.reviewPriority !== 'low' || Boolean(item.contract.assumptions?.length) || Boolean(item.contract.open_questions?.length);
}

function queueStats(items: ReviewItem[]) {
  const activeItems = items.filter((item) => isActiveStatus(item.reviewStatus));
  return {
    activeItems,
    activeCount: activeItems.length,
    activeBlockedCount: activeItems.filter((item) => item.risk.reviewPriority === 'blocked').length,
    activeHighRiskCount: activeItems.filter((item) => item.risk.severity === 'high').length,
    activeNeedsHumanCount: activeItems.filter(needsHumanAttention).length,
    allCount: items.length,
    approvedCount: items.filter((item) => item.reviewStatus === 'Human Approved').length,
  };
}

function isStale(item: ReviewItem): boolean {
  const created = new Date(item.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created > 24 * 60 * 60 * 1000 && isActiveStatus(item.reviewStatus);
}

function searchableText(item: ReviewItem, sequence: number): string {
  const runLabel = runLabelFor(item, sequence);
  const agent = agentDisplayFor(item);
  return [
    runLabel.shortLabel,
    runLabel.code,
    item.reviewStatus,
    item.risk.label,
    item.risk.severity,
    item.risk.reviewPriority,
    item.risk.suggestedAction,
    item.contract.task_title,
    item.contract.summary,
    item.contract.contract_type,
    agent.name,
    agent.id,
    agent.role,
    agent.runtime,
    agent.runId,
    agent.sessionId,
    ...(item.risk.reasonGroups ?? []).map((group) => group.label),
    ...(item.contract.files_touched ?? []),
    ...(item.contract.systems_touched ?? []),
    ...(item.contract.tests_run ?? []),
    ...(item.contract.assumptions ?? []),
    ...(item.contract.open_questions ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function filterQueue(items: ReviewItem[], filter: QueueFilter, query: string, sequenceMap: Map<string, number>): ReviewItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'blocked' && item.risk.reviewPriority === 'blocked') ||
      (filter === 'high-risk' && item.risk.severity === 'high') ||
      (filter === 'active' && isActiveStatus(item.reviewStatus)) ||
      (filter === 'stale' && isStale(item)) ||
      (filter === 'needs-human' && needsHumanAttention(item));

    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;

    return searchableText(item, sequenceMap.get(item.id) ?? 0).includes(normalizedQuery);
  });
}

function formatElapsed(isoDate: string): string {
  const created = new Date(isoDate).getTime();
  if (Number.isNaN(created)) return 'Unknown';

  const diffMinutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const hours = Math.floor(diffMinutes / 60);
  if (hours < 48) return `${hours}h`;

  return `${Math.floor(hours / 24)}d`;
}

function compactReason(reason: RiskReason): string {
  const summaries: Partial<Record<RiskReason['code'], string>> = {
    'same-file-overlap': 'Same-file overlap with another run.',
    'shared-boundary': 'Shared file boundary touched by multiple runs.',
    'shared-system': 'Shared system touched by multiple runs.',
    'missing-tests': 'No test evidence listed.',
    'runtime-sensitive-change': 'Runtime-sensitive work.',
    'env-secret-change': 'Environment/secret file changed.',
    'config-change': 'Runtime config changed.',
    'deployment-change': 'Deployment/ops change.',
    'migration-change': 'Migration/data shape change.',
    'external-effect': 'External side effect declared.',
    'explicit-high-risk': 'Agent declared high risk.',
    'missing-rollback-note': 'Rollback note missing for risky work.',
    'incomplete-sensitive-contract': 'Sensitive incomplete contract.',
    'open-questions-unresolved': 'Open questions block approval.',
    'assumptions-present': 'Assumptions need human check.',
    'large-change-set': 'Large change set.',
    'unclear-rationale': 'Unclear rationale.',
  };
  return summaries[reason.code] ?? reason.message;
}

function curlExample(endpointPath: string): string {
  const fence = '```';
  return [
    `curl -sS -X POST "${endpointPath}" \\`,
    '  -H "Authorization: Bearer $ARC_INGEST_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"source":"agent","runId":"run-123","rawInput":"# Agent Review Contract\\n\\n${fence}json\\n{...}\\n${fence}"}'`,
  ].join('\n');
}

function ReviewQueueRow({
  item,
  sequence,
  selected,
  selectedForCompare,
  busy,
  onSelect,
  onToggleCompare,
  onDelete,
  onStatusChange,
}: ReviewQueueRowProps) {
  const runLabel = runLabelFor(item, sequence);
  const agent = agentDisplayFor(item);
  const primaryReason = attentionReasons(item)[0];

  return (
    <article className={selected ? 'review-row selected' : 'review-row'}>
      <button className="review-row-main" type="button" onClick={() => onSelect(item.id)} aria-pressed={selected}>
        <span className="row-run">
          <strong>{runLabel.shortLabel}</strong>
          <code>{runLabel.code}</code>
        </span>
        <span className="row-task">
          <strong>{item.contract.task_title ?? 'Untitled run'}</strong>
          <small>{item.contract.summary ?? 'No summary provided.'}</small>
          <small className="agent-identity-line">
            <span>Agent identity: {agent.name}</span>
            {agent.subtitle ? <span>{agent.subtitle}</span> : null}
          </small>
        </span>
        <span className="row-risk-stack">
          <span className={`row-risk risk-${item.risk.severity}`}>{item.risk.label}</span>
          <span className={`row-priority priority-${item.risk.reviewPriority}`}>{priorityLabel(item.risk.reviewPriority)}</span>
          <GitReadinessBadge git={item.git} />
        </span>
        <span className="row-status">{item.reviewStatus}</span>
        <span className="row-evidence">{evidenceCount(item)} signals</span>
        <span className="row-age">{formatElapsed(item.createdAt)}</span>
        <span className="row-reason">{primaryReason ? compactReason(primaryReason) : 'No priority rule hit.'}</span>
      </button>
      <div className="review-row-actions" aria-label={`Actions for ${runLabel.shortLabel}`}>
        <Link className="button secondary small" href={`/review/${item.id}`}>
          Details
        </Link>
        <button className={selectedForCompare ? 'button primary small' : 'button secondary small'} type="button" onClick={() => onToggleCompare(item.id)}>
          {selectedForCompare ? 'Compare ✓' : 'Compare'}
        </button>
        <select
          aria-label={`Review status for ${runLabel.shortLabel}`}
          className="status-select"
          disabled={busy}
          onChange={(event) => onStatusChange(item, event.target.value as ReviewStatus)}
          value={item.reviewStatus}
        >
          {REVIEW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button className="button danger small" type="button" onClick={() => onDelete(item, runLabel.shortLabel)} disabled={busy}>
          Delete
        </button>
      </div>
    </article>
  );
}

function ReasonGroupCard({ group }: { group: RiskReasonGroup }) {
  return (
    <article className={`reason-group-card reason-${group.highestSeverity} ${group.blocking ? 'blocking' : ''}`}>
      <div className="reason-group-header">
        <strong>{group.label}</strong>
        <span>{group.blocking ? 'Blocks approval' : group.highestSeverity}</span>
      </div>
      <ul className="inspector-list">
        {group.reasons.map((reason) => (
          <li key={`${reason.code}-${reason.message}`}>
            {reason.message}
            {reason.blocking ? <strong className="inline-blocker"> Blocking</strong> : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ReviewInspector({ item, sequence, busy, onStatusChange }: { item: ReviewItem | null; sequence: number; busy: boolean; onStatusChange: (item: ReviewItem, status: ReviewStatus) => void }) {
  if (!item) {
    return (
      <aside className="review-inspector empty-inspector" aria-label="Selected review inspector">
        <p className="eyebrow">Inspector</p>
        <h2>Select a run</h2>
        <p className="muted">Choose a review from the queue to inspect risk reasons, evidence, and decision controls.</p>
      </aside>
    );
  }

  const runLabel = runLabelFor(item, sequence);
  const reasons = attentionReasons(item);
  const reasonGroups = item.risk.reasonGroups?.length ? item.risk.reasonGroups : [];

  return (
    <aside className={`review-inspector inspector-${item.risk.severity} priority-${item.risk.reviewPriority}`} aria-label={`Inspector for ${runLabel.shortLabel}`}>
      <div className="inspector-header">
        <div>
          <p className="eyebrow">Selected review</p>
          <h2>{item.contract.task_title ?? 'Untitled run'}</h2>
          <p className="muted">{runLabel.shortLabel} · {runLabel.code}</p>
        </div>
        <div className="inspector-badge-stack">
          <span className={`status-badge risk-${item.risk.severity}`}>Risk: {item.risk.severity}</span>
          <span className={`status-badge priority-${item.risk.reviewPriority}`}>Priority: {priorityLabel(item.risk.reviewPriority)}</span>
        </div>
      </div>

      <OpenConcernsPanel item={item} compact />

      <section className="inspector-section decision-panel">
        <span className="section-label">Decision summary</span>
        <strong>{plainDecision(item)}</strong>
        <p>Suggested action: {actionLabel(item.risk.suggestedAction)} · Confidence: {item.risk.confidence}</p>
      </section>

      <section className={`inspector-section git-readiness-panel git-${gitReadinessTone(item.git?.state)}`}>
        <div className="git-readiness-heading">
          <span className="section-label">Git readiness</span>
          <GitReadinessBadge git={item.git} />
        </div>
        <p>{gitReadinessSummary(item.git)}</p>
        <div className="git-readiness-facts compact">
          <div><span>Branch</span><strong>{item.git?.branch ?? 'Unknown'}</strong></div>
          <div><span>HEAD</span><strong>{compactSha(item.git?.headSha)}</strong></div>
          <div><span>Matching files</span><strong>{item.git?.matchingFiles?.length ?? 0}</strong></div>
          <div><span>Unrelated dirty</span><strong>{item.git?.unrelatedDirtyFiles?.length ?? 0}</strong></div>
          {(item.git?.missingContractFiles?.length ?? 0) > 0 ? (
            <div><span>Missing contract files</span><strong>{item.git?.missingContractFiles.length}</strong></div>
          ) : null}
        </div>
        {(item.git?.guidance?.length ?? 0) > 0 ? (
          <ul className="inspector-list git-guidance-list">
            {item.git?.guidance.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <p className="muted">Run git status manually before approving if readiness is unknown.</p>
        )}
      </section>

      <section className="inspector-section">
        <span className="section-label">Risk reason groups</span>
        {reasonGroups.length > 0 ? (
          <div className="reason-group-stack">
            {reasonGroups.map((group) => (
              <ReasonGroupCard group={group} key={group.category} />
            ))}
          </div>
        ) : reasons.length > 0 ? (
          <ul className="inspector-list">
            {reasons.slice(0, 5).map((reason) => (
              <li key={`${reason.code}-${reason.message}`}>{reason.message}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No deterministic rule hit. Continue normal review.</p>
        )}
      </section>

      <section className="inspector-grid">
        <div>
          <span className="section-label">Files</span>
          <p>{shortList(item.contract.files_touched, 4)}</p>
        </div>
        <div>
          <span className="section-label">Systems</span>
          <p>{shortList(item.contract.systems_touched, 4)}</p>
        </div>
        <div>
          <span className="section-label">Tests</span>
          <p>{item.contract.tests_run?.length ? shortList(item.contract.tests_run, 3) : 'Missing'}</p>
        </div>
        <div>
          <span className="section-label">Rollback</span>
          <p>{item.contract.rollback_note ?? 'Missing'}</p>
        </div>
      </section>

      {(item.contract.assumptions?.length || item.contract.open_questions?.length) ? (
        <section className="inspector-section">
          <span className="section-label">Needs human attention</span>
          <ul className="inspector-list">
            {[...(item.contract.assumptions ?? []), ...(item.contract.open_questions ?? [])].slice(0, 5).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="inspector-action-bar">
        <button className="button primary" type="button" disabled={busy || item.reviewStatus === 'Human Approved'} onClick={() => onStatusChange(item, 'Human Approved')}>
          Approve
        </button>
        <button className="button secondary" type="button" disabled={busy || item.reviewStatus === 'Changes Requested'} onClick={() => onStatusChange(item, 'Changes Requested')}>
          Request changes
        </button>
        <button className="button danger" type="button" disabled={busy || item.reviewStatus === 'Rejected'} onClick={() => onStatusChange(item, 'Rejected')}>
          Reject
        </button>
      </div>
    </aside>
  );
}

export default function HomePage() {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedState, setSeedState] = useState<SeedState>({ status: 'idle' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<QueueFilter>('all');

  const sequenceMap = useMemo(() => runSequenceMap(queue), [queue]);
  const compareHref = selectedIds.length === 2 ? `/compare?left=${selectedIds[0]}&right=${selectedIds[1]}` : null;
  const stats = useMemo(() => queueStats(queue), [queue]);
  const filteredQueue = useMemo(() => filterQueue(queue, activeFilter, searchQuery, sequenceMap), [activeFilter, queue, searchQuery, sequenceMap]);
  const selectedReview = useMemo(() => filteredQueue.find((item) => item.id === selectedReviewId) ?? filteredQueue[0] ?? null, [filteredQueue, selectedReviewId]);

  async function refreshQueue() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appPath('/api/contracts'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to load review queue.');
      const items = data.items ?? [];
      setQueue(items);
      setSelectedIds((current) => current.filter((id) => items.some((item: ReviewItem) => item.id === id)));
      setSelectedReviewId((current) => (current && items.some((item: ReviewItem) => item.id === current) ? current : items[0]?.id ?? null));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load review queue.');
    } finally {
      setLoading(false);
    }
  }

  async function seedSamples() {
    setError(null);
    setSeedState({ status: 'loading' });
    try {
      const response = await fetch(appPath('/api/seed'), { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to seed sample contracts.');
      await refreshQueue();
      const count = data.items?.length ?? data.count ?? 3;
      setSeedState({ status: 'success', message: `Seeded ${count} sample contract${count === 1 ? '' : 's'} and refreshed the queue.` });
    } catch (seedError) {
      const message = seedError instanceof Error ? seedError.message : 'Failed to seed sample contracts.';
      setSeedState({ status: 'error', message });
      setError(message);
    }
  }

  function toggleCompare(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  }

  async function deleteItem(item: ReviewItem, runLabel: string) {
    const confirmed = window.confirm(`Delete ${runLabel} from the review queue? This removes it from local ARC storage.`);
    if (!confirmed) return;

    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch(appPath(`/api/contracts/${item.id}`), { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to delete review item.');
      await refreshQueue();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete review item.');
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(item: ReviewItem, nextStatus: ReviewStatus) {
    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch(appPath(`/api/review/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to update review status.');
      setQueue((current) => current.map((candidate) => (candidate.id === item.id ? data.item : candidate)));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Failed to update review status.');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    refreshQueue();

    async function loadIngestStatus() {
      try {
        const response = await fetch(appPath('/api/ingest/status'), { cache: 'no-store' });
        const data = await response.json();
        if (response.ok) setIngestStatus(data);
      } catch {
        setIngestStatus(null);
      }
    }

    loadIngestStatus();
  }, []);

  return (
    <main className="arc-desktop-shell">
      <aside className="arc-sidebar" aria-label="ARC navigation">
        <Link className="arc-brand" href="/">
          <span>ARC</span>
          <small>Agent Review Control</small>
        </Link>
        <nav>
          {NAV_ITEMS.map((item) => {
            const href = item === 'Inbox' ? '/inbox' : item === 'Reviews' ? '/' : '#';
            return (
              <Link className={item === 'Reviews' ? 'nav-item active' : 'nav-item'} href={href} key={item} aria-disabled={href === '#'}>
                <span className="nav-dot" />
                {item}
              </Link>
            );
          })}
        </nav>
        <section className="sidebar-ingest-card">
          <span className={ingestStatus?.tokenConfigured ? 'status-dot good' : 'status-dot warn'} />
          <div>
            <strong>Ingest</strong>
            <small>{ingestStatus?.tokenConfigured ? 'Token configured' : 'Token missing'}</small>
          </div>
        </section>
      </aside>

      <section className="arc-workspace">
        <header className="arc-topbar">
          <div>
            <p className="eyebrow">Review Console</p>
            <h1>Agent work queue</h1>
            <p className="muted">Separate technical risk from approval priority, evidence blockers, and human decision readiness.</p>
          </div>
          <div className="topbar-controls">
            <label className="desktop-search">
              <span>Search</span>
              <input
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Task, file, system, run…"
                value={searchQuery}
              />
            </label>
            <span className="environment-pill">Local ARC</span>
            <Link className="button primary" href="/inbox">
              Open Inbox
            </Link>
          </div>
        </header>

        <section className="kpi-strip" aria-label="Queue metrics">
          <div className="kpi-card">
            <span>Active reviews</span>
            <strong>{stats.activeCount}</strong>
            <small>{loading ? 'Loading…' : `All records: ${stats.allCount}`}</small>
          </div>
          <div className="kpi-card danger">
            <span>Active blocked</span>
            <strong>{stats.activeBlockedCount}</strong>
            <small>Approval blockers in active queue</small>
          </div>
          <div className="kpi-card warning">
            <span>Active high risk</span>
            <strong>{stats.activeHighRiskCount}</strong>
            <small>Technical risk in active queue</small>
          </div>
          <div className="kpi-card success">
            <span>Needs human</span>
            <strong>{stats.activeNeedsHumanCount}</strong>
            <small>{stats.approvedCount} approved historically</small>
          </div>
        </section>

        <section className="filter-bar" aria-label="Queue filters">
          {QUEUE_FILTERS.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.key}
              className={activeFilter === filter.key ? 'filter-chip active' : 'filter-chip'}
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
          {(activeFilter !== 'all' || searchQuery) ? (
            <button className="filter-chip muted-chip" type="button" onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}>
              Clear filters
            </button>
          ) : null}
          <button className="button secondary small" type="button" onClick={seedSamples} disabled={seedState.status === 'loading'}>
            {seedState.status === 'loading' ? 'Seeding…' : 'Seed samples'}
          </button>
          <button className="button secondary small" type="button" onClick={refreshQueue}>
            Refresh
          </button>
          {compareHref ? (
            <Link className="button primary small" href={compareHref}>Compare selected</Link>
          ) : (
            <span className="compare-hint">Select 2 runs to compare</span>
          )}
        </section>

        {seedState.status === 'success' && <p className="success-text" role="status">{seedState.message}</p>}
        {seedState.status === 'error' && <p className="error-text" role="alert">{seedState.message}</p>}
        {error && <div className="error-card" role="alert"><h3>Queue API error</h3><p>{error}</p></div>}

        <div className="review-console-grid">
          <section className="review-queue-panel" aria-labelledby="queue-title">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">Local SQLite queue</p>
                <h2 id="queue-title">Review queue</h2>
              </div>
              <span className="queue-count">{filteredQueue.length} shown · {stats.activeNeedsHumanCount} active need human · {stats.allCount} all records</span>
            </div>

            <div className="queue-header" aria-hidden="true">
              <span>Run</span>
              <span>Task</span>
              <span>Risk / Priority</span>
              <span>Status</span>
              <span>Evidence</span>
              <span>Age</span>
              <span>Primary signal</span>
            </div>

            {loading && <div className="loading-state" role="status">Loading saved queue from SQLite…</div>}
            {!loading && !error && queue.length === 0 ? (
              <div className="empty-state">
                <h3>No runs in the review queue yet</h3>
                <p>Analyze a contract in the Inbox or seed samples to exercise ARC review workflows.</p>
                <div className="actions compact-actions">
                  <Link className="button secondary small" href="/inbox">Analyze a contract</Link>
                  <button className="button secondary small" type="button" onClick={seedSamples} disabled={seedState.status === 'loading'}>
                    {seedState.status === 'loading' ? 'Seeding…' : 'Seed demo data'}
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && !error && queue.length > 0 && filteredQueue.length === 0 ? (
              <div className="empty-state">
                <h3>No reviews match the current filters</h3>
                <p>Clear the filters or adjust search to return to the full queue.</p>
                <button className="button secondary small" type="button" onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}>
                  Clear filters
                </button>
              </div>
            ) : null}

            {!loading && filteredQueue.length > 0 ? (
              <div className="review-row-list">
                {filteredQueue.map((item) => (
                  <ReviewQueueRow
                    busy={busyId === item.id}
                    item={item}
                    key={item.id}
                    onDelete={deleteItem}
                    onSelect={setSelectedReviewId}
                    onStatusChange={changeStatus}
                    onToggleCompare={toggleCompare}
                    selected={selectedReview?.id === item.id}
                    selectedForCompare={selectedIds.includes(item.id)}
                    sequence={sequenceMap.get(item.id) ?? 0}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <ReviewInspector
            busy={selectedReview ? busyId === selectedReview.id : false}
            item={selectedReview}
            onStatusChange={changeStatus}
            sequence={selectedReview ? sequenceMap.get(selectedReview.id) ?? 0 : 0}
          />
        </div>

        <details className="desktop-ingest-disclosure">
          <summary>Agent upload endpoint</summary>
          <div className="agent-upload-grid">
            <div>
              <span className="fact-label">Endpoint</span>
              <code>{ingestStatus?.endpointPath ?? '/api/ingest/contracts'}</code>
            </div>
            <div>
              <span className="fact-label">Auth</span>
              <code>Authorization: Bearer $ARC_INGEST_TOKEN</code>
            </div>
          </div>
          <pre>{curlExample(ingestStatus?.endpointPath ?? '/api/ingest/contracts')}</pre>
        </details>
      </section>
    </main>
  );
}
