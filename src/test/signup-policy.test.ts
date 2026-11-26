// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { authAction } from "@/server/auth";
import type { Context } from "@/server/session";
describe("signup policy acknowledgement", () => {
  const input = { email: "buyer@example.com", password: "password12345", name: "Buyer One" };
  function context() {
    const signUp = vi.fn(async () => ({ error: null }));
    const ctx = {
      origin: "https://pharmacy.example",
      request: new Request("https://pharmacy.example/api/auth/signup"),
      hash: (value: string) => value,
      db: { rpc: vi.fn(async () => ({ data: true, error: null })) },
      auth: { auth: { signUp } },
    } as unknown as Context;
    return { ctx, signUp };
  }
  it("rejects registration without agreement even when frontend validation is bypassed", async () => {
    const { ctx, signUp } = context();
    await expect(authAction(ctx, "signup", input)).rejects.toMatchObject({
      code: "TERMS_REQUIRED",
    });
    expect(signUp).not.toHaveBeenCalled();
  });
  it("stores the server's acknowledgement timestamp and terms version without auto-verifying email", async () => {
    const { ctx, signUp } = context();
    await authAction(ctx, "signup", {
      ...input,
      accepted_terms: true,
      terms_accepted_at: "forged",
    });
    expect(signUp).toHaveBeenCalledWith({
      email: input.email,
      password: input.password,
      options: {
        data: {
          name: input.name,
          terms_version: "2026-11-26",
          terms_accepted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
        emailRedirectTo: "https://pharmacy.example/api/auth/callback",
      },
    });
  });
});
