module.exports = function parseBill(text) {
  const clean = text.replace(/\r/g, '').replace(/\n/g, ' ').trim();
  const events = [];
  const issueRegex = /(.+?)\s+Issued\s+A\s+Bill\s+Amount\s+Of\s+\$?([\d,]+)\s+To\s+(.+?)(?:\s+Discord:|$)/i;
  const payRegex = /(.+?)\s+Paid\s+A\s+Bill\s+Amount\s+Of\s+\$?([\d,]+)\s+To\s+(.+?)(?:\s+Discord:|$)/i;
  const issueMatch = clean.match(issueRegex);
  if (issueMatch) {
    const amt = parseInt(issueMatch[2].replace(/,/g, ''), 10);
    events.push({
      kind: 'BILL',
      action: 'ISSUE',
      issuer_name: issueMatch[1].trim(),
      amount: amt,
      customer_name: issueMatch[3].trim()
    });
  }
  const payMatch = clean.match(payRegex);
  if (payMatch) {
    const amt = parseInt(payMatch[2].replace(/,/g, ''), 10);
    events.push({
      kind: 'BILL',
      action: 'PAY',
      payer_name: payMatch[1].trim(),
      amount: amt,
      issuer_name: payMatch[3].trim(),
      customer_name: payMatch[1].trim()
    });
  }
  return events;
}
