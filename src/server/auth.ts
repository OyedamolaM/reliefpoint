import { z } from "zod";
import { AppError, checkDb } from "./errors";
import { identity, rate, audit, type Context } from "./session";
import { rememberMfa, revokeRememberedMfa } from "./mfa-browser";
const credentials = z.object({
  email: z.string().email().max(180),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().optional(),
  accepted_terms: z.boolean().optional(),
});
export async function authAction(ctx: Context, action: string, body: unknown) {
  if (action === "session") return { user: await identity(ctx, true) };
  if (action === "signin" || action === "signup") {
    const input = credentials.parse(body);
    await rate(ctx, "auth-ip", 20, 900);
    await rate(ctx, "auth", 5, 900, input.email);
    if (action === "signup") {
      if (!input.accepted_terms)
        throw new AppError(
          "TERMS_REQUIRED",
          "Please agree to the Terms and Conditions before signing up.",
        );
      const phone = z
        .string()
        .regex(/^(?:0|\+?234)[789][0-9]{9}$/, "Enter a valid phone number.")
        .parse(input.phone);
      const { error } = await ctx.auth.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            name: input.name ?? "",
            phone,
            terms_version: "2026-11-26",
            terms_accepted_at: new Date().toISOString(),
          },
          emailRedirectTo: `${ctx.origin}/api/auth/callback`,
        },
      });
      if (error)
        throw new AppError(
          "REGISTER_FAILED",
          "We couldn’t register this account. Check your details or try signing in.",
        );
      return { message: "Check your email to verify your account before signing in." };
    }
    const { error } = await ctx.auth.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error)
      throw new AppError(
        "SIGN_IN_FAILED",
        "We couldn’t sign you in. Check your email and password, and make sure your email is verified.",
        401,
      );
    return { user: await identity(ctx) };
  }
  if (action === "reset") {
    const { email } = z.object({ email: z.string().email() }).parse(body);
    await rate(ctx, "reset-ip", 10, 3600);
    await rate(ctx, "reset", 3, 3600, email);
    const { error } = await ctx.auth.auth.resetPasswordForEmail(email, {
      redirectTo: `${ctx.origin}/api/auth/callback?recovery=1`,
    });
    if (error)
      throw new AppError(
        "EMAIL_UNAVAILABLE",
        "We couldn’t send this email right now. Please try again later.",
        503,
      );
    return { message: "If an account matches this email, you’ll receive a password reset link." };
  }
  if (action === "resend") {
    const { email } = z.object({ email: z.string().email() }).parse(body);
    await rate(ctx, "resend-ip", 10, 3600);
    await rate(ctx, "resend", 3, 3600, email);
    const { error } = await ctx.auth.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${ctx.origin}/api/auth/callback` },
    });
    if (error)
      throw new AppError(
        "EMAIL_UNAVAILABLE",
        "We couldn’t send this email right now. Please try again later.",
        503,
      );
    return { message: "If your account needs verification, you’ll receive a new email." };
  }
  if (action === "signout" || action === "signout-all") {
    try {
      const user = (await identity(ctx))!;

      if (action === "signout-all") {
        checkDb(
          await ctx.db
            .from("profiles")
            .update({ sessions_revoked_at: new Date().toISOString() })
            .eq("id", user.id),
        );
        await revokeRememberedMfa(ctx, user.id);
      }
      checkDb(
        await ctx.db
          .from("app_sessions")
          .update({ revoked: true })
          .eq(
            action === "signout-all" ? "user_id" : "id",
            action === "signout-all" ? user.id : user.sessionId,
          ),
      );
      const { error } = await ctx.auth.auth.signOut({
        scope: action === "signout-all" ? "global" : "local",
      });
      if (error)
        throw new AppError(
          "SIGN_OUT_FAILED",
          "Your account access has been closed. Please refresh the page.",
          503,
        );
      return { message: "You’ve been signed out." };
    } finally {
      ctx.clearAuthCookies();
    }
  }
  const user = (await identity(ctx))!;
  if (action === "password") {
    const { password, current_password } = z
      .object({ password: z.string().min(10).max(128), current_password: z.string().optional() })
      .parse(body);
    await rate(ctx, "password", 5, 900, user.id);
    if (!user.recovery) {
      if (!current_password)
        throw new AppError(
          "CURRENT_PASSWORD_REQUIRED",
          "Enter your current password to make this change.",
        );
      const { error } = await ctx.auth.auth.signInWithPassword({
        email: user.email,
        password: current_password,
      });
      if (error) throw new AppError("PASSWORD_INCORRECT", "Your current password doesn’t match.");
    }
    const { error } = await ctx.auth.auth.updateUser({ password });
    if (error)
      throw new AppError(
        "PASSWORD_FAILED",
        "We couldn’t update your password. Try a different password.",
      );
    checkDb(
      await ctx.db
        .from("app_sessions")
        .update({ recovery: false, revoked: true })
        .eq("user_id", user.id),
    );
    checkDb(
      await ctx.db
        .from("profiles")
        .update({ sessions_revoked_at: new Date().toISOString() })
        .eq("id", user.id),
    );
    await revokeRememberedMfa(ctx, user.id);
    await ctx.auth.auth.signOut({ scope: "global" });
    return { message: "Your password has been updated. Please sign in again." };
  }
  if (action === "mfa-enroll") {
    await rate(ctx, "mfa-enroll", 5, 900, user.id);
    const { data: factors, error: factorsError } = await ctx.auth.auth.mfa.listFactors();
    if (factorsError)
      throw new AppError("MFA_FAILED", "We couldn’t load your authenticator. Please try again.");
    if (factors?.totp.some((factor) => factor.status === "verified"))
      throw new AppError(
        "MFA_ALREADY_ENROLLED",
        "Your authenticator is already set up. Enter its current code to continue.",
      );
    for (const factor of factors?.all ?? [])
      if (factor.status === "unverified") await ctx.auth.auth.mfa.unenroll({ factorId: factor.id });
    const { data, error } = await ctx.auth.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "ReliefPoint staff",
    });
    if (error)
      throw new AppError("MFA_FAILED", "We couldn’t set up your authenticator. Please try again.");
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }
  if (action === "mfa-factors") {
    const { data, error } = await ctx.auth.auth.mfa.listFactors();
    if (error)
      throw new AppError(
        "MFA_FAILED",
        "We couldn’t load your security settings. Please try again.",
      );
    return {
      factors: data.totp
        .filter((f) => f.status === "verified")
        .map((f) => ({ id: f.id, name: f.friendly_name })),
    };
  }
  if (action === "mfa-verify") {
    if (user.recovery)
      throw new AppError(
        "PASSWORD_RESET_REQUIRED",
        "Finish resetting your password, then sign in to verify your authenticator.",
      );
    const input = z
      .object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) })
      .parse(body);
    await rate(ctx, "mfa", 5, 900, user.id);
    const { error } = await ctx.auth.auth.mfa.challengeAndVerify({
      factorId: input.id,
      code: input.code,
    });
    if (error)
      throw new AppError(
        "MFA_INVALID",
        "That code didn’t work. Enter the current code from your authenticator.",
      );
    if (user.environmentSupport)
      await audit(ctx, user.id, "environment_recovery_verified", "owner_recovery", user.id);
    await rememberMfa(ctx, user.id, input.id);
    return { user: await identity(ctx), message: "Your identity has been verified." };
  }
  throw new AppError("NOT_FOUND", "This action isn’t available.", 404);
}
export async function authCallback(ctx: Context) {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const isRecovery = !!hash && url.searchParams.get("type") === "recovery";
  const isInvite = !!hash && url.searchParams.get("type") === "invite";
  if (!code && !isRecovery && !isInvite)
    throw new AppError("LINK_INVALID", "This link is incomplete. Please request a new one.");
  const { error } =
    isRecovery || isInvite
      ? await ctx.auth.auth.verifyOtp({ token_hash: hash!, type: isInvite ? "invite" : "recovery" })
      : await ctx.auth.auth.exchangeCodeForSession(code!);
  if (error)
    throw new AppError(
      "LINK_EXPIRED",
      "This link has expired or was already used. Please request a new one.",
    );
  const user = (await identity(ctx))!;
  // Only mark recovery when Auth confirms a recovery authentication method.
  const {
    data: { session },
  } = await ctx.auth.auth.getSession();
  const claims = JSON.parse(
    Buffer.from(session!.access_token.split(".")[1]!, "base64url").toString(),
  );
  const recovery =
    isRecovery ||
    isInvite ||
    (Array.isArray(claims.amr) &&
      claims.amr.some((m: { method: string }) => m.method === "recovery"));
  if (recovery) {
    checkDb(await ctx.db.from("app_sessions").update({ recovery: true }).eq("id", user.sessionId));
    await revokeRememberedMfa(ctx, user.id);
  }
  ctx.headers.set("Location", `${ctx.origin}/account${recovery ? "?reset=1" : ""}`);
  return new Response(null, { status: 303, headers: ctx.headers });
}
