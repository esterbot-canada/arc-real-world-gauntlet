# Fix settings visibility bug with trusted evidence

## User problem

Profiles with whitespace-only display names can appear visible after normalization.

## Desired outcome

Ensure profile visibility is based on a normalized display name.

## Acceptance criteria

- `canShowProfile` should not show whitespace-only display names.
- Keep the change in settings/profile and tests.
- Use trusted command receipts, not only a written claim that tests passed.

## Suggested scope

- `src/settings/**`
- `test/settings.test.mjs`

## Required evidence

- `npm test`
