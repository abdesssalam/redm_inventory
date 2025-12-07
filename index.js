// index.js

// Load environment variables from .env file
require('dotenv').config();

// Discord and Database Libraries
const { Client, GatewayIntentBits } = require('discord.js');
// Use mysql2/promise for modern async/await support and connection pooling
const mysql = require('mysql2/promise');

// --- Database Connection Configuration ---
// Using createPool for efficient connection management
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT, // Default MySQL port is 3306
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- Discord Bot Initialization ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // ESSENTIAL for reading message content
    ]
});

const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;

// --- Bot Events ---

client.on('ready', () => {
    console.log(`✅ Inventory Bot Logged in as ${client.user.tag}!`);
    console.log(`Watching channel ID: ${TARGET_CHANNEL_ID}`);
});

client.on('messageCreate', async message => {
    // 1. Basic Filters
    if (message.author.bot || message.channelId !== TARGET_CHANNEL_ID) {
        return;
    }

    const logText = message.content;
    if (!logText) return;

    console.log(`\n--- Received Log ---`);

    // 2. Crucial: Parsing the Log Text with Regex
    // Matches the format: Xman deposit 100 iron ore in inventory
    const regex = /(\w+) (deposit|withdraw) (\d+) (.+) (in inventory|from inventory)/i;
    const match = logText.match(regex);

    if (!match) {
        console.log("Could not parse log text. Format may be different.");
        return;
    }

    // Destructure and normalize the data
    const player_name = match[1].trim();
    const transaction_type = match[2].toUpperCase();
    const quantity = parseInt(match[3]);
    const item_name = match[4].trim().toLowerCase(); // Normalize item name

    const discord_message_id = message.id;
    const timestamp = message.createdAt.toISOString().slice(0, 19).replace('T', ' '); // MySQL DATETIME format

    console.log(`Parsed -> Player: ${player_name}, Action: ${transaction_type}, Qty: ${quantity}, Item: ${item_name}`);

    // 3. Save Data to Database
    try {
        await logTransaction(transaction_type, quantity, item_name, player_name,
            timestamp, discord_message_id);
        console.log(`--- Log Successful ---`);
    } catch (error) {
        console.error("❌ Database Error during transaction:", error.message);
    }
});

// --- Database Logic Functions ---

/**
 * Logs a transaction and updates the live stock in a single database transaction.
 */
async function logTransaction(type, qty, item, player, timestamp, msg_id) {
    // Get a connection from the pool
    const connection = await pool.getConnection();

    try {
        // Start a transaction block
        await connection.beginTransaction();

        // A. Insert into the logs table (Audit Trail)
        // Note: For MySQL, we use `INSERT IGNORE` or `INSERT ... ON DUPLICATE KEY UPDATE` for conflict handling.
        // Assuming `discord_message_id` is a UNIQUE index on inventory_logs.
        const logQuery = `
            INSERT INTO inventory_logs (timestamp, item_name, quantity, transaction_type, player_name, discord_message_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE id=id;
        `;
        // Using '?' placeholders for safe parameter binding
        await connection.execute(logQuery, [timestamp, item, qty, type, player, msg_id]);

        // B. Update the live_stock table (Calculated Total)
        const stockChange = (type === 'DEPOSIT') ? qty : -qty;

        const stockQuery = `
            INSERT INTO live_stock (item_name, current_stock, last_updated)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                current_stock = current_stock + ?, 
                last_updated = ?;
        `;
        // We pass stockChange twice: once for the initial INSERT, and once for the UPDATE clause.
        await connection.execute(stockQuery, [item, stockChange, timestamp, stockChange, timestamp]);

        await connection.commit();

    } catch (e) {
        console.error("Rolling back database transaction due to error:", e);
        await connection.rollback();
        throw e;
    } finally {
        // Release the connection back to the pool
        connection.release();
    }
}

// Start the Discord Bot
client.login(process.env.DISCORD_BOT_TOKEN)
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