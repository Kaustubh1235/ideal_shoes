import { z } from "zod";

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
  })
  .parse(process.env);

export default env;
