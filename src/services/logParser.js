module.exports = function parseLog(text) {
  const clean = text.replace(/\r/g, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const firstLine = lines[0] || '';
  let player = firstLine;
  const nameFromDeposit = clean.match(/^(.+?)\s+Deposited/i)?.[1]?.trim();
  const nameFromWithdraw = clean.match(/^(.+?)\s+Has\s+Taken\s+A/i)?.[1]?.trim();
  const nameFromTransfer = clean.match(/^(.+?)\s+transferred/i)?.[1]?.trim();
  player = nameFromDeposit || nameFromWithdraw || nameFromTransfer || player;
  const events = [];
  const depositMatch = clean.match(/Deposited\s+(\d+)\s+(.+?)\s+To\s+.+?Inventory/i);
  if (depositMatch) {
    const qty = parseInt(depositMatch[1], 10);
    const item = depositMatch[2].trim().toLowerCase();
    events.push({ transaction_type: 'DEPOSIT', quantity: qty, item_name: item, player_name: player });
  }
  const withdrawMatch = clean.match(/Has\s+Taken\s+A\s+(\d+)\s+(.+?)\s+From\s+.+?Inventory/i);
  if (withdrawMatch) {
    const qty = parseInt(withdrawMatch[1], 10);
    const item = withdrawMatch[2].trim().toLowerCase();
    events.push({ transaction_type: 'WITHDRAW', quantity: qty, item_name: item, player_name: player });
  }
  const transferMatch = clean.match(/transferred\s+(\d+)\s+items\s+from\s+a\s+transport\s+box\s+to\s+container\s+\d+/i);
  if (transferMatch) {
    const jsonArrMatch = clean.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (jsonArrMatch) {
      try {
        const contents = JSON.parse(jsonArrMatch[0]);
        if (Array.isArray(contents)) {
          for (const it of contents) {
            const qty = parseInt(it?.count, 10) || 0;
            const label = (it?.label || it?.name || '').toString().trim().toLowerCase();
            if (label && qty > 0) {
              events.push({ transaction_type: 'DEPOSIT', quantity: qty, item_name: label, player_name: player });
            }
          }
        }
      } catch (_e) {}
    }
  }
  return events;
}
