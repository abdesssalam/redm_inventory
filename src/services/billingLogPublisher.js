const { EmbedBuilder } = require('discord.js');
module.exports = function createBillingLogPublisher(client, channelId, appName) {
  function buildIssueEmbed(issuer, customer, amount, timestamp) {
    const embed = new EmbedBuilder()
      .setTitle('📋 Bill Issued')
      .setDescription(appName || 'APP NAME')
      .addFields(
        { name: 'Issued By', value: issuer, inline: true },
        { name: 'Issued To', value: customer, inline: true },
        { name: 'Amount', value: `$${amount}`, inline: true }
      )
      .setColor(0xFFA500)
      .setTimestamp(new Date(timestamp));
    return embed;
  }
  function buildPaidEmbed(payer, issuer, amount, timestamp) {
    const embed = new EmbedBuilder()
      .setTitle('💰 Bill Paid')
      .setDescription(appName || 'APP NAME')
      .addFields(
        { name: 'Paid By', value: payer, inline: true },
        { name: 'Paid To', value: issuer, inline: true },
        { name: 'Amount', value: `$${amount}`, inline: true }
      )
      .setColor(0x00C853)
      .setTimestamp(new Date(timestamp));
    return embed;
  }
  async function publish(event, timestamp) {
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    if (event.action === 'ISSUE') {
      const embed = buildIssueEmbed(event.issuer_name, event.customer_name, event.amount, timestamp);
      await channel.send({ embeds: [embed] });
    } else if (event.action === 'PAY') {
      const embed = buildPaidEmbed(event.payer_name, event.issuer_name, event.amount, timestamp);
      await channel.send({ embeds: [embed] });
    }
  }
  return { publish };
}
