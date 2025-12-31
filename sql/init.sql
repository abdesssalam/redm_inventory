CREATE TABLE IF NOT EXISTS inventory_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  transaction_type ENUM('DEPOSIT','WITHDRAW') NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  discord_message_id BIGINT NOT NULL,
  UNIQUE KEY uniq_discord_message_id (discord_message_id),
  INDEX idx_item_time (item_name, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS live_stock (
  item_name VARCHAR(255) NOT NULL,
  current_stock INT NOT NULL DEFAULT 0,
  last_updated DATETIME NOT NULL,
  PRIMARY KEY (item_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_channels (
  guild_id VARCHAR(32) NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (guild_id, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_stock_message (
  guild_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bill_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  amount INT NOT NULL,
  issuer_name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  status ENUM('UNPAID','PAID') NOT NULL,
  discord_message_id BIGINT NOT NULL,
  UNIQUE KEY uniq_bill_discord_message_id (discord_message_id),
  INDEX idx_bill_customer (customer_name),
  INDEX idx_bill_customer_amount (customer_name, amount),
  INDEX idx_bill_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_bill_message (
  guild_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
