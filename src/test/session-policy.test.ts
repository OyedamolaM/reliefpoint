// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identity, requireStaff, type Context } from "@/server/session";
import { authAction } from "@/server/auth";
import { rememberedMfa } from "@/server/mfa-browser";
import { hourMs } from "@/lib/session-policy";

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
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("session lifetime and remembered MFA", () => {
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
