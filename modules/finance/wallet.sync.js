async function syncWallet(client, wpUserId, bucket) {
  if (!bucket) return;

  let column;
  let category;

  switch (bucket) {
    case 'affiliate':
      column = 'affiliate_balance';
      category = 'REVENUE';
      break;
    case 'referral':
      column = 'referral_balance';
      category = 'REVENUE';
      break;
    case 'reward':
      column = 'reward_cash_balance';
      category = 'INTERNAL';
      break;
    default:
      return;
  }

  const { rows } = await client.query(`
    SELECT COALESCE(SUM(credit - debit), 0) AS balance
    FROM global_finance_ledger
    WHERE wp_user_id = $1
    AND finance_category = $2
  `, [wpUserId, category]);

  await client.query(`
    UPDATE user_wallets
    SET ${column} = $1,
        updated_at = now()
    WHERE wp_user_id = $2
  `, [rows[0].balance, wpUserId]);
}

module.exports = { syncWallet };
