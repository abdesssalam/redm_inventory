// index.js

// Load environment variables from .env file
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./src/config');
const { pool } = require('./src/db');
const createInventoryRepository = require('./src/repositories/inventoryRepository');
const createBillingRepository = require('./src/repositories/billingRepository');
const createLedgerRepository = require('./src/repositories/ledgerRepository');
const parseLogModule = require('./src/services/logParser');
const createLeaderboardService = require('./src/services/leaderboardService');
const createBillingLogPublisher = require('./src/services/billingLogPublisher');
const createBillingSummaryService = require('./src/services/billingSummaryService');
const createLedgerLogPublisher = require('./src/services/ledgerLogPublisher');
const createLedgerSummaryService = require('./src/services/ledgerSummaryService');
const createDiscordBot = require('./src/services/discordBot');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // ESSENTIAL for reading message content
    ]
});

const INVENTORY_LOGS_CHANNEL = config.logsChannel;
const LIVE_STOCK_CHANNEL = config.stockChannel;
const BILL_SUMMARY_CHANNEL = config.billChannel;
const BILL_LOGS_CHANNEL = config.billLogsChannel;
const LEDGER_SUMMARY_CHANNEL = config.ledgerSummaryChannel;
const LEDGER_LOGS_CHANNEL = config.ledgerLogsChannel;
const repo = createInventoryRepository(pool);
const billingRepo = createBillingRepository(pool);
const ledgerRepo = createLedgerRepository(pool, config.businessName);
const leaderboard = createLeaderboardService(pool, client, LIVE_STOCK_CHANNEL, config.appName);
const billSummary = createBillingSummaryService(pool, client, BILL_SUMMARY_CHANNEL, config.appName);
const billPublisher = createBillingLogPublisher(client, BILL_LOGS_CHANNEL, config.appName);
const ledgerSummary = createLedgerSummaryService(pool, client, LEDGER_SUMMARY_CHANNEL, config.appName);
const ledgerPublisher = createLedgerLogPublisher(client, LEDGER_LOGS_CHANNEL, config.appName);
const parseLog = parseLogModule;

// --- Bot Events ---

client.on('ready', () => {
    leaderboard.ensureStockMessageTable().catch(() => {});
    ledgerSummary.ensureLedgerMessageTable().catch(() => {});
});

createDiscordBot(client, parseLog, repo, leaderboard, { logsChannel: INVENTORY_LOGS_CHANNEL, billLogsChannel: BILL_LOGS_CHANNEL, businessName: config.businessName }, billingRepo, billSummary, billPublisher, ledgerRepo, ledgerSummary, ledgerPublisher);

 

// Start the Discord Bot
client.login(config.discordToken)
    .catch(err => {
        console.error("❌ Failed to log into Discord! Check DISCORD_BOT_TOKEN in .env file.");
        console.error(err);
    });

// Handle graceful shutdowns
process.on('SIGINT', () => {
    console.log("\nShutting down bot...");
    client.destroy();
    pool.end();
    process.exit(0);
});
