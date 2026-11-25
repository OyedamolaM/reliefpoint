// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/server/session", async (original) => {
  const actual = await original<typeof import("@/server/session")>();
  const { AppError } = await import("@/server/errors");
  return {
    ...actual,
    requireStaff: vi.fn(async () => {
      if (!access.allowed) throw new AppError("FORBIDDEN", "Access denied", 403);
      return { id: "owner", roles: ["owner"] };
    }),
    identity: vi.fn(async () => ({ id: "new-customer", sessionId: "invite-session" })),
    rate: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
  };
});
vi.mock("@/server/mfa-browser", () => ({
  revokeRememberedMfa: vi.fn(async () => {}),
  rememberMfa: vi.fn(),
}));
import { inviteCustomer } from "@/server/admin";
import { authCallback } from "@/server/auth";
import { requireStaff } from "@/server/session";
import type { Context } from "@/server/session";
afterEach(() => {
  access.allowed = true;
  vi.clearAllMocks();
});
function context() {
  const invite = vi.fn(async () => ({
    data: { user: { id: "new-customer" } },
    error: null as unknown,
  }));
  const insert = vi.fn(async () => ({ error: null }));
  const upsert = vi.fn(async () => ({ error: null }));
  const updated: unknown[] = [];
  const verifyOtp = vi.fn(async () => ({ error: null as unknown }));
  const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
  const ctx = {
    origin: "https://www.reliefpointpharmacy.com",
    headers: new Headers(),
    request: new Request(
      "https://www.reliefpointpharmacy.com/api/auth/confirm?token_hash=valid-invite-hash&type=invite",
    ),
    db: {
      auth: { admin: { inviteUserByEmail: invite } },
      from: () => ({
        insert,
        upsert,
        update: (value: unknown) => ({
          eq: async () => {
            updated.push(value);
            return { error: null };
          },
        }),
      }),
    },
    auth: {
      auth: {
        verifyOtp,
        exchangeCodeForSession,
        getSession: async () => ({
          data: {
            session: {
              access_token: `header.${Buffer.from(JSON.stringify({ amr: [{ method: "invite" }] })).toString("base64url")}.signature`,
            },
          },
        }),
      },
    },
  } as unknown as Context;
  return { ctx, invite, insert, upsert, verifyOtp, exchangeCodeForSession, updated };
}
describe("customer invitations", () => {
  it("requires staff access before creating an account", async () => {
    access.allowed = false;
    const { ctx, invite } = context();
    await expect(inviteCustomer(ctx, {})).rejects.toMatchObject({ status: 403 });
    expect(invite).not.toHaveBeenCalled();
  });
  it("sends an unconfirmed email invitation without assigning a password or staff role", async () => {
    const { ctx, invite, upsert } = context();
    await inviteCustomer(ctx, {
      name: "New Buyer",
      email: "NEW@example.com",
      phone: "08012345678",
    });
    expect(requireStaff).toHaveBeenCalledWith(ctx, ["owner", "admin", "support"]);
    expect(invite).toHaveBeenCalledWith("new@example.com", {
      data: { name: "New Buyer", phone: "08012345678" },
      redirectTo: "https://www.reliefpointpharmacy.com/api/auth/callback",
    });
    expect(upsert).toHaveBeenCalledWith({
      id: "new-customer",
      name: "New Buyer",
      phone: "08012345678",
    });
  });
  it("reports email-provider failure without claiming the customer was invited", async () => {
    const { ctx, invite, upsert } = context();
    invite.mockResolvedValue({
      data: { user: { id: "new-customer" } },
      error: new Error("Private provider error"),
    });
    await expect(
      inviteCustomer(ctx, { name: "New Buyer", email: "new@example.com", phone: "08012345678" }),
    ).rejects.toMatchObject({ code: "INVITE_FAILED" });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("requires a verified invitation token before allowing initial password setup", async () => {
    const { ctx, verifyOtp, updated } = context();
    const response = await authCallback(ctx);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "valid-invite-hash", type: "invite" });
    expect(updated).toContainEqual({ recovery: true });
    expect(response.headers.get("Location")).toBe(
      "https://www.reliefpointpharmacy.com/account?reset=1",
    );
  });
  it("does not create a password-setup session for an expired invite", async () => {
    const { ctx, verifyOtp, updated } = context();
    verifyOtp.mockResolvedValue({ error: new Error("Expired") });
    await expect(authCallback(ctx)).rejects.toMatchObject({ code: "LINK_EXPIRED" });
    expect(updated).toEqual([]);
  });
});
