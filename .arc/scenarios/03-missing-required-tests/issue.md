# Add profile display-name validation with required tests

## User problem

Profile display names can be saved with unusable values.

## Desired outcome

Add display-name validation in the settings/profile module.

## Acceptance criteria

- Reject display names shorter than 2 visible characters.
- Reject display names longer than 40 characters.
- Preserve trimming behavior.
- Add tests for valid, too-short, and too-long names.

## Suggested scope

- `src/settings/**`
- `test/settings.test.mjs`

## Required evidence

- `npm test`
