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

    // Your existing logic to update payout status here...

    // NOW call the accounting record inside this function
    await recordAccountingEntry({
        type: 'USER_SETTLEMENT',
        adminId: req.user.id, // Reference from auth middleware
        userId: wp_user_id,
        convId: conversion_id,
        debit: amount, 
        note: "Settlement approved via Admin Panel"
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


