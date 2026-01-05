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


await recordAccountingEntry({
    type: 'USER_SETTLEMENT',
    adminId: req.admin.id, // Who approved it
    userId: wp_user_id,
    convId: conversion_id,
    debit: amount, // Money owed to user
    note: "Settlement approved via Admin Panel"
});