const { EmbedBuilder } = require('discord.js');
module.exports = function createBillingSummaryService(pool, client, billChannel, appName) {
  async function ensureBillMessageTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS bot_bill_message (
        guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
        message_id VARCHAR(32) NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `;
    await pool.execute(sql);
  }
  async function getBillMessageId(guildId) {
    const [rows] = await pool.execute('SELECT message_id FROM bot_bill_message WHERE guild_id = ?', [String(guildId)]);
    if (rows && rows.length > 0) return rows[0].message_id;
    return null;
  }
  async function setBillMessageId(guildId, messageId) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sql = `
      INSERT INTO bot_bill_message (guild_id, message_id, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), updated_at = VALUES(updated_at)
    `;
    await pool.execute(sql, [String(guildId), String(messageId), ts]);
  }
  function formatSummary(rows) {
    const items = (rows || []).map(r => `**${r.customer_name}** — paid: ${r.paid_count}, unpaid: ${r.unpaid_count}, unpaid total: $${r.unpaid_total}`);
    const spacer = '\u00A0'.repeat(6);
    const lines = [];
    for (let i = 0; i < items.length; i += 3) {
      lines.push(items.slice(i, i + 3).join(spacer));
    }
    return lines.length ? lines.join('\n') : 'No billing data available.';
  }
  async function updateBillSummary(guildId, getSummaryRows) {
    const channelId = billChannel;
    if (!channelId) return;
    const rows = await getSummaryRows();
    const body = formatSummary(rows);
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setTitle(appName || 'APP NAME')
      .setDescription(`🧾 Billing Summary\n\n${body}`)
      .setColor(0x4b5563);
    const existingId = await getBillMessageId(guildId);
    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit({ content: null, embeds: [embed] });
        return;
      } catch (_e) {}
    }
    const sent = await channel.send({ embeds: [embed] });
    await setBillMessageId(guildId, sent.id);
  }
  return { ensureBillMessageTable, updateBillSummary };
}
