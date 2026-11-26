// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEnvironmentSupport } from "@/server/environment-support";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "private-support@example.com",
  email_confirmed_at: "2026-11-25T10:00:00Z",
};
beforeEach(() => {
  vi.stubEnv("SUPPORT_USER_ID", user.id);
  vi.stubEnv("SUPPORT_EMAIL", user.email);
});
afterEach(() => vi.unstubAllEnvs());
describe("environment support identity", () => {
  it("requires both the configured immutable account ID and verified email", () => {
    expect(isEnvironmentSupport(user)).toBe(true);
    expect(isEnvironmentSupport({ ...user, id: "00000000-0000-4000-8000-000000000002" })).toBe(
      false,
    );
    expect(isEnvironmentSupport({ ...user, email: "someone-else@example.com" })).toBe(false);
    expect(isEnvironmentSupport({ ...user, email_confirmed_at: "" })).toBe(false);
  });
  it("does not grant access from a matching email alone or user metadata", () => {
    const attacker = {
      ...user,
      id: "00000000-0000-4000-8000-000000000002",
      user_metadata: { role: "owner", support: true },
    };
    expect(isEnvironmentSupport(attacker)).toBe(false);
    vi.stubEnv("SUPPORT_USER_ID", "");
    expect(isEnvironmentSupport(user)).toBe(false);
  });
  it("stops matching the recovery identity when configuration is removed", () => {
    expect(isEnvironmentSupport(user)).toBe(true);
    vi.stubEnv("SUPPORT_EMAIL", "");
    expect(isEnvironmentSupport(user)).toBe(false);
  });
});
