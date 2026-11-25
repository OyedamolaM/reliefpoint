// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/server/session", () => ({
  requireStaff: vi.fn(async () => {
    if (!access.allowed) throw new AppError("FORBIDDEN", "Access denied", 403);
    return { id: "admin" };
  }),
}));
import { adminList } from "@/server/admin";
import type { Context } from "@/server/session";
afterEach(() => {
  access.allowed = true;
  vi.clearAllMocks();
});
function context(
  rows = [
    { user_id: "first", role: "admin" },
    { user_id: "second", role: "admin" },
    { user_id: "first", role: "pharmacist" },
  ],
) {
  const accounts = vi.fn(async (id: string) => ({
    data: {
      user: {
        id,
        email: `${id}@example.com`,
        user_metadata: { name: `Auth ${id}`, private: "hidden-metadata" },
        app_metadata: { private: "secret" },
      },
    },
    error: null,
  }));
  const profiles = vi.fn(async () => ({
    data: [{ id: "first", name: "First Administrator", phone: "08012345678" }],
    error: null,
  }));
  const q: any = {
    select: () => q,
    order: () => q,
    range: () => q,
    returns: () => q,
    then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
  };
  const from = vi.fn((table: string) =>
    table === "staff_roles" ? q : { select: () => ({ in: profiles }) },
  );
  return {
    ctx: { db: { from, auth: { admin: { getUserById: accounts } } } } as unknown as Context,
    accounts,
    profiles,
    from,
  };
}
describe("staff directory", () => {
  it("joins staff roles to profile names and account emails without exposing auth metadata", async () => {
    const { ctx, accounts, profiles } = context();
    const result = await adminList(ctx, "staff_roles", new URLSearchParams());
    expect(result.rows[0]).toMatchObject({
      user_id: "first",
      name: "First Administrator",
      email: "first@example.com",
      phone: "08012345678",
      role: "admin",
    });
    expect(result.rows[1]).toMatchObject({
      user_id: "second",
      name: "Auth second",
      email: "second@example.com",
      role: "admin",
    });
    expect(accounts).toHaveBeenCalledTimes(2);
    expect(profiles).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("hidden-metadata");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("only fetches identities for the displayed page", async () => {
    const { ctx, accounts } = context(
      Array.from({ length: 25 }, (_, index) => ({ user_id: `staff-${index}`, role: "admin" })),
    );
    const result = await adminList(ctx, "staff_roles", new URLSearchParams());
    expect(result.rows).toHaveLength(24);
    expect(result.more).toBe(true);
    expect(accounts).toHaveBeenCalledTimes(24);
    expect(accounts).not.toHaveBeenCalledWith("staff-24");
  });
  it("does not read staff identities before permission checks", async () => {
    access.allowed = false;
    const { ctx, accounts, from } = context();
    await expect(adminList(ctx, "staff_roles", new URLSearchParams())).rejects.toMatchObject({
      status: 403,
    });
    expect(accounts).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
