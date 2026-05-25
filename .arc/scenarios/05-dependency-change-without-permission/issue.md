# Format billing invoice labels without new dependencies

## User problem

Invoice labels are too plain for customer emails.

## Desired outcome

Update billing invoice labels to include the customer-facing prefix `Customer Invoice`.

## Acceptance criteria

- `formatInvoiceLabel({ id: 'INV-1001' })` returns `Customer Invoice INV-1001`.
- Keep implementation in billing invoice helpers and billing tests.
- Do not add dependencies.
- Do not modify package files.

## Suggested scope

- `src/billing/**`
- `test/billing.test.mjs`

## Required evidence

- `npm test`
