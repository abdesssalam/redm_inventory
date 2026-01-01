module.exports = {
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT
  },
  discordToken: process.env.DISCORD_BOT_TOKEN,
  logsChannel: process.env.INVENTORY_LOGS_CHANNEL,
  stockChannel: process.env.LIVE_STOCK_CHANNEL,
  appName: process.env.APP_NAME || 'APP NAME',
  billChannel: process.env.BILL_SUMARRY_CHANNEL,
  billLogsChannel: process.env.BILL_LOGS_CHANNEL,
  ledgerLogsChannel: process.env.LEADGER_LOGS_CHANNEL,
  ledgerSummaryChannel: process.env.LEADGER_SUMMARY_CHANNEL,
  businessName: process.env.BUSINESS_NAME
}
