'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { appPath } from '../../lib/base-path.ts';
import { parseContractMarkdown, type ParsedContractResult } from '../../lib/contracts/parser.ts';
import {
  highRiskConfigContractMarkdown,
  incompleteContractMarkdown,
  validContractMarkdown,
} from '../../lib/contracts/sample-contracts.ts';
import { evaluateRisk } from '../../lib/risk/rules.ts';
import type { RiskEvaluation, RiskReason } from '../../lib/risk/types.ts';
import type { ReviewItem } from '../../lib/review/types.ts';

const samples = [
  { label: 'Load complete sample', markdown: validContractMarkdown },
  { label: 'Load incomplete sample', markdown: incompleteContractMarkdown },
  { label: 'Load high-risk sample', markdown: highRiskConfigContractMarkdown },
];

type AnalysisState =
  | { status: 'idle' }
  | { status: 'parsed'; parsed: Extract<ParsedContractResult, { ok: true }>; risk: RiskEvaluation }
  | { status: 'error'; error: Extract<ParsedContractResult, { ok: false }> };

function EmptyList({ label }: { label: string }) {
  return <span className="muted">{label}</span>;
}

function TextList({ items, emptyLabel }: { items?: string[]; emptyLabel: string }) {
  if (!items || items.length === 0) return <EmptyList label={emptyLabel} />;

  return (
    <ul className="compact-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function FieldList({ fields, emptyLabel }: { fields: string[]; emptyLabel: string }) {
  if (fields.length === 0) return <EmptyList label={emptyLabel} />;

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

function RiskReasons({ title, reasons, emptyLabel }: { title: string; reasons: RiskReason[]; emptyLabel: string }) {
  return (
    <section className="result-subsection" aria-labelledby={`${title.toLowerCase().replaceAll(' ', '-')}-title`}>
      <h3 id={`${title.toLowerCase().replaceAll(' ', '-')}-title`}>{title}</h3>
      {reasons.length === 0 ? (
        <EmptyList label={emptyLabel} />
      ) : (
        <ul className="compact-list">
          {reasons.map((reason) => (
            <li key={`${reason.code}-${reason.message}`}>{reason.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function decisionSummary(parsed: Extract<ParsedContractResult, { ok: true }>, risk: RiskEvaluation): string {
  if (!parsed.isComplete) return 'Do not approve yet. The contract is incomplete, so review needs missing evidence first.';
  if (risk.severity === 'high') return 'Do not treat this as safe yet. This run has high-priority review signals in the contract.';
  if (risk.severity === 'medium') return 'Human pass recommended. The run has assumptions, shared areas, or unclear evidence.';
  return 'No obvious risk detected by ARC rules. Still do a normal sanity check before approval.';
}

function primaryProblems(parsed: Extract<ParsedContractResult, { ok: true }>, risk: RiskEvaluation): string[] {
  const problems = [...risk.highReasons, ...risk.mediumReasons].map((reason) => reason.message);
  if (!parsed.isComplete) problems.unshift(`Contract incomplete: missing ${parsed.missingFields.join(', ') || 'required fields'}.`);
  if (parsed.invalidFields.length > 0) problems.unshift('Some fields are invalid and need correction.');
  return [...new Set(problems)];
}

export default function InboxPage() {
  const [input, setInput] = useState(validContractMarkdown);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: 'idle' });
  const [queuedItem, setQueuedItem] = useState<ReviewItem | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const characterCount = useMemo(() => input.length.toLocaleString(), [input]);

  function analyzeContract() {
    setQueuedItem(null);
    setSaveError(null);
    const parsed = parseContractMarkdown(input);

    if (!parsed.ok) {
      setAnalysis({ status: 'error', error: parsed });
      return;
    }

    const risk = evaluateRisk({
      contract: parsed.contract,
      validation: {
        isComplete: parsed.isComplete,
        missingFields: parsed.missingFields,
        invalidFields: parsed.invalidFields,
        unknownFields: parsed.unknownFields,
      },
    });

    setAnalysis({ status: 'parsed', parsed, risk });
  }

  async function addAnalysisToQueue() {
    if (analysis.status !== 'parsed') return;

    setSaving(true);
    setSaveError(null);
    setQueuedItem(null);
    try {
      const response = await fetch(appPath('/api/contracts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput: analysis.parsed.rawInput }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to save contract.');
      setQueuedItem(data.item);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save contract.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell inbox-shell">
      <section className="hero-card inbox-hero" aria-labelledby="inbox-title">
        <p className="eyebrow">Inbox</p>
        <h1 id="inbox-title">Paste an agent contract</h1>
        <p className="lede">
          Analyze Markdown handoffs with machine-readable JSON blocks. Saving posts to the SQLite API; returned risk is recomputed against every saved contract.
        </p>
      </section>

      <section className="inbox-grid" aria-label="Contract analysis workspace">
        <form className="input-panel" onSubmit={(event) => { event.preventDefault(); analyzeContract(); }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Contract Input</p>
              <h2>Markdown / JSON</h2>
            </div>
            <span className="muted">{characterCount} chars</span>
          </div>

          <textarea
            aria-label="Agent contract markdown input"
            className="contract-textarea"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setQueuedItem(null);
              setSaveError(null);
              setAnalysis({ status: 'idle' });
            }}
            spellCheck={false}
          />

          <div className="sample-actions" aria-label="Sample contracts">
            {samples.map((sample) => (
              <button
                className="button secondary small"
                key={sample.label}
                type="button"
                onClick={() => {
                  setInput(sample.markdown);
                  setAnalysis({ status: 'idle' });
                  setQueuedItem(null);
                  setSaveError(null);
                }}
              >
                {sample.label}
              </button>
            ))}
          </div>

          <button className="button primary analyze-button" type="submit" disabled={input.trim().length === 0}>
            {input.trim().length === 0 ? 'Paste a contract to analyze' : 'Analyze'}
          </button>
        </form>

        <section className="result-panel" aria-live="polite" aria-labelledby="analysis-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Analysis</p>
              <h2 id="analysis-title">Validation + Risk</h2>
            </div>
          </div>

          {analysis.status === 'idle' && (
            <div className="empty-state">
              <h3>Ready to analyze</h3>
              <p>Use the default sample, load a different sample, or paste a new contract and click Analyze.</p>
            </div>
          )}

          {analysis.status === 'error' && (
            <div className="error-card" role="alert">
              <h3>Could not parse contract</h3>
              <p>{analysis.error.message}</p>
              {analysis.error.rawJson && <pre>{analysis.error.rawJson}</pre>}
            </div>
          )}

          {analysis.status === 'parsed' && (
            <div className="result-stack analysis-stack">
              <section className={`analysis-decision-card priority-${analysis.risk.severity}`}>
                <div>
                  <p className="eyebrow">Decision summary</p>
                  <h3>{decisionSummary(analysis.parsed, analysis.risk)}</h3>
                  <p className="muted task-title-compact">{analysis.parsed.contract.task_title ?? 'No task title provided'}</p>
                </div>
                <div className="status-row compact-status-row">
                  <span className={analysis.parsed.isComplete ? 'status-badge complete' : 'status-badge warning'}>
                    {analysis.parsed.validationStatus}
                  </span>
                  <span className={`status-badge risk-${analysis.risk.severity}`}>{analysis.risk.label}</span>
                  <span className="status-badge neutral">{analysis.risk.confidence}</span>
                </div>
              </section>

              <section className="result-card">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Problems found</p>
                    <h3>What needs attention</h3>
                  </div>
                </div>
                {primaryProblems(analysis.parsed, analysis.risk).length === 0 ? (
                  <p className="muted">No high or medium problems found in the pre-save analysis.</p>
                ) : (
                  <ul className="compact-list priority-list">
                    {primaryProblems(analysis.parsed, analysis.risk).map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="result-card evidence-card">
                <p className="eyebrow">Key evidence</p>
                <div className="detail-grid">
                  <div>
                    <h3>Files touched</h3>
                    <TextList items={analysis.parsed.contract.files_touched} emptyLabel="No files listed." />
                  </div>
                  <div>
                    <h3>Systems touched</h3>
                    <TextList items={analysis.parsed.contract.systems_touched} emptyLabel="No systems listed." />
                  </div>
                  <div>
                    <h3>Tests run</h3>
                    <TextList items={analysis.parsed.contract.tests_run} emptyLabel="No test evidence provided." />
                  </div>
                </div>
              </section>

              <section className="result-card details-disclosure-card">
                <details>
                  <summary>Show validation details and all risk reasons</summary>
                  <div className="detail-grid disclosure-grid">
                    <div>
                      <h3>Missing fields</h3>
                      <FieldList fields={analysis.parsed.missingFields} emptyLabel="No missing required fields." />
                    </div>
                    <div>
                      <h3>Invalid fields</h3>
                      {analysis.parsed.invalidFields.length === 0 ? (
                        <EmptyList label="No invalid fields." />
                      ) : (
                        <ul className="compact-list">
                          {analysis.parsed.invalidFields.map((field) => (
                            <li key={`${field.field}-${field.reason}`}>
                              <strong>{field.field}:</strong> {field.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3>Unknown fields</h3>
                      <FieldList fields={analysis.parsed.unknownFields} emptyLabel="No unknown fields." />
                    </div>
                  </div>
                  <div className="reason-grid disclosure-grid">
                    <RiskReasons title="High severity reasons" reasons={analysis.risk.highReasons} emptyLabel="No high severity reasons." />
                    <RiskReasons title="Medium severity reasons" reasons={analysis.risk.mediumReasons} emptyLabel="No medium severity reasons." />
                    <RiskReasons title="Low severity reasons" reasons={analysis.risk.lowReasons} emptyLabel="No low severity reasons." />
                  </div>
                </details>
              </section>

              <section className="result-card queue-action-card">
                <div>
                  <h3>Add to Review Queue</h3>
                  <p className="muted">Persists this contract to SQLite with initial status: Needs Review.</p>
                  {saving && <p className="muted" role="status">Saving contract to local SQLite…</p>}
                  {queuedItem && <p className="success-text" role="status">Saved. Current global review signal: {queuedItem.risk.label} · {queuedItem.risk.confidence}</p>}
                  {saveError && <p className="error-text" role="alert">{saveError}</p>}
                </div>
                <div className="actions compact-actions">
                  <button className="button primary" type="button" onClick={addAnalysisToQueue} disabled={saving || Boolean(queuedItem)}>
                    {saving ? 'Saving…' : queuedItem ? 'Saved to Queue' : 'Add to Review Queue'}
                  </button>
                  {queuedItem && (
                    <Link className="button secondary" href={`/review/${queuedItem.id}`}>
                      Open queued run
                    </Link>
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
