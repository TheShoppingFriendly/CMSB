import db from "../../db.js"; // Ensure path matches your project structure

export const getPublicUserStats = async (req, res) => {
  const { wp_user_id } = req.params;

  try {
    // 1. Get current balance
    const userRes = await db.query("SELECT current_balance FROM users WHERE wp_user_id = $1", [wp_user_id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    
    const totalBalance = parseFloat(userRes.rows[0].current_balance || 0);

    // 2. Calculate Locked (Approved but release date in future)
    const lockedRes = await db.query(
      `SELECT SUM(actual_paid_amount) as locked 
       FROM conversions 
       WHERE payout_status = 'approved' 
       AND release_date > NOW() 
       AND id IN (SELECT c.id FROM conversions c JOIN click_tracking ct ON c.click_id = ct.id WHERE ct.wp_user_id = $1)`,
      [wp_user_id]
    );
    const lockedAmount = parseFloat(lockedRes.rows[0].locked || 0);

    // 3. Calculate Pending (Not yet approved)
    const pendingRes = await db.query(
      `SELECT SUM(payout) as pending 
       FROM conversions 
       WHERE payout_status = 'pending'
       AND id IN (SELECT c.id FROM conversions c JOIN click_tracking ct ON c.click_id = ct.id WHERE ct.wp_user_id = $1)`,
      [wp_user_id]
    );
    const pendingAmount = parseFloat(pendingRes.rows[0].pending || 0);

    const availableBalance = totalBalance - lockedAmount;

    // 4. Get simplified history
    const logs = await db.query(
      "SELECT amount_changed, reason, status, created_at FROM balance_logs WHERE wp_user_id = $1 ORDER BY created_at DESC LIMIT 10",
      [wp_user_id]
    );

    res.json({
      balances: {
        total: totalBalance.toFixed(2),
        locked: lockedAmount.toFixed(2),
        available: availableBalance.toFixed(2),
        pending: pendingAmount.toFixed(2)
      },
      history: logs.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};