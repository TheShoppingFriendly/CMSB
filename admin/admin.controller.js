import db from "../db.js";
import { recordAccountingEntry } from "../modules/accounting/accounting.service.js";
import { finance } from "../modules/finance/finance.engine.js";

export async function getClicks(req, res) {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    "SELECT * FROM click_tracking ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );

  res.json(rows);
}

export async function getConversions(req, res) {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    "SELECT * FROM conversions ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );

  

  res.json(rows);
}


export async function approveUserPayout(req, res) {
  try {
    const { wp_user_id, amount, conversion_id } = req.body;

    // 1. First, update your existing balance_logs or conversions
    // [Your existing DB update code here]

    // 2. IMMEDIATELY register it in the Global Ledger
    // This is what makes the Accounting data show up!
 await finance.record({
  action: 'PAYOUT_APPROVED',
  amount,
  wpUserId: wp_user_id,
  adminId: req.user.id,
  entityType: 'CONVERSION',
  entityId: conversion_id,
  note: `Admin approved payout`
});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


