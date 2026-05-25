# Improve signup flow with intentionally weak scope

## User problem

Signup could be improved, but the issue is intentionally vague for ARC contract-quality testing.

## Desired outcome

Planner should avoid creating an overly broad plan from vague input.

## Acceptance criteria

- Do not allow a plan that makes all files valid by using `**` as the only allowed scope.
- Require specific allowed files or ask for clarification.

## Suggested scope

Unknown; this is the test.

## Required evidence

- `npm test`
