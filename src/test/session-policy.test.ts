// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identity, requireStaff, type Context } from "@/server/session";
import { authAction } from "@/server/auth";
import { rememberedMfa } from "@/server/mfa-browser";
import { hourMs } from "@/lib/session-policy";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";

const now = new Date("2026-11-25T12:00:00Z");
const userId = "00000000-0000-4000-8000-000000000001";
const factorId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const at = (hours: number) => new Date(now.getTime() + hours * hourMs).toISOString();
function setup(staff = true, aal = "aal2") {
  const user = {
    id: userId,
    email: "staff@example.com",
    email_confirmed_at: at(-60),
    user_metadata: {},
    factors: [{ id: factorId, factor_type: "totp", status: "verified" }],
  };
  const record = {
    id: sessionId,
    user_id: userId,
    created_at: at(-30),
    last_seen: at(-1),
    revoked: false,
    recovery: false,
  };
  const profile = { name: "Staff", phone: "", sessions_revoked_at: null as string | null };
  const cookies = new Map<string, string>([["rp-mfa", "a".repeat(64)]]);
  const grants: any[] = [
    {
      token_hash: hash("a".repeat(64)),
      user_id: userId,
      factor_id: factorId,
      verified_at: at(-1),
      expires_at: at(23),
    },
  ];
  const updates: unknown[] = [];
  const db = {
    rpc: vi.fn(async () => ({ data: true, error: null })),
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let change: Record<string, unknown> | undefined,
        remove = false;
      const result = () => {
        if (table === "app_sessions") {
          if (change) {
            Object.assign(record, change);
            updates.push(change);
          }
          return record;
        }
        if (table === "profiles") {
          if (change) Object.assign(profile, change);
          return profile;
        }
        if (table === "staff_roles") return staff ? [{ role: "admin" }] : [];
        if (table === "mfa_browser_grants") {
          const matches = (grant: any) => filters.every(([key, value]) => grant[key] === value);
          if (remove) {
            for (let i = grants.length - 1; i >= 0; i--)
              if (matches(grants[i])) grants.splice(i, 1);
            return null;
          }
          return grants.find(matches) ?? null;
        }
        return null;
      };
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return q;
        },
        update: (value: Record<string, unknown>) => {
          change = value;
          return q;
        },
        insert: (value: unknown) => {
          grants.push(value);
          return q;
        },
        delete: () => {
          remove = true;
          return q;
        },
        maybeSingle: async () => ({ data: result(), error: null }),
        single: async () => ({ data: result(), error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: result(), error: null }),
      };
      return q;
    },
  };
  const auth = {
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    getSession: vi.fn(async () => ({
      data: {
        session: {
          access_token: `header.${Buffer.from(JSON.stringify({ session_id: sessionId, aal })).toString("base64url")}.signature`,
          user,
        },
      },
    })),
    signOut: vi.fn(async () => ({ error: null })),
    mfa: {
      challengeAndVerify: vi.fn(async () => ({ error: null as null | { message: string } })),
      listFactors: vi.fn(async () => ({
        data: { totp: user.factors, all: user.factors },
        error: null,
      })),
      enroll: vi.fn(),
      unenroll: vi.fn(),
    },
  };
  const ctx = {
    auth: { auth },
    db,
    cookie: (name: string) => cookies.get(name),
    setCookie: vi.fn((name: string, value: string) => cookies.set(name, value)),
    hash,
    clearAuthCookies: vi.fn(),
    request: new Request("https://example.com/api/auth/session"),
  } as unknown as Context;
  return { ctx, auth, user, record, profile, grants, cookies, updates };
}
beforeEach(() => {
  vi.stubEnv("SUPPORT_USER_ID", "");
  vi.stubEnv("SUPPORT_EMAIL", "");
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("session lifetime and remembered MFA", () => {
  it("restores owner access for the configured verified account only after MFA", async () => {
    const { ctx, grants } = setup(false, "aal1");
    vi.stubEnv("SUPPORT_USER_ID", userId);
    vi.stubEnv("SUPPORT_EMAIL", "staff@example.com");
    expect(await requireStaff(ctx, ["owner", "admin"])).toMatchObject({
      roles: ["owner"],
      environmentSupport: true,
    });
    expect(ctx.db.rpc).toHaveBeenCalledWith("recover_owner_access", {
      p_user: userId,
      p_email: "staff@example.com",
      p_session: sessionId,
      p_mfa_hash: hash("a".repeat(64)),
    });
    vi.mocked(ctx.db.rpc).mockClear();
    grants.length = 0;
    await expect(requireStaff(ctx, ["owner"])).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    expect(ctx.db.rpc).not.toHaveBeenCalled();
    vi.stubEnv("SUPPORT_EMAIL", "");
    expect(await identity(ctx)).toMatchObject({ roles: [], environmentSupport: false });
  });
  it("does not restore owner access in a password recovery session", async () => {
    const { ctx, record } = setup(false);
    vi.stubEnv("SUPPORT_USER_ID", userId);
    vi.stubEnv("SUPPORT_EMAIL", "staff@example.com");
    record.recovery = true;
    await expect(requireStaff(ctx, ["owner"])).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    expect(ctx.db.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when the database cannot restore and audit owner access", async () => {
    const { ctx } = setup(false);
    vi.stubEnv("SUPPORT_USER_ID", userId);
    vi.stubEnv("SUPPORT_EMAIL", "staff@example.com");
    vi.mocked(ctx.db.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    } as any);
    await expect(requireStaff(ctx, ["owner"])).rejects.toMatchObject({ code: "DATA_UNAVAILABLE" });
  });
  it.each([500, 503, 429])(
    "does not mistake a provider failure (%s) for signed out",
    async (status) => {
      const { ctx, auth } = setup();
      vi.spyOn(ctx.auth.auth, "getUser").mockResolvedValueOnce({
        data: { user: null },
        error: new AuthApiError("Private provider message", status, undefined),
      });
      await expect(identity(ctx, true)).rejects.toMatchObject({
        code: "AUTH_UNAVAILABLE",
        status: 503,
      });
      expect(auth.signOut).not.toHaveBeenCalled();
    },
  );
  it("preserves the session when a token refresh has a temporary network failure", async () => {
    const { ctx, auth } = setup();
    vi.spyOn(ctx.auth.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError("Network interrupted", 0),
    });
    await expect(identity(ctx)).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE", status: 503 });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("still treats missing and revoked credentials as signed out", async () => {
    const { ctx } = setup();
    vi.spyOn(ctx.auth.auth, "getUser").mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    expect(await identity(ctx, true)).toBeNull();
    await expect(identity(ctx)).rejects.toMatchObject({ status: 401 });
  });
  it.each(["bad_jwt", "user_banned", "session_not_found"])(
    "still rejects invalid credentials (%s)",
    async (code) => {
      const { ctx } = setup();
      vi.spyOn(ctx.auth.auth, "getUser").mockResolvedValue({
        data: { user: null },
        error: new AuthApiError("Rejected", 403, code),
      });
      expect(await identity(ctx, true)).toBeNull();
      await expect(identity(ctx)).rejects.toMatchObject({ status: 401 });
    },
  );
  it("accepts remembered verification after a new password sign-in without rewriting assurance claims", async () => {
    const { ctx } = setup(true, "aal1");
    expect(await requireStaff(ctx, ["admin"])).toMatchObject({ aal: "aal1", mfaVerified: true });
  });
  it.each([
    [true, 24],
    [false, 72],
  ] as const)("enforces the requested inactivity boundary (staff %s)", async (staff, hours) => {
    const { ctx, record, auth } = setup(staff);
    record.last_seen = at(-hours + 0.001);
    expect(await identity(ctx)).toMatchObject({ id: userId });
    record.last_seen = at(-hours);
    await expect(identity(ctx)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(record.revoked).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("keeps a seven-day absolute cap while allowing active staff beyond twelve hours", async () => {
    const { ctx, record } = setup();
    expect(await requireStaff(ctx, ["admin"])).toMatchObject({ mfaVerified: true });
    record.created_at = at(-7 * 24);
    await expect(identity(ctx)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("does not slide MFA expiry during activity or trust aal2 after the grant expires", async () => {
    const { ctx, grants } = setup();
    const expires = grants[0].expires_at;
    await identity(ctx);
    await identity(ctx);
    expect(grants[0].expires_at).toBe(expires);
    grants[0].expires_at = now.toISOString();
    expect(await identity(ctx)).toMatchObject({ aal: "aal2", mfaVerified: false });
    await expect(requireStaff(ctx, ["admin"])).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
  it("rejects a missing, tampered, other-user or removed-factor browser grant", async () => {
    const { ctx, user, cookies, grants } = setup();
    cookies.delete("rp-mfa");
    expect(await rememberedMfa(ctx, user as any)).toBeNull();
    cookies.set("rp-mfa", "b".repeat(64));
    expect(await rememberedMfa(ctx, user as any)).toBeNull();
    cookies.set("rp-mfa", "a".repeat(64));
    grants[0].user_id = "another-user";
    expect(await rememberedMfa(ctx, user as any)).toBeNull();
    grants[0].user_id = userId;
    user.factors = [];
    expect(await rememberedMfa(ctx, user as any)).toBeNull();
  });
  it("revokes trust after global session revocation and refuses recovery-session access", async () => {
    const { ctx, profile, record } = setup();
    profile.sessions_revoked_at = at(-0.5);
    record.created_at = at(-0.25);
    expect(await identity(ctx)).toMatchObject({ mfaVerified: false });
    profile.sessions_revoked_at = null;
    record.recovery = true;
    await expect(requireStaff(ctx, ["admin"])).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
  it("creates only a hashed, 24-hour grant after a successful provider challenge", async () => {
    const { ctx, grants, cookies } = setup();
    grants.length = 0;
    const result = await authAction(ctx, "mfa-verify", { id: factorId, code: "123456" });
    expect(result).toMatchObject({ user: { mfaVerified: true, mfaExpiresAt: at(24) } });
    expect(grants[0].token_hash).toBe(hash(cookies.get("rp-mfa")!));
    expect(grants[0].token_hash).not.toBe(cookies.get("rp-mfa"));
    expect(ctx.setCookie).toHaveBeenCalledWith("rp-mfa", expect.any(String), 86400);
  });
  it("never remembers a failed code or creates a second enrolled authenticator", async () => {
    const { ctx, auth, grants } = setup();
    grants.length = 0;
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: { message: "Invalid" } });
    await expect(
      authAction(ctx, "mfa-verify", { id: factorId, code: "123456" }),
    ).rejects.toMatchObject({ code: "MFA_INVALID" });
    expect(grants).toHaveLength(0);
    await expect(authAction(ctx, "mfa-enroll", {})).rejects.toMatchObject({
      code: "MFA_ALREADY_ENROLLED",
    });
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });
  it("clears all remembered browsers on sign-out-all, but retains them for ordinary sign-out", async () => {
    const current = setup();
    await authAction(current.ctx, "signout", {});
    expect(current.grants).toHaveLength(1);
    const all = setup();
    await authAction(all.ctx, "signout-all", {});
    expect(all.grants).toHaveLength(0);
    expect(all.ctx.setCookie).toHaveBeenCalledWith("rp-mfa", "", 0);
  });
});
