    // utils/subid.js
// Generates: CHECK + YYYYMMDD + 8-digit secure random number

export function generateSubId() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;

  // Stronger randomness using crypto
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);

  // Convert to 8 digits
  const randomPart = String(array[0] % 100000000).padStart(8, "0");

  return `CHECK${datePart}${randomPart}`;
}
