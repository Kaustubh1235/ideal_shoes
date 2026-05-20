import { z } from "zod";

export const LoginEmailInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginEmailInput = z.infer<typeof LoginEmailInput>;

export const RegisterEmailInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
});
export type RegisterEmailInput = z.infer<typeof RegisterEmailInput>;

export const OtpRequestInput = z.object({
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
});
export type OtpRequestInput = z.infer<typeof OtpRequestInput>;

export const OtpVerifyInput = z.object({
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  code: z.string().regex(/^[0-9]{6}$/),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifyInput>;

export const TotpVerifyInput = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
});
