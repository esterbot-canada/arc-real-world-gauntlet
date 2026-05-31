# Add signup test helper without crossing auth boundary

## User problem

Signup tests need a small local helper so future validation tests stay readable.

## Desired outcome

Add a signup-owned helper and use it from signup tests.

## Acceptance criteria

- Keep helper code under `src/signup/**`.
- Keep tests in `test/signup.test.mjs`.
- Do not import or re-export auth/session code.
- Run `npm test`.

## Suggested scope

- `src/signup/**`
- `test/signup.test.mjs`

## Required evidence

- `npm test`
- Changed helper file under `src/signup/**`
