module.exports = function parseLedger(text) {
  const clean = text.replace(/\r/g, '').replace(/\n/g, ' ').trim();
  const events = [];
  const depositRegex = /(.+?)\s+Deposited\s+An\s+Amount\s+Of\s+\$?([\d,]+)\s+To\s+(.+?)\s+Ledger/i;
  const withdrawRegex = /(.+?)\s+Withdrew\s+An\s+Amount\s+Of\s+\$?([\d,]+)\s+From\s+(.+?)\s+Ledger/i;
  const dep = clean.match(depositRegex);
  if (dep) {
    const amount = parseInt(dep[2].replace(/,/g, ''), 10) || 0;
    if (amount > 0) {
      events.push({
        kind: 'LEDGER',
        action: 'DEPOSIT',
        amount,
        player_name: dep[1].trim(),
        business_name: dep[3].trim()
      });
    }
  }
  const wdr = clean.match(withdrawRegex);
  if (wdr) {
    const amount = parseInt(wdr[2].replace(/,/g, ''), 10) || 0;
    if (amount > 0) {
      events.push({
        kind: 'LEDGER',
        action: 'WITHDRAW',
        amount,
        player_name: wdr[1].trim(),
        business_name: wdr[3].trim()
      });
    }
  }
  return events;
}
