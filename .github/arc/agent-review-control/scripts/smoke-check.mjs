import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const files = [
  'package.json',
  'tsconfig.json',
  'next.config.js',
  'app/layout.tsx',
  'app/page.tsx',
  'app/inbox/page.tsx',
  'app/review/[id]/page.tsx',
  'app/compare/page.tsx',
  'app/api/contracts/route.ts',
  'app/api/contracts/[id]/route.ts',
  'app/api/review/[id]/route.ts',
  'app/api/review/[id]/concerns/route.ts',
  'app/api/seed/route.ts',
  'app/api/ingest/contracts/route.ts',
  'app/api/ingest/status/route.ts',
  'app/globals.css',
  'lib/db.ts',
  'lib/migrations/001_init.sql',
  'lib/repositories/contracts-repo.ts',
  'lib/repositories/reviews-repo.ts',
  'lib/review/server-store.ts',
  'lib/review/concerns.ts',
  'lib/review/status.ts',
  'lib/review/run-labels.ts',
  'lib/review/compare.ts',
  'lib/review/types.ts',
  'lib/review/agent-identity.ts',
  'lib/risk/types.ts',
  'lib/risk/rules.ts',
];

for (const file of files) {
  const contents = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(contents.trim().length > 0, `${file} should not be empty`);
}

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const inbox = await readFile(new URL('../app/inbox/page.tsx', import.meta.url), 'utf8');
const detail = await readFile(new URL('../app/review/[id]/page.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const compare = await readFile(new URL('../app/compare/page.tsx', import.meta.url), 'utf8');
const serverStore = await readFile(new URL('../lib/review/server-store.ts', import.meta.url), 'utf8');
const contractsApi = await readFile(new URL('../app/api/contracts/route.ts', import.meta.url), 'utf8');
const detailApi = await readFile(new URL('../app/api/contracts/[id]/route.ts', import.meta.url), 'utf8');
const reviewApi = await readFile(new URL('../app/api/review/[id]/route.ts', import.meta.url), 'utf8');
const concernsApi = await readFile(new URL('../app/api/review/[id]/concerns/route.ts', import.meta.url), 'utf8');
const ingestApi = await readFile(new URL('../app/api/ingest/contracts/route.ts', import.meta.url), 'utf8');
const ingestStatusApi = await readFile(new URL('../app/api/ingest/status/route.ts', import.meta.url), 'utf8');
const status = await readFile(new URL('../lib/review/status.ts', import.meta.url), 'utf8');
const agentIdentity = await readFile(new URL('../lib/review/agent-identity.ts', import.meta.url), 'utf8');
const riskTypes = await readFile(new URL('../lib/risk/types.ts', import.meta.url), 'utf8');
const riskRules = await readFile(new URL('../lib/risk/rules.ts', import.meta.url), 'utf8');

assert.match(page, /Agent work queue/);
assert.match(page, /\/api\/contracts/);
assert.match(page, /Review Console/);
assert.match(page, /Seed samples/);
assert.match(page, /runLabel\.shortLabel/);
assert.match(page, /agentDisplayFor/);
assert.match(page, /Agent identity/);
assert.match(page, /Compare selected/);
assert.match(page, /Delete/);
assert.match(page, /desktop-ingest-disclosure/);
assert.match(page, /ARC_INGEST_TOKEN/);
assert.match(page, /\/api\/ingest\/status/);
assert.match(page, /Seeded \$\{count\} sample contract/);
assert.match(page, /Active reviews/);
assert.match(page, /Active blocked/);
assert.match(page, /Active high risk/);
assert.match(page, /Open reviewer\/bot concerns/);
assert.match(page, /Needs human/);
assert.match(page, /All records/);
assert.match(`${page}\n${layout}`, /\/inbox/);
assert.match(inbox, /parseContractMarkdown/);
assert.match(inbox, /evaluateRisk/);
assert.match(inbox, /\/api\/contracts/);
assert.match(inbox, /Add to Review Queue/);
assert.match(inbox, /Saved to Queue/);
assert.match(inbox, /Agent contract markdown input/);
assert.match(inbox, /Analyze/);
assert.match(inbox, /Decision summary/);
assert.match(detail, /Run Detail/);
assert.match(detail, /Open reviewer\/bot concerns/);
assert.match(detail, /Why review this first\?/);
assert.match(detail, /Human Review Checklist/);
assert.match(detail, /Agent identity/);
assert.match(detail, /Runtime\/source/);
assert.match(detail, /Human check:/);
assert.match(detail, /id="related-runs"/);
assert.match(detail, /id="files-touched"/);
assert.match(detail, /id="shared-boundaries"/);
assert.match(detail, /id="migration-details"/);
assert.match(detail, /id="review-checklist"/);
assert.match(detail, /Open run/);
assert.match(detail, /Compare with run/);
assert.match(detail, /left: currentId, right: relatedRunId/);
assert.match(detail, /\/api\/contracts\/\$\{id\}/);
assert.match(detail, /\/api\/review\/\$\{item\.id\}/);
assert.match(detail, /Raw Markdown/);
assert.match(detail, /Full parsed contract/);
assert.match(serverStore, /relatedContractsFor/);
assert.match(serverStore, /evaluateRisk/);
assert.match(serverStore, /candidate\.id !== record\.id/);
assert.match(contractsApi, /POST/);
assert.match(contractsApi, /GET/);
assert.match(detailApi, /getReviewItem/);
assert.match(detailApi, /DELETE/);
assert.match(compare, /Compare Runs/);
assert.match(compare, /compareReviewItems/);
assert.match(reviewApi, /PATCH/);
assert.match(concernsApi, /updateReviewerConcerns/);
assert.match(ingestApi, /authorizeIngestRequest/);
assert.match(ingestStatusApi, /tokenConfigured/);
assert.match(ingestStatusApi, /ARC_INGEST_TOKEN/);
assert.match(status, /Human Approved/);
assert.match(status, /Rejected/);
assert.match(status, /Superseded/);
assert.match(status, /Archived/);
assert.match(agentIdentity, /Contract `agent` wins|agentDisplayFor/);
assert.match(agentIdentity, /Unknown agent/);
assert.match(riskTypes, /RelatedRunEvidence/);
assert.match(riskTypes, /evidence\?: RiskReasonEvidence/);
assert.match(riskRules, /sameFileOverlapEvidence/);
assert.match(riskRules, /Shared file-boundary overlap with/);
assert.match(riskRules, /relatedRuns: sameFileRuns/);
assert.doesNotMatch(riskRules, /Same-file overlap detected with another run/);
assert.doesNotMatch(riskRules, /Specific shared file boundary touched by multiple runs/);
assert.doesNotMatch(riskRules, /Broad app\/package shared boundary touched by multiple runs/);

console.log('Agent Review Control SQLite/API review flow smoke check passed.');
