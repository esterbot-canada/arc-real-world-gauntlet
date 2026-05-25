# Change billing invoice label while preserving frozen plan

## User problem

Billing invoice labels need clearer customer-facing text.

## Desired outcome

Update billing invoice labels without changing the frozen plan after implementation starts.

## Acceptance criteria

- Change billing label behavior and tests only.
- Do not edit `.arc/plan.aiplan` in the implementation PR after the plan is frozen.
- Preserve contract hash integrity.

## Suggested scope

- `src/billing/**`
- `test/billing.test.mjs`

## Required evidence

- `npm test`
