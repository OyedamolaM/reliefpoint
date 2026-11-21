import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createHmac, randomBytes } from "node:crypto";
import { config } from "./config";
import { database } from "./db";
import { AppError, checkDb, requireDb } from "./errors";
import type { StaffRole } from "@/lib/contracts";

export function requestContext(request: Request) {
  const env = config();
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
  const secure = env.APP_ORIGIN.startsWith("https://");
  const setCookie = (name: string, value: string, maxAge = 604800) =>
    headers.append(
      "Set-Cookie",
      serializeCookieHeader(name, value, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge,
      }),
    );
  const auth = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: { httpOnly: true, secure, sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => cookies,
      setAll: (values) => {
        for (const { name, value, options } of values) {
          headers.append(
            "Set-Cookie",
            serializeCookieHeader(name, value, {
              ...options,
              httpOnly: true,
              secure,
              sameSite: "lax",
              path: "/",
            }),
          );
          const existing = cookies.find((c) => c.name === name);
          if (existing) existing.value = value;
          else cookies.push({ name, value });
        }
      },
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
  const cookie = (name: string) => cookies.find((c) => c.name === name)?.value;
  const hash = (value: string) =>
    createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
  let guest = cookie("rp-guest");
  if (!guest || !/^[a-f0-9]{64}$/.test(guest)) {
    guest = randomBytes(32).toString("hex");
    setCookie("rp-guest", guest);
  }
  const clearAuthCookies = () => {
    for (const entry of cookies) if (entry.name.startsWith("sb-")) setCookie(entry.name, "", 0);
  };
  return {
    request,
    headers,
    auth,
    cookie,
    setCookie,
    clearAuthCookies,
    hash,
    guestHash: hash(guest),
    db: database(),
    origin: env.APP_ORIGIN,
  };
}
export type Context = ReturnType<typeof requestContext>;
export type Identity = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: StaffRole[];
  aal: string;
  sessionId: string;
  recovery: boolean;
};
export async function identity(ctx: Context, optional = false): Promise<Identity | null> {
  const {
    data: { user },
    error,
  } = await ctx.auth.auth.getUser();
  if (error || !user) {
    if (optional) return null;
    throw new AppError("SIGN_IN_REQUIRED", "Please sign in to continue.", 401);
  }
  // getUser validates the token with Auth before its session_id/aal claims are read.
  const {
    data: { session },
  } = await ctx.auth.auth.getSession();
  if (!session)
    throw new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401);
  const claims = JSON.parse(
    Buffer.from(session.access_token.split(".")[1]!, "base64url").toString(),
  );
  const sessionId = String(claims.session_id);
  const staff = requireDb(await ctx.db.from("staff_roles").select("role").eq("user_id", user.id));
  const roleList = staff.map((s) => s.role as StaffRole);
  let record = checkDb(
    await ctx.db.from("app_sessions").select("*").eq("id", sessionId).maybeSingle(),
  );
  if (!record) {
    // An old, previously unseen token must not reset the absolute session lifetime.
    const created = new Date(
      session.user.last_sign_in_at
        ? Date.parse(session.user.last_sign_in_at)
        : Number(claims.iat) * 1000,
    ).toISOString();
    record = checkDb(
      await ctx.db
        .from("app_sessions")
        .upsert(
          { id: sessionId, user_id: user.id, created_at: created },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select()
        .maybeSingle(),
    );
    if (!record)
      record = requireDb(
        await ctx.db.from("app_sessions").select("*").eq("id", sessionId).single(),
      );
  }
  const idle = roleList.length ? 15 * 60000 : 30 * 60000;
  const absolute = roleList.length ? 12 * 3600000 : 7 * 86400000;
  if (
    record.revoked ||
    Date.now() - Date.parse(record.last_seen) > idle ||
    Date.now() - Date.parse(record.created_at) > absolute
  ) {
    checkDb(await ctx.db.from("app_sessions").update({ revoked: true }).eq("id", sessionId));
    await ctx.auth.auth.signOut({ scope: "local" });
    throw new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401);
  }
  if (Date.now() - Date.parse(record.last_seen) > 30000)
    checkDb(
      await ctx.db
        .from("app_sessions")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", sessionId),
    );
  const profile = checkDb(
    await ctx.db
      .from("profiles")
      .select("name,phone,sessions_revoked_at")
      .eq("id", user.id)
      .maybeSingle(),
  );
  if (
    profile?.sessions_revoked_at &&
    Date.parse(record.created_at) <= Date.parse(profile.sessions_revoked_at)
  ) {
    await ctx.auth.auth.signOut({ scope: "local" });
    throw new AppError("SESSION_EXPIRED", "Your session has ended. Please sign in again.", 401);
  }
  return {
    id: user.id,
    email: user.email ?? "",
    name: profile?.name || String(user.user_metadata["name"] ?? ""),
    phone: profile?.phone ?? "",
    roles: roleList,
    aal: String(claims.aal),
    sessionId,
    recovery: !!record.recovery,
  };
}
export async function requireStaff(ctx: Context, roles: StaffRole[]): Promise<Identity> {
  const user = (await identity(ctx))!;
  if (!user.roles.some((role) => roles.includes(role)))
    throw new AppError("FORBIDDEN", "You don’t have access to this action.", 403);
  if (user.aal !== "aal2")
    throw new AppError("MFA_REQUIRED", "Verify your authenticator code to continue.", 403);
  return user;
}
export async function rate(
  ctx: Context,
  action: string,
  limit: number,
  seconds: number,
  identifier = "",
) {
  // Vercel overwrites x-vercel-forwarded-for. Local traffic uses a shared conservative bucket.
  const ip = ctx.request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = ctx.hash(`${action}:${ip}:${identifier.toLowerCase()}`);
  const allowed = requireDb(
    await ctx.db.rpc("take_rate", { p_key: key, p_limit: limit, p_seconds: seconds }),
  );
  if (!allowed)
    throw new AppError(
      "TOO_MANY_REQUESTS",
      "You’ve tried a few times. Please wait a little before trying again.",
      429,
      seconds,
    );
}
export async function audit(
  ctx: Context,
  actor: string,
  action: string,
  resource: string,
  resourceId?: string,
) {
  checkDb(
    await ctx.db
      .from("audit_log")
      .insert({ actor, action, resource, resource_id: resourceId ?? null }),
  );
}
