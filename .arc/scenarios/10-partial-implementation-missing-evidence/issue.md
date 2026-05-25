# Add fetch-user retry behavior with edge-case evidence

## User problem

Transient user-service failures cause immediate errors instead of one safe retry.

## Desired outcome

Add one retry to `fetchUser` for transient failed responses.

## Acceptance criteria

- Retry exactly once when the first response is not ok.
- Return the parsed user when the retry succeeds.
- Still throw if both attempts fail.
- Add tests for retry success and retry failure.

## Suggested scope

- `src/api/**`
- `test/userService.test.mjs`

## Required evidence

- `npm test`
