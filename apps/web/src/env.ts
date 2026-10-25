import { z } from "zod";

// `next build` imports every route to collect page data, with no runtime secrets present (Docker
// builds must not carry them). Placeholders cover that phase only; a running server still validates.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const source = isBuild
  ? { DATABASE_URL: "postgresql://build:build@localhost:5432/build", AUTH_SECRET: "build-phase-placeholder-secret", ...process.env }
  : process.env;

const env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default("redis://redis:6379/0"),
    AUTH_SECRET: z.string().min(16),
    AUTH_URL: z.string().url().default("http://localhost:3000"),
    API_URL: z.string().url().default("http://localhost:8000"),
    INTERNAL_API_URL: z.string().url().default("http://api:8000"),
    JWT_AUDIENCE: z.string().default("bharatboot"),
    JWT_ISSUER: z.string().default("bharatboot-auth"),
    RAZORPAY_KEY_ID: z.string().default(""),
    RAZORPAY_KEY_SECRET: z.string().default(""),
    MSG91_AUTH_KEY: z.string().default(""),
    MSG91_SENDER_ID: z.string().default("BHRTBT"),
    MSG91_TEMPLATE_OTP: z.string().default(""),
    OTP_DEV_MODE: z.string().default("true"),
    S3_PUBLIC_ENDPOINT: z.string().default("http://localhost:9000"),
    S3_BUCKET: z.string().default("bharatboot"),
    ADMIN_IP_ALLOWLIST: z.string().default(""),
    ADMIN_TOTP_ISSUER: z.string().default("BharatBoot"),
    NEXT_PUBLIC_HERO_IMAGE_URL: z.string().default(""),
    INVENTORY_APP_URL: z.string().default(""),
  })
  .parse(source);

export default env;
