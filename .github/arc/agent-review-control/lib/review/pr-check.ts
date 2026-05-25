import { parseMinimalAiplanText } from '../aiplan/minimal-parser.ts';
import { verifyMinimalAiplanContractHash } from '../aiplan/contract-hash.ts';
import { checkRequiredCommandReceipts, type CommandReceipt } from './command-receipts.ts';
import { checkScopeAgainstPlan } from './scope-check.ts';
import { renderTrustBriefMarkdown, type TrustBriefStatus } from './trust-brief.ts';
import type { ArcDiffSource } from '../gate/diff-range.ts';

export type ArcPrCheckInput = {
  planText: string;
  changedFiles: string[];
  receipts: CommandReceipt[];
  diffSource?: ArcDiffSource;
};

export type ArcPrCheckResult = {
  status: TrustBriefStatus;
  summaryReason: string;
  focusQuestions: string[];
  receipts: string[];
  markdown: string;
};

function blockedResult(reason: string, receipts: string[]): ArcPrCheckResult {
  const status: TrustBriefStatus = 'Blocked';
  const focusQuestions = [reason];
  const markdown = renderTrustBriefMarkdown({ status, summaryReason: reason, focusQuestions, receipts });
  return { status, summaryReason: reason, focusQuestions, receipts, markdown };
}

export function createArcPrCheck(input: ArcPrCheckInput): ArcPrCheckResult {
  const parsedPlan = parseMinimalAiplanText(input.planText);
  if (!parsedPlan.ok) {
    const receipts = parsedPlan.errors.map((error) => `Plan error: ${error.field}: ${error.reason}`);
    return blockedResult('Invalid or non-frozen .aiplan. ARC cannot prove the PR stayed inside the assignment.', receipts);
  }

  const contractHash = verifyMinimalAiplanContractHash(parsedPlan.plan);
  if (!contractHash.ok) {
    return blockedResult('Frozen .aiplan hash mismatch. ARC cannot trust this contract until the freeze hash is regenerated and re-approved.', [
      `Plan error: freeze.contract_hash: ${contractHash.reason}`,
      `Expected hash in plan: ${contractHash.expectedHash}`,
      `Actual hash from current plan content: ${contractHash.actualHash}`,
    ]);
  }

  const scope = checkScopeAgainstPlan({
    allowedFiles: parsedPlan.plan.allowed_scope.files,
    excludedFiles: parsedPlan.plan.excluded_scope.files,
    changedFiles: input.changedFiles,
  });
  const commands = checkRequiredCommandReceipts({
    requiredCommands: parsedPlan.plan.expected_evidence.required_commands,
    receipts: input.receipts,
  });
  const trustedReceiptCommands = new Set(
    input.receipts
      .filter((receipt) => receipt.provenance === 'trusted_ci' && receipt.exitCode === 0)
      .map((receipt) => receipt.command.trim()),
  );

  const focusQuestions: string[] = [];
  const excludedTouchedSet = new Set(scope.excludedTouched);
  const receipts: string[] = [
    `Allowed scope: ${parsedPlan.plan.allowed_scope.files.join(', ')}`,
    `Excluded scope: ${parsedPlan.plan.excluded_scope.files.length > 0 ? parsedPlan.plan.excluded_scope.files.join(', ') : 'none'}`,
    `Changed files: ${input.changedFiles.length > 0 ? input.changedFiles.join(', ') : 'none'}`,
    `Frozen contract hash verified: ${contractHash.actualHash}`,
  ];

  if (!input.diffSource || input.diffSource.trust !== 'provider_verified') {
    focusQuestions.push('Was the diff range derived from CI/provider base and head SHAs? Impact: caller-provided ranges can hide commits from ARC.');
    receipts.push('Diff range is not provider-verified. Treat changed-file evidence as caller-provided.');
  }

  for (const file of scope.invalidChangedFiles) {
    focusQuestions.push(`Why did \`${file}\` appear as an invalid changed path? Impact: path traversal or malformed paths can hide scope violations.`);
    receipts.push(`Invalid changed path: ${file}`);
  }

  for (const file of scope.excludedTouched) {
    focusQuestions.push(`Why did \`${file}\` change inside excluded scope? Impact: this crosses an explicit frozen contract boundary.`);
    receipts.push(`Excluded file touched: ${file}`);
  }

  for (const file of scope.outsideAllowed) {
    if (excludedTouchedSet.has(file)) continue;
    focusQuestions.push(`Why did \`${file}\` change outside allowed scope? Impact: reviewer should confirm this was required by the assignment.`);
    receipts.push(`Outside allowed scope: ${file}`);
  }

  if (input.changedFiles.length === 0) {
    focusQuestions.push('No changed files were detected. Impact: ARC cannot prove any implementation happened for this assignment.');
    receipts.push('No changed files detected in the supplied diff range.');
  }

  if (parsedPlan.plan.expected_evidence.required_commands.length === 0) {
    focusQuestions.push('No required command evidence was defined. Impact: ARC cannot bind this assignment to validation evidence.');
    receipts.push('No required command evidence defined in expected_evidence.required_commands.');
  }

  for (const command of commands.missingCommands) {
    focusQuestions.push(`Was \`${command}\` run successfully? Impact: required validation evidence is missing.`);
    receipts.push(`Missing required command receipt: ${command}`);
  }

  for (const command of commands.failedCommands) {
    focusQuestions.push(`Why did \`${command}\` fail? Impact: required validation did not pass.`);
    receipts.push(`Failed required command receipt: ${command}`);
  }

  for (const command of commands.satisfiedCommands) {
    if (trustedReceiptCommands.has(command)) {
      receipts.push(`Required command passed: ${command}`);
    } else {
      focusQuestions.push(`Was '${command}' verified by CI/provider evidence? Impact: agent-reported command receipts can be forged.`);
      receipts.push(`Agent-reported command, not trusted evidence: ${command}`);
    }
  }

  const status: TrustBriefStatus = scope.invalidChangedFiles.length > 0 || scope.excludedTouched.length > 0 ? 'Blocked' : focusQuestions.length > 0 ? 'Needs Review' : 'Pass';
  const summaryReason =
    status === 'Blocked'
      ? scope.invalidChangedFiles.length > 0
        ? 'This PR included invalid changed paths, so ARC cannot safely compare the diff to the frozen .aiplan.'
        : 'This PR crossed an explicit excluded scope boundary in the frozen .aiplan.'
      : status === 'Needs Review'
        ? 'This PR has scope or required-evidence issues that should be inspected before normal review.'
        : 'Changed files stayed inside approved scope and required checks passed.';

  const markdown = renderTrustBriefMarkdown({ status, summaryReason, focusQuestions, receipts });
  return { status, summaryReason, focusQuestions, receipts, markdown };
}
