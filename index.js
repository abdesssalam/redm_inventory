// index.js

// Load environment variables from .env file
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./src/config');
const { pool } = require('./src/db');
const createInventoryRepository = require('./src/repositories/inventoryRepository');
const createBillingRepository = require('./src/repositories/billingRepository');
const parseLogModule = require('./src/services/logParser');
const createLeaderboardService = require('./src/services/leaderboardService');
const createBillingLogPublisher = require('./src/services/billingLogPublisher');
const createBillingSummaryService = require('./src/services/billingSummaryService');
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
const repo = createInventoryRepository(pool);
const billingRepo = createBillingRepository(pool);
const leaderboard = createLeaderboardService(pool, client, LIVE_STOCK_CHANNEL, config.appName);
const billSummary = createBillingSummaryService(pool, client, BILL_SUMMARY_CHANNEL, config.appName);
const billPublisher = createBillingLogPublisher(client, BILL_LOGS_CHANNEL, config.appName);
const parseLog = parseLogModule;

// --- Bot Events ---

client.on('ready', () => {
    leaderboard.ensureStockMessageTable().catch(() => {});
});

createDiscordBot(client, parseLog, repo, leaderboard, { logsChannel: INVENTORY_LOGS_CHANNEL, billLogsChannel: BILL_LOGS_CHANNEL }, billingRepo, billSummary, billPublisher);

 

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
