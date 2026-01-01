const { EmbedBuilder } = require('discord.js');
module.exports = function createLedgerSummaryService(pool, client, channelId, appName) {
  async function ensureLedgerMessageTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS bot_ledger_message (
        guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
        message_id VARCHAR(32) NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `;
    await pool.execute(sql);
  }
  async function getLedgerMessageId(guildId) {
    const [rows] = await pool.execute('SELECT message_id FROM bot_ledger_message WHERE guild_id = ?', [String(guildId)]);
    if (rows && rows.length > 0) return rows[0].message_id;
    return null;
  }
  async function setLedgerMessageId(guildId, messageId) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sql = `
      INSERT INTO bot_ledger_message (guild_id, message_id, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), updated_at = VALUES(updated_at)
    `;
    await pool.execute(sql, [String(guildId), String(messageId), ts]);
  }
  function buildEmbed(rows) {
    if (!rows || rows.length === 0) {
      return new EmbedBuilder()
        .setTitle(appName || 'APP NAME')
        .setDescription('🏦 Ledger Summary\n\nNo ledger data available.')
        .setColor(0x374151);
    }
    const r = rows[0];
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return new EmbedBuilder()
      .setTitle(appName || 'APP NAME')
      .setDescription(`🏦 Ledger Summary\n\n${r.business_name}`)
      .addFields(
        { name: 'Current Balance', value: `$${r.current_balance}`, inline: true },
        { name: 'Today', value: `$${r.today_balance}`, inline: true },
        { name: 'This Week', value: `$${r.week_balance}`, inline: true },
        { name: 'This Month', value: `$${r.month_balance}`, inline: true }
      )
      .setColor(0x374151)
      .setFooter({ text: `Updated at: ${ts}` });
  }
  async function updateLedgerSummary(guildId, getSummaryRows) {
    if (!channelId) return;
    const rows = await getSummaryRows();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    const embed = buildEmbed(rows);
    const existingId = await getLedgerMessageId(guildId);
    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit({ content: null, embeds: [embed] });
        return;
      } catch (_e) {}
    }
    const sent = await channel.send({ embeds: [embed] });
    await setLedgerMessageId(guildId, sent.id);
  }
  return { ensureLedgerMessageTable, updateLedgerSummary };
}
