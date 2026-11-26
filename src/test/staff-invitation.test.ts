// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
const access = vi.hoisted(() => ({ roles: ["admin"] as string[] }));
vi.mock("@/server/session", () => ({
  requireStaff: vi.fn(async (_ctx: unknown, allowed: string[]) => {
    if (!access.roles.some((role) => allowed.includes(role)))
      throw new AppError("FORBIDDEN", "Access denied", 403);
    return { id: "actor", roles: access.roles, mfaVerified: true };
  }),
  rate: vi.fn(async () => {}),
  audit: vi.fn(),
}));
import { inviteStaff } from "@/server/admin";
import type { Context } from "@/server/session";
afterEach(() => {
  access.roles = ["admin"];
  vi.clearAllMocks();
});
const input = { name: "New Administrator", email: "admin@example.com", role: "admin" };
function context(existing: { id: string; verified: boolean } | null = null) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "staff_account_by_email" ? existing : null,
    error: null as unknown,
  }));
  const invite = vi.fn(async () => ({ data: { user: { id: "invited" } }, error: null as unknown }));
  return {
    ctx: {
      origin: "https://www.reliefpointpharmacy.com",
      db: { rpc, auth: { admin: { inviteUserByEmail: invite } } },
    } as unknown as Context,
    rpc,
    invite,
  };
}
describe("staff invitations", () => {
  it("invites a new admin without setting a password or confirming their email", async () => {
    const { ctx, rpc, invite } = context();
    await inviteStaff(ctx, input);
    expect(invite).toHaveBeenCalledWith(input.email, {
      data: { name: input.name },
      redirectTo: "https://www.reliefpointpharmacy.com/api/auth/callback",
    });
    expect(rpc).toHaveBeenCalledWith("manage_staff_role", {
      p_actor: "actor",
      p_user: "invited",
      p_role: "admin",
      p_remove: false,
    });
  });
  it("grants an existing verified customer access without changing their credentials", async () => {
    const { ctx, rpc, invite } = context({ id: "existing", verified: true });
    await inviteStaff(ctx, input);
    expect(invite).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "manage_staff_role",
      expect.objectContaining({ p_user: "existing", p_role: "admin" }),
    );
  });
  it("requires existing accounts to verify their email first", async () => {
    const { ctx, rpc, invite } = context({ id: "existing", verified: false });
    await expect(inviteStaff(ctx, input)).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(invite).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not let an admin invite an owner", async () => {
    const { ctx, rpc, invite } = context();
    await expect(inviteStaff(ctx, { ...input, role: "owner" })).rejects.toMatchObject({
      code: "OWNER_REQUIRED",
      status: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(invite).not.toHaveBeenCalled();
  });
  it("does not let support staff grant access", async () => {
    access.roles = ["support"];
    const { ctx, invite } = context();
    await expect(inviteStaff(ctx, input)).rejects.toMatchObject({ status: 403 });
    expect(invite).not.toHaveBeenCalled();
  });
  it("reports partial setup honestly if the email was sent but the role was not granted", async () => {
    const { ctx, rpc } = context();
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("DB error") });
    await expect(inviteStaff(ctx, input)).rejects.toMatchObject({ code: "STAFF_ACCESS_PENDING" });
  });
});
