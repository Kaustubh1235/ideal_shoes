// Indian financial year runs 1 April -> 31 March.
// FY label format used in invoices: "2025-26".

export function currentFinancialYear(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed; April = 3
  const startYear = m >= 3 ? y : y - 1;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${endYear.toString().padStart(2, "0")}`;
}

export function financialYearStart(fy: string): Date {
  const [yStr] = fy.split("-");
  const y = Number.parseInt(yStr!, 10);
  return new Date(y, 3, 1, 0, 0, 0, 0);
}

export function financialYearEnd(fy: string): Date {
  const [yStr] = fy.split("-");
  const y = Number.parseInt(yStr!, 10);
  return new Date(y + 1, 2, 31, 23, 59, 59, 999);
}

export function isValidFy(fy: string): boolean {
  return /^[0-9]{4}-[0-9]{2}$/.test(fy);
}
