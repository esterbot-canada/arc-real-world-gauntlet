export type TrustBriefStatus = 'Pass' | 'Needs Review' | 'Blocked';

export type TrustBriefInput = {
  status: TrustBriefStatus;
  summaryReason: string;
  focusQuestions: string[];
  receipts: string[];
};

function renderList(items: string[], emptyText: string): string {
  if (items.length === 0) return emptyText;
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function renderReceiptList(receipts: string[]): string {
  if (receipts.length === 0) return '- No receipts captured.';
  return receipts.map((receipt) => `- ${receipt}`).join('\n');
}

export function renderTrustBriefMarkdown(input: TrustBriefInput): string {
  const focusQuestions = renderList(input.focusQuestions.slice(0, 3), 'No focus questions.');
  const receipts = renderReceiptList(input.receipts);

  return `## ARC Trust Brief: ${input.status}

${input.summaryReason}

### Focus Questions
${focusQuestions}

<details>
<summary>Receipts</summary>

${receipts}

</details>
`;
}
