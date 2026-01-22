module.exports = {
  CONVERSION_RECORDED: {
    category: 'REVENUE',
    wallet: 'affiliate'
  },
  REFERRAL_EARNED: {
    category: 'REVENUE',
    wallet: 'referral'
  },
  PAYOUT_REQUESTED: {
    category: 'LIABILITY',
    wallet: null
  },
  PAYOUT_APPROVED: {
    category: 'LIABILITY',
    wallet: null
  },
  PAYOUT_PAID: {
    category: 'EXPENSE',
    wallet: 'affiliate'
  },
  ADJUSTMENT: {
    category: 'INTERNAL',
    wallet: 'affiliate'
  }
};
