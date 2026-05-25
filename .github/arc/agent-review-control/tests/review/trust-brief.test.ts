import assert from 'node:assert/strict';
import test from 'node:test';

import { renderTrustBriefMarkdown } from '../../lib/review/trust-brief.ts';

test('renders max three focus questions with collapsible receipts', () => {
  const markdown = renderTrustBriefMarkdown({
    status: 'Needs Review',
    summaryReason: 'This PR has scope or evidence issues that should be inspected before normal review.',
    focusQuestions: [
      'Why did `src/auth/session.ts` change outside the approved scope? Impact: outside allowed assignment.',
      'Was `npm test -- SignupForm` actually run successfully? Impact: required evidence missing.',
      'Is `package-lock.json` expected for this task? Impact: dependency surface changed.',
      'Extra item should not render above fold',
    ],
    receipts: ['Changed files: src/auth/session.ts', 'Missing command: npm test -- SignupForm'],
  });

  assert.match(markdown, /ARC Trust Brief: Needs Review/);
  assert.match(markdown, /Why did/);
  assert.match(markdown, /Was `npm test -- SignupForm`/);
  assert.match(markdown, /Is `package-lock.json` expected/);
  assert.doesNotMatch(markdown, /Extra item/);
  assert.match(markdown, /<details>/);
  assert.match(markdown, /<summary>Receipts<\/summary>/);
});

test('renders pass state without focus questions', () => {
  const markdown = renderTrustBriefMarkdown({
    status: 'Pass',
    summaryReason: 'Changed files stayed inside approved scope and required checks passed.',
    focusQuestions: [],
    receipts: [],
  });

  assert.match(markdown, /ARC Trust Brief: Pass/);
  assert.match(markdown, /No focus questions/);
  assert.match(markdown, /No receipts captured/);
});
