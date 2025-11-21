// utils/clickid.js
// Generates: CHECK + YYYYMMDD + 8-digit secure random number

import crypto from "crypto";

export function generateClickId() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;

  // Secure random 4 bytes -> convert to 8-digit number
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = randomBytes.readUInt32BE(0) % 100000000;
  const randomPart = String(randomNumber).padStart(8, "0");

  return `CHECK${datePart}${randomPart}`;
}
