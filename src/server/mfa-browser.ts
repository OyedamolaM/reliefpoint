import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { mfaRememberMs } from "@/lib/session-policy";
import type { Context } from "./session";
import { checkDb, requireDb } from "./errors";

export const verifiedTotp = (user: User) =>
  (user.factors ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
const cookieName = "rp-mfa";
export async function rememberedMfa(ctx: Context, user: User, revokedAt?: string | null) {
  const token = ctx.cookie(cookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const grant = checkDb(
    await ctx.db
      .from("mfa_browser_grants")
      .select("factor_id,verified_at,expires_at")
      .eq("token_hash", ctx.hash(token))
      .eq("user_id", user.id)
      .maybeSingle(),
  );
  if (!grant) return null;
  const verified = Date.parse(grant.verified_at),
    expires = Date.parse(grant.expires_at);
  if (
    !Number.isFinite(verified) ||
    !Number.isFinite(expires) ||
    verified > Date.now() ||
    expires <= Date.now() ||
    expires > verified + mfaRememberMs ||
    (revokedAt && verified <= Date.parse(revokedAt)) ||
    !verifiedTotp(user).some((factor) => factor.id === grant.factor_id)
  )
    return null;
  return new Date(expires).toISOString();
}
export async function rememberMfa(ctx: Context, userId: string, factorId: string) {
  // Called only after challengeAndVerify succeeds. Never derive new trust from aal2 alone.
  const token = randomBytes(32).toString("hex");
  const verified = new Date();
  requireDb(
    await ctx.db
      .from("mfa_browser_grants")
      .insert({
        token_hash: ctx.hash(token),
        user_id: userId,
        factor_id: factorId,
        verified_at: verified.toISOString(),
        expires_at: new Date(verified.getTime() + mfaRememberMs).toISOString(),
      })
      .select("expires_at")
      .single(),
  );
  ctx.setCookie(cookieName, token, mfaRememberMs / 1000);
}
export async function revokeRememberedMfa(ctx: Context, userId: string) {
  checkDb(await ctx.db.from("mfa_browser_grants").delete().eq("user_id", userId));
  ctx.setCookie(cookieName, "", 0);
}
