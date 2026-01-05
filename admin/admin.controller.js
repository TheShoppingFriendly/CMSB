import db from "../db.js";
import { recordAccountingEntry } from "../modules/accounting/accounting.service.js";

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
    await recordAccountingEntry({
        type: 'USER_SETTLEMENT', // Layman: Money going out to user
        adminId: req.user.id,    
        userId: wp_user_id,
        convId: conversion_id,
        debit: amount,           // Subtracting from system
        credit: 0,
        note: `Payout approved for User ${wp_user_id}. Order ref: ${conversion_id}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


