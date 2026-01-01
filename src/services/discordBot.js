const parseBill = require('./billParser');
const parseLedger = require('./ledgerParser');
module.exports = function createDiscordBot(client, parseLog, repo, leaderboard, config, billingRepo, billingSummary, billPublisher, ledgerRepo, ledgerSummary, ledgerPublisher) {
  client.on('ready', () => {
    leaderboard.ensureStockMessageTable().catch(() => {});
    billingSummary.ensureBillMessageTable().catch(() => {});
    ledgerSummary.ensureLedgerMessageTable().catch(() => {});
    try {
      client.guilds.cache.forEach(async g => {
        try { await billingSummary.updateBillSummary(g.id, billingRepo.getBillSummaryByCustomer); } catch (_e) {}
      });
    } catch (_e) {}
  });
  client.on('messageCreate', async message => {
    const isBotNonWebhook = message.author.bot && (message.webhookId === null || message.webhookId === undefined);
    if (isBotNonWebhook) return;
    const logText = message.content;
    const embed = Array.isArray(message.embeds) && message.embeds.length ? message.embeds[0] : null;
    let composed = logText;
    if (embed) {
      const title = embed.title || embed?.data?.title || '';
      const description = embed.description || embed?.data?.description || '';
      if (title || description) {
        composed = [title, description].filter(Boolean).join('\n');
      }
    }
    if (!composed) return;
    const content = logText ? logText.trim() : '';
    if (content.startsWith('!stock')) {
      const args = content.split(/\s+/).slice(1);
      try {
        if (args.length === 0) {
          const rows = await repo.getAllStock();
          if (!rows || rows.length === 0) {
            await message.reply('No stock data available.');
            return;
          }
          const lines = rows.map(r => `${r.item_name}: ${r.current_stock}`);
          await message.reply(lines.join('\n'));
        } else {
          const item = args.join(' ').toLowerCase();
          const qty = await repo.getItemStock(item);
          await message.reply(`${item}: ${qty}`);
        }
      } catch (e) {
        await message.reply('Error fetching stock.');
      }
      return;
    }
    const discordMessageId = message.id;
    const timestamp = message.createdAt.toISOString().slice(0, 19).replace('T', ' ');
    const billEvents = parseBill(composed) || [];
    for (const [bIdx, b] of billEvents.entries()) {
      const eventId = String(BigInt(discordMessageId) + BigInt(1000 + bIdx));
      try {
        console.log(b);
        if (b.action === 'ISSUE') {
          await billingRepo.logBillIssue(b.amount, b.issuer_name, b.customer_name, timestamp, eventId);
        } else if (b.action === 'PAY') {
          await billingRepo.logBillPayment(b.amount, b.issuer_name, b.customer_name, timestamp, eventId);
          await ledgerRepo.updateBalance(b.amount, timestamp);
          try { await ledgerSummary.updateLedgerSummary(message.guildId, ledgerRepo.getLedgerSummary); } catch (_e) {}
        }
      } catch (_e) {}
    }
    if (billEvents.length > 0) {
      try { await billingSummary.updateBillSummary(message.guildId, billingRepo.getBillSummaryByCustomer); } catch (_e) {}
      try {
        for (const b of billEvents) {
          if (b.action !== 'PAY') {
            await billPublisher.publish(b, timestamp);
          } else {
            await billPublisher.publish(b, timestamp);
          }
        }
      } catch (_e) {}
    }
    const logsChannelId = config.logsChannel;
    if (!logsChannelId || message.channelId !== logsChannelId) return;
    const inventoryEvents = parseLog(composed) || [];
    for (const [idx, ev] of inventoryEvents.entries()) {
      try {
        const eventId = String(BigInt(discordMessageId) + BigInt(idx));
        await repo.logTransaction(ev.transaction_type, ev.quantity, ev.item_name, ev.player_name, timestamp, eventId);
      } catch (_e) {}
    }
    if (inventoryEvents.length > 0) {
      try { await leaderboard.updateLeaderboard(message.guildId, repo.getAllStock); } catch (_e) {}
    }
    // billEvents handled above (before logs channel guard)
    const ledgerEvents = parseLedger(composed) || [];
    for (const [lIdx, l] of ledgerEvents.entries()) {
      const eventId = String(BigInt(discordMessageId) + BigInt(2000 + lIdx));
      try {
        await ledgerRepo.logLedgerTransaction(l.action, l.amount, l.player_name, l.business_name, timestamp, eventId);
      } catch (_e) {}
    }
    if (ledgerEvents.length > 0) {
      try { await ledgerSummary.updateLedgerSummary(message.guildId, ledgerRepo.getLedgerSummary); } catch (_e) {}
      try {
        for (const l of ledgerEvents) {
          await ledgerPublisher.publish(l, timestamp);
        }
      } catch (_e) {}
    }
  });
}
