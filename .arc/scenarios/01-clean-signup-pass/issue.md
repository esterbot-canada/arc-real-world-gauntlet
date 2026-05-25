# Tighten signup email validation

## User problem

Users can submit obviously invalid signup emails as long as the string contains `@`.

## Desired outcome

Update signup email validation so common invalid email inputs are rejected before signup continues.

## Acceptance criteria

- Reject missing local part, missing domain, and whitespace-only emails.
- Accept a normal email like `person@example.com`.
- Keep the change scoped to signup validation and tests.
- Do not touch auth/session behavior.

## Suggested scope

- `src/signup/**`
- `test/**`

## Required evidence

- `npm test`
