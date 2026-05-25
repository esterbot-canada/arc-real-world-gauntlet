# Fix billing invoice label without unrelated settings changes

## User problem

Invoice labels should be clearer for customers.

## Desired outcome

Change billing invoice labels only.

## Acceptance criteria

- Update billing label behavior and billing tests.
- Do not change settings/profile behavior.
- Passing tests alone is not enough if the PR changes unrelated files.

## Suggested scope

- `src/billing/**`
- `test/billing.test.mjs`

## Explicit non-goals

- No settings/profile changes.
- No signup changes.
- No auth changes.

## Excluded scope

- `src/settings/**`
- `src/signup/**`
- `src/auth/**`

## Required evidence

- `npm test`
