const { EmbedBuilder } = require('discord.js');
module.exports = function createLedgerLogPublisher(client, channelId, appName) {
  function buildDepositEmbed(player, business, amount, timestamp) {
    const embed = new EmbedBuilder()
      .setTitle('🏦 Ledger Deposit')
      .setDescription(appName || 'APP NAME')
      .addFields(
        { name: 'Business', value: business, inline: true },
        { name: 'Player', value: player, inline: true },
        { name: 'Amount', value: `$${amount}`, inline: true }
      )
      .setColor(0x00C853)
      .setTimestamp(new Date(timestamp));
    return embed;
  }
  function buildWithdrawEmbed(player, business, amount, timestamp) {
    const embed = new EmbedBuilder()
      .setTitle('🏦 Ledger Withdraw')
      .setDescription(appName || 'APP NAME')
      .addFields(
        { name: 'Business', value: business, inline: true },
        { name: 'Player', value: player, inline: true },
        { name: 'Amount', value: `$${amount}`, inline: true }
      )
      .setColor(0xE53935)
      .setTimestamp(new Date(timestamp));
    return embed;
  }
  async function publish(event, timestamp) {
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    if (event.action === 'DEPOSIT') {
      const embed = buildDepositEmbed(event.player_name, event.business_name, event.amount, timestamp);
      await channel.send({ embeds: [embed] });
    } else if (event.action === 'WITHDRAW') {
      const embed = buildWithdrawEmbed(event.player_name, event.business_name, event.amount, timestamp);
      await channel.send({ embeds: [embed] });
    }
  }
  return { publish };
}
