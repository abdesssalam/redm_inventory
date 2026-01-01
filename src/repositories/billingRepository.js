module.exports = function createBillingRepository(pool) {
  async function logBillIssue(amount, issuer, customer, timestamp, msgId) {
    const sql = `
      INSERT INTO bill_logs (timestamp, amount, issuer_name, customer_name, status, discord_message_id)
      VALUES (?, ?, ?, ?, 'UNPAID', ?)
      ON DUPLICATE KEY UPDATE id=id
    `;
    console.log(sql);
    await pool.execute(sql, [timestamp, amount, issuer, customer, msgId]);
  }
  async function logBillPayment(amount, issuer, customer, timestamp, msgId) {
    const updateSql = `
      UPDATE bill_logs
      SET status='PAID'
      WHERE status='UNPAID' AND customer_name=? AND amount=?
      ORDER BY timestamp ASC
      LIMIT 1
    `;
    const [res] = await pool.execute(updateSql, [customer, amount]);
    if (!res || res.affectedRows === 0) {
      const insertSql = `
        INSERT INTO bill_logs (timestamp, amount, issuer_name, customer_name, status, discord_message_id)
        VALUES (?, ?, ?, ?, 'PAID', ?)
        ON DUPLICATE KEY UPDATE id=id
      `;
      await pool.execute(insertSql, [timestamp, amount, issuer, customer, msgId]);
    }
  }
  async function getBillSummaryByCustomer() {
    const sql = `
      SELECT customer_name,
             SUM(status='PAID') AS paid_count,
             SUM(status='UNPAID') AS unpaid_count,
             SUM(CASE WHEN status='UNPAID' THEN amount ELSE 0 END) AS unpaid_total
      FROM bill_logs
      GROUP BY customer_name
      ORDER BY customer_name ASC
    `;
    const [rows] = await pool.execute(sql);
    return rows || [];
  }
  return { logBillIssue, logBillPayment, getBillSummaryByCustomer };
}
