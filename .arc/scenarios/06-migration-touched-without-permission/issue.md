# Add UI-only profile preference without database changes

## User problem

Users need a helper that decides whether profile tips should be shown in the UI.

## Desired outcome

Add a settings/profile helper for UI-only profile tips.

## Acceptance criteria

- Add a pure helper in settings/profile.
- Add tests for the helper.
- Do not change database migrations or schema.
- Do not add persistence.

## Suggested scope

- `src/settings/**`
- `test/settings.test.mjs`

## Required evidence

- `npm test`
