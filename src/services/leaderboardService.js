const { EmbedBuilder } = require('discord.js');
module.exports = function createLeaderboardService(pool, client, stockChannel, appName) {
  async function ensureStockMessageTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS bot_stock_message (
        guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
        message_id VARCHAR(32) NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `;
    await pool.execute(sql);
  }
  async function getStockMessageId(guildId) {
    const [rows] = await pool.execute('SELECT message_id FROM bot_stock_message WHERE guild_id = ?', [String(guildId)]);
    if (rows && rows.length > 0) return rows[0].message_id;
    return null;
  }
  async function setStockMessageId(guildId, messageId) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sql = `
      INSERT INTO bot_stock_message (guild_id, message_id, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), updated_at = VALUES(updated_at)
    `;
    await pool.execute(sql, [String(guildId), String(messageId), ts]);
  }
  function formatStock(rows) {
    const items = (rows || []).map(r => `**${r.item_name}**: ${r.current_stock}`);
    const spacer = '\u00A0'.repeat(8);
    const lines = [];
    for (let i = 0; i < items.length; i += 4) {
      lines.push(items.slice(i, i + 4).join(spacer));
    }
    return lines.length ? lines.join('\n') : 'No stock data available.';
  }
  async function updateLeaderboard(guildId, getAllStock) {
    const channelId = stockChannel;
    if (!channelId) return;
    const rows = await getAllStock();
    const body = formatStock(rows);
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setTitle(appName || 'APP NAME')
      .setDescription(`📊 Live Inventory\n\n${body}`)
      .setColor(0x2f3136);
    const existingId = await getStockMessageId(guildId);
    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit({ content: null, embeds: [embed] });
        return;
      } catch (_e) {}
    }
    const sent = await channel.send({ embeds: [embed] });
    await setStockMessageId(guildId, sent.id);
  }
  return { ensureStockMessageTable, updateLeaderboard };
}
