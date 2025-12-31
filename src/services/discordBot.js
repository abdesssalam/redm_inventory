const parseBill = require('./billParser');
module.exports = function createDiscordBot(client, parseLog, repo, leaderboard, config, billingRepo, billingSummary, billPublisher) {
  client.on('ready', () => {
    leaderboard.ensureStockMessageTable().catch(() => {});
    billingSummary.ensureBillMessageTable().catch(() => {});
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
    const logsChannelId = config.logsChannel;
    if (!logsChannelId || message.channelId !== logsChannelId) return;
    const discordMessageId = message.id;
    const timestamp = message.createdAt.toISOString().slice(0, 19).replace('T', ' ');
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
    const billEvents = parseBill(composed) || [];
    for (const [bIdx, b] of billEvents.entries()) {
      const eventId = String(BigInt(discordMessageId) + BigInt(1000 + bIdx));
      try {
        if (b.action === 'ISSUE') {
          await billingRepo.logBillIssue(b.amount, b.issuer_name, b.customer_name, timestamp, eventId);
        } else if (b.action === 'PAY') {
          await billingRepo.logBillPayment(b.amount, b.issuer_name, b.customer_name, timestamp, eventId);
        }
      } catch (_e) {}
    }
    if (billEvents.length > 0) {
      try { await billingSummary.updateBillSummary(message.guildId, billingRepo.getBillSummaryByCustomer); } catch (_e) {}
      try {
        for (const b of billEvents) {
          await billPublisher.publish(b, timestamp);
        }
      } catch (_e) {}
    }
  });
}
