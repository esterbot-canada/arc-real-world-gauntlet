'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../../lib/base-path.ts';
import { compareReviewItems, type ReviewComparison } from '../../lib/review/compare.ts';
import { runLabelFor, runSequenceMap } from '../../lib/review/run-labels.ts';
import type { ReviewItem } from '../../lib/review/types.ts';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; comparison: ReviewComparison; sequenceMap: Map<string, number> };

function ValueList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="muted">{emptyLabel}</p>;
  return (
    <ul className="compact-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function RunSummary({ item, label, role }: { item: ReviewItem; label: ReturnType<typeof runLabelFor>; role: string }) {
  return (
    <section className={`result-card compare-run-card priority-${item.risk.severity}`}>
      <p className="run-kicker">{role} · {label.shortLabel}</p>
      <p className="run-code">{label.code}</p>
      <h2>{item.contract.task_title ?? 'Untitled run'}</h2>
      <p className="muted">{item.contract.summary ?? 'No summary provided.'}</p>
      <div className="status-row">
        <span className={`status-badge risk-${item.risk.severity}`}>{item.risk.label}</span>
        <span className="status-badge neutral">{item.reviewStatus}</span>
        <span className="status-badge neutral">{item.risk.confidence}</span>
      </div>
    </section>
  );
}

export default function ComparePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    async function loadComparison() {
      const params = new URLSearchParams(window.location.search);
      const left = params.get('left');
      const right = params.get('right');
      if (!left || !right || left === right) {
        setState({ status: 'error', message: 'Select two different runs from the dashboard to compare.' });
        return;
      }

      try {
        const response = await fetch(appPath('/api/contracts'), { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Failed to load contracts.');
        const items = (data.items ?? []) as ReviewItem[];
        const leftItem = items.find((item) => item.id === left);
        const rightItem = items.find((item) => item.id === right);
        if (!leftItem || !rightItem) throw new Error('One of the selected runs is no longer in the queue.');
        setState({ status: 'ready', comparison: compareReviewItems(leftItem, rightItem), sequenceMap: runSequenceMap(items) });
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to compare runs.' });
      }
    }

    loadComparison();
  }, []);

  const labels = useMemo(() => {
    if (state.status !== 'ready') return null;
    return {
      older: runLabelFor(state.comparison.older, state.sequenceMap.get(state.comparison.older.id) ?? 0),
      newer: runLabelFor(state.comparison.newer, state.sequenceMap.get(state.comparison.newer.id) ?? 0),
    };
  }, [state]);

  if (state.status === 'loading') {
    return (
      <main className="page-shell">
        <section className="hero-card dashboard-hero"><h1>Loading comparison…</h1></section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="page-shell">
        <section className="hero-card dashboard-hero">
          <p className="eyebrow">Compare Runs</p>
          <h1>Nothing to compare yet</h1>
          <p className="lede">{state.message}</p>
          <Link className="button primary" href="/">Back to dashboard</Link>
        </section>
      </main>
    );
  }

  const { comparison } = state;
  const runLabels = labels!;

  return (
    <main className="page-shell compare-shell">
      <section className="hero-card dashboard-hero">
        <div>
          <p className="eyebrow">Compare Runs</p>
          <h1>{runLabels.older.shortLabel} vs {runLabels.newer.shortLabel}</h1>
          <p className="lede">Older vs newer view for overlap, evidence, and review risk.</p>
        </div>
        <Link className="button secondary" href="/">Back to dashboard</Link>
      </section>

      <section className="compare-grid">
        <RunSummary item={comparison.older} label={runLabels.older} role="Older run" />
        <RunSummary item={comparison.newer} label={runLabels.newer} role="Newer run" />
      </section>

      <section className="result-card comparison-summary-card">
        <p className="eyebrow">Conflict summary</p>
        <h2>What matters</h2>
        <ValueList items={comparison.summary} emptyLabel="No comparison findings." />
      </section>

      <section className="result-card detail-grid">
        <div>
          <h3>Shared files</h3>
          <ValueList items={comparison.sharedFiles} emptyLabel="No exact same-file overlap." />
        </div>
        <div>
          <h3>Shared areas</h3>
          <ValueList items={comparison.sharedBoundaries} emptyLabel="No shared file-boundary overlap." />
        </div>
        <div>
          <h3>Shared systems</h3>
          <ValueList items={comparison.sharedSystems} emptyLabel="No shared systems." />
        </div>
      </section>

      <section className="compare-grid">
        <section className="result-card">
          <h3>{runLabels.older.shortLabel} only files</h3>
          <ValueList items={comparison.olderOnlyFiles} emptyLabel="No files unique to the older run." />
        </section>
        <section className="result-card">
          <h3>{runLabels.newer.shortLabel} only files</h3>
          <ValueList items={comparison.newerOnlyFiles} emptyLabel="No files unique to the newer run." />
        </section>
      </section>
    </main>
  );
}
