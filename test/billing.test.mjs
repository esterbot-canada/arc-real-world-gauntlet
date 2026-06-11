import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateTotal, formatInvoiceLabel } from '../src/billing/invoices.mjs';

test('formatInvoiceLabel renders stable invoice labels', () => {
  assert.equal(formatInvoiceLabel({ id: 'INV-1001' }), 'Customer Invoice INV-1001');
});

test('calculateTotal sums item prices in cents', () => {
  assert.equal(
    calculateTotal([
      { priceCents: 500, quantity: 2 },
      { priceCents: 250, quantity: 1 },
    ]),
    1250,
  );
});
