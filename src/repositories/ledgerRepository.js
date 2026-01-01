module.exports = function createLedgerRepository(pool, businessName) {
  async function logLedgerTransaction(action, amount, player, business, timestamp, msgId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const effectiveBusiness = businessName || business;
      const logSql = `
        INSERT INTO ledger_logs (timestamp, amount, action, player_name, business_name, discord_message_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE id=id
      `;
      await connection.execute(logSql, [timestamp, amount, action, player, effectiveBusiness, msgId]);
      const delta = action === 'DEPOSIT' ? amount : -amount;
      const balSql = `
        INSERT INTO business_ledger (business_name, current_balance, last_updated)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          current_balance = current_balance + VALUES(current_balance),
          last_updated = VALUES(last_updated)
      `;
      await connection.execute(balSql, [effectiveBusiness, delta, timestamp]);
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  async function getLedgerSummary() {
    const sql = `
      SELECT 
        bl.business_name,
        bl.current_balance,
        COALESCE((
          SELECT SUM(CASE WHEN ll.action='DEPOSIT' THEN ll.amount ELSE -ll.amount END)
          FROM ledger_logs ll
          WHERE ll.business_name = bl.business_name
            AND DATE(ll.timestamp) = CURDATE()
        ), 0) AS today_balance,
        COALESCE((
          SELECT SUM(CASE WHEN ll.action='DEPOSIT' THEN ll.amount ELSE -ll.amount END)
          FROM ledger_logs ll
          WHERE ll.business_name = bl.business_name
            AND YEARWEEK(ll.timestamp, 3) = YEARWEEK(CURDATE(), 3)
        ), 0) AS week_balance,
        COALESCE((
          SELECT SUM(CASE WHEN ll.action='DEPOSIT' THEN ll.amount ELSE -ll.amount END)
          FROM ledger_logs ll
          WHERE ll.business_name = bl.business_name
            AND YEAR(ll.timestamp) = YEAR(CURDATE())
            AND MONTH(ll.timestamp) = MONTH(CURDATE())
        ), 0) AS month_balance
      FROM business_ledger bl
      WHERE bl.business_name = ?
    `;
    const [rows] = await pool.execute(sql, [businessName]);
    return rows || [];
  }
  async function updateBalance(amount, timestamp) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const balSql = `
        INSERT INTO business_ledger (business_name, current_balance, last_updated)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          current_balance = current_balance + VALUES(current_balance),
          last_updated = VALUES(last_updated)
      `;
      await connection.execute(balSql, [businessName, amount, timestamp]);
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  return { logLedgerTransaction, getLedgerSummary, updateBalance };
}
