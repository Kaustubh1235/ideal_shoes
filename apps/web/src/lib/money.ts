/** Format a paise amount (integer) as Indian-grouped INR string. */
export function inr(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function rupeesOnly(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}
