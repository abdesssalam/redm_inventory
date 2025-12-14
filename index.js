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

const channelConfig = new Map();

// --- Bot Events ---

client.on('ready', () => {
    console.log(`✅ Inventory Bot Logged in as ${client.user.tag}!`);
    ensureChannelsTable()
        .then(ensureStockMessageTable)
        .then(loadChannelConfig)
        .then(() => console.log('Channel configuration loaded'))
        .catch(e => console.error('Channel configuration error', e));
});

client.on('messageCreate', async message => {
    // 1. Basic Filters
    if (message.author.bot) {
        return;
    }

    const logText = message.content;
    if (!logText) return;

    const content = logText.trim();

    if (content.startsWith('!setlogchannel')) {
        try {
            await setChannel(message.guildId, 'logs', message.channelId);
            await message.reply('Log channel configured');
        } catch (_e) {
            await message.reply('Failed to configure log channel');
        }
        return;
    }

    if (content.startsWith('!setstockchannel')) {
        try {
            await setChannel(message.guildId, 'stock', message.channelId);
            await message.reply('Stock channel configured');
            await updateLeaderboard(message.guildId);
        } catch (_e) {
            await message.reply('Failed to configure stock channel');
        }
        return;
    }

    if (content.startsWith('!stock')) {
        const args = content.split(/\s+/).slice(1);
        try {
            if (args.length === 0) {
                const rows = await getAllStock();
                if (!rows || rows.length === 0) {
                    await message.reply('No stock data available.');
                    return;
                }
                const lines = rows.map(r => `${r.item_name}: ${r.current_stock}`);
                await message.reply(lines.join('\n'));
            } else {
                const item = args.join(' ').toLowerCase();
                const qty = await getItemStock(item);
                await message.reply(`${item}: ${qty}`);
            }
        } catch (e) {
            await message.reply('Error fetching stock.');
        }
        return;
    }

    const guildConf = channelConfig.get(message.guildId) || {};
    const logsChannelId = guildConf.logs;
    if (!logsChannelId || message.channelId !== logsChannelId) {
        return;
    }

    console.log(`\n--- Received Log ---`);

    const discord_message_id = message.id;
    const timestamp = message.createdAt.toISOString().slice(0, 19).replace('T', ' '); // MySQL DATETIME format

    const events = parseLog(logText);
    if (!events || events.length === 0) {
        console.log("Could not parse log text. Format may be different.");
        return;
    }
    for (const [idx, ev] of events.entries()) {
        console.log(`Parsed -> Player: ${ev.player_name}, Action: ${ev.transaction_type}, Qty: ${ev.quantity}, Item: ${ev.item_name}`);
        try {
            const event_id = String(BigInt(discord_message_id) + BigInt(idx));
            await logTransaction(ev.transaction_type, ev.quantity, ev.item_name, ev.player_name, timestamp, event_id);
        } catch (error) {
            console.error("❌ Database Error during transaction:", error.message);
        }
    }

    console.log(`--- Log Successful ---`);
    try {
        await updateLeaderboard(message.guildId);
    } catch (_e) {}
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

async function getItemStock(item) {
    const [rows] = await pool.execute('SELECT current_stock FROM live_stock WHERE item_name = ?', [item]);
    if (!rows || rows.length === 0) return 0;
    const v = rows[0]?.current_stock;
    return typeof v === 'number' ? v : parseInt(v) || 0;
}

async function getAllStock() {
    const [rows] = await pool.execute('SELECT item_name, current_stock FROM live_stock ORDER BY item_name ASC');
    return rows || [];
}

function parseLog(text) {
    const clean = text.replace(/\r/g, '');
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const firstLine = lines[0] || '';
    let player = firstLine;
    const nameFromDeposit = clean.match(/^(.+?)\s+Deposited/i)?.[1]?.trim();
    const nameFromWithdraw = clean.match(/^(.+?)\s+Has\s+Taken\s+A/i)?.[1]?.trim();
    const nameFromTransfer = clean.match(/^(.+?)\s+transferred/i)?.[1]?.trim();
    player = nameFromDeposit || nameFromWithdraw || nameFromTransfer || player;
    const events = [];
    const depositMatch = clean.match(/Deposited\s+(\d+)\s+(.+?)\s+To\s+.+?Inventory/i);
    if (depositMatch) {
        const qty = parseInt(depositMatch[1], 10);
        const item = depositMatch[2].trim().toLowerCase();
        events.push({ transaction_type: 'DEPOSIT', quantity: qty, item_name: item, player_name: player });
    }
    const withdrawMatch = clean.match(/Has\s+Taken\s+A\s+(\d+)\s+(.+?)\s+From\s+.+?Inventory/i);
    if (withdrawMatch) {
        const qty = parseInt(withdrawMatch[1], 10);
        const item = withdrawMatch[2].trim().toLowerCase();
        events.push({ transaction_type: 'WITHDRAW', quantity: qty, item_name: item, player_name: player });
    }
    const transferMatch = clean.match(/transferred\s+(\d+)\s+items\s+from\s+a\s+transport\s+box\s+to\s+container\s+\d+/i);
    if (transferMatch) {
        const jsonArrMatch = clean.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonArrMatch) {
            try {
                const contents = JSON.parse(jsonArrMatch[0]);
                if (Array.isArray(contents)) {
                    for (const it of contents) {
                        const qty = parseInt(it?.count, 10) || 0;
                        const label = (it?.label || it?.name || '').toString().trim().toLowerCase();
                        if (label && qty > 0) {
                            events.push({ transaction_type: 'DEPOSIT', quantity: qty, item_name: label, player_name: player });
                        }
                    }
                }
            } catch (_e) {}
        }
    }
    console.log('events',events);
    return events;
}

async function ensureChannelsTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS bot_channels (
            guild_id VARCHAR(32) NOT NULL,
            purpose VARCHAR(16) NOT NULL,
            channel_id VARCHAR(32) NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (guild_id, purpose)
        )
    `;
    await pool.execute(sql);
}

async function loadChannelConfig() {
    const [rows] = await pool.execute('SELECT guild_id, purpose, channel_id FROM bot_channels');
    channelConfig.clear();
    for (const r of rows || []) {
        const g = r.guild_id;
        const entry = channelConfig.get(g) || {};
        entry[r.purpose] = r.channel_id;
        channelConfig.set(g, entry);
    }
}

async function setChannel(guildId, purpose, channelId) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sql = `
        INSERT INTO bot_channels (guild_id, purpose, channel_id, updated_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), updated_at = VALUES(updated_at)
    `;
    await pool.execute(sql, [String(guildId), purpose, String(channelId), ts]);
    const entry = channelConfig.get(guildId) || {};
    entry[purpose] = String(channelId);
    channelConfig.set(guildId, entry);
}

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
    const items = (rows || []).map(r => `${r.item_name} : ${r.current_stock}`);
    const lines = [];
    for (let i = 0; i < items.length; i += 3) {
        lines.push(items.slice(i, i + 3).join('       '));
    }
    return lines.length ? lines.join('\n') : 'No stock data available.';
}

async function updateLeaderboard(guildId) {
    const conf = channelConfig.get(guildId) || {};
    const channelId = conf.stock;
    if (!channelId) return;
    const rows = await getAllStock();
    const content = formatStock(rows);
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    const existingId = await getStockMessageId(guildId);
    if (existingId) {
        try {
            const msg = await channel.messages.fetch(existingId);
            await msg.edit(content);
            return;
        } catch (_e) {}
    }
    const sent = await channel.send(content);
    await setStockMessageId(guildId, sent.id);
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
