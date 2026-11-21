import { z } from "zod";
import "@tanstack/react-start/server-only";
import { AppError } from "./errors";
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  APP_ORIGIN: z
    .string()
    .url()
    .refine((value) => new URL(value).origin === value),
  SESSION_SECRET: z.string().min(32),
  PAYSTACK_SECRET_KEY: z
    .string()
    .regex(/^sk_(test|live)_[A-Za-z0-9]+$/)
    .optional()
    .or(z.literal("")),
  BREVO_API_KEY: z.string().optional(),
  WORKER_SECRET: z.string().min(32).optional().or(z.literal("")),
});
export function configured() {
  return schema.safeParse(process.env).success;
}
export function config() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "This service isn’t available yet. Please contact our pharmacy team.",
      503,
    );
  if (process.env["NODE_ENV"] === "production" && !result.data.APP_ORIGIN.startsWith("https://"))
    throw new AppError("SERVICE_UNAVAILABLE", "This service is temporarily unavailable.", 503);
  return result.data;
}
