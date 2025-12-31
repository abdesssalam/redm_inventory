module.exports = function createInventoryRepository(pool) {
  async function logTransaction(type, qty, item, player, timestamp, msgId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const logQuery = `
        INSERT INTO inventory_logs (timestamp, item_name, quantity, transaction_type, player_name, discord_message_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE id=id;
      `;
      await connection.execute(logQuery, [timestamp, item, qty, type, player, msgId]);
      const stockChange = type === 'DEPOSIT' ? qty : -qty;
      const stockQuery = `
        INSERT INTO live_stock (item_name, current_stock, last_updated)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          current_stock = current_stock + ?, 
          last_updated = ?;
      `;
      await connection.execute(stockQuery, [item, stockChange, timestamp, stockChange, timestamp]);
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
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
  return { logTransaction, getItemStock, getAllStock };
}
