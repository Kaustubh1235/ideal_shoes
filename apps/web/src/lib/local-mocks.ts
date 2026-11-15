/**
 * Test helpers for running the whole stack on one laptop: a "Pay (test)" button instead of Razorpay
 * and the admin's sign-in code on the login page. Both need LOCAL_MOCKS=true *and* a localhost
 * address, so a real server can never show them (scripts/preflight.sh also refuses LOCAL_MOCKS).
 */
export function localMocks(): boolean {
  if (process.env.LOCAL_MOCKS !== "true") return false;
  try {
    const host = new URL(process.env.AUTH_URL ?? "").hostname;
    return host === "localhost" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}
