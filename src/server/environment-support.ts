import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
const support = z.object({
  SUPPORT_USER_ID: z.string().trim().uuid(),
  SUPPORT_EMAIL: z.string().trim().email(),
});
export function isEnvironmentSupport(user: Pick<User, "id" | "email" | "email_confirmed_at">) {
  const configured = support.safeParse(process.env);
  return (
    configured.success &&
    !!user.email_confirmed_at &&
    user.id === configured.data.SUPPORT_USER_ID &&
    user.email?.trim().toLowerCase() === configured.data.SUPPORT_EMAIL.toLowerCase()
  );
}
