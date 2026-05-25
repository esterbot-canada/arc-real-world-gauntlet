# ARC Human Reviewer Guide

ARC is a local control surface for reviewing agent work before you approve, merge, deploy, or build on top of it.

It does not replace your judgment. It organizes the evidence so review is faster and safer.

## Review workflow

1. Open the ARC dashboard.
2. Check the Review Queue.
3. Open the highest-priority run first.
4. Read **Open reviewer/bot concerns** first if PR concerns were ingested.
5. Read the contract summary, files touched, systems touched, tests, and risk reasons.
6. Decide whether the run is ready, blocked, or needs more information.
6. Mark the run `Human Approved`, `Rejected`, or leave it in review.

## What the labels mean

ARC uses deterministic signals from the contract and related saved runs.

High-priority review usually means one or more of:
- same-file overlap with another run
- config/schema/migration/database/auth/security/billing boundary touched
- missing tests
- missing rollback for risky changes
- incomplete contract on sensitive work
- unresolved open questions

Medium review signals usually mean:
- shared system touched
- assumptions present
- rationale is thin
- change is broader than a simple isolated edit

Low risk means no obvious deterministic signal was found. It does **not** mean the change is guaranteed safe.

## Approval checklist

Approve only when you can answer yes:
- Do I understand what changed and why?
- Are the touched files/systems plausible and complete?
- Are tests listed, or is the lack of tests acceptable for this change?
- Are open questions resolved or acceptable?
- Is rollback clear enough for the risk level?
- Are overlap warnings acceptable?
- Are unresolved human, bot, or check concerns answered?
- Would I be comfortable merging/building on this?

## Rejection/blocking checklist

Reject or block when:
- The contract is too incomplete to trust.
- Files/systems are missing or suspiciously vague.
- Tests are missing for risky code.
- The rollback path is missing for config/schema/migration/security changes.
- The summary does not explain why the change was made.
- The run overlaps with another active run and needs coordination.
- The agent claims certainty without evidence.
- Review comments or bot/check annotations flag auth, migration, breaking, regression, or test concerns that are not resolved.

## Handling incomplete contracts

Incomplete contracts are allowed because hiding uncertainty is worse than surfacing it.

When you see one:
1. Check which fields are missing.
2. Ask the agent for a corrected contract if the run matters.
3. Do not approve sensitive changes from incomplete evidence.
4. Use the incomplete state as a quality signal for that agent/workflow.

## Testing ARC with another person

Give testers the `tester-quickstart.md` and ask them to complete one loop:

agent contract → auto-inject → ARC queue → human review → approve/reject decision

Ask them to report:
- where they got confused
- whether risk reasons felt useful
- whether the contract template was easy to fill
- whether the approve/reject decision felt safer than reviewing raw diffs alone
