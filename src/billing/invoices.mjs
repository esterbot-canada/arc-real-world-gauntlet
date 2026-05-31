export function formatInvoiceLabel(invoice) {
  return `Customer Invoice ${invoice.id}`;
}

export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
