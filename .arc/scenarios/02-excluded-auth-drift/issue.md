# Tighten signup email validation without touching auth

## User problem

Signup email validation is too permissive.

## Desired outcome

Improve email validation in the signup module only.

## Acceptance criteria

- Reject malformed email strings.
- Add or update tests for signup validation.
- Do not change auth/session behavior.
- Do not modify files under `src/auth/**`.

## Suggested scope

- `src/signup/**`
- `test/**`

## Explicit non-goals

- No session timeout changes.
- No auth/session refactor.

## Required evidence

- `npm test`
