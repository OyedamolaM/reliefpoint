import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const requests = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: requests.api,
  send: requests.send,
}));
vi.mock("sonner", () => ({ toast: { error: requests.error, info: requests.info } }));
import { AuthProvider, useAccount, type AccountUser } from "@/components/auth-provider";
import { ClientError } from "@/lib/api";
const user: AccountUser = {
  id: "user",
  name: "Customer",
  email: "buyer@example.com",
  phone: "",
  roles: [],
  aal: "aal1",
  recovery: false,
  mfaVerified: false,
  mfaExpiresAt: null,
};
function Status() {
  const auth = useAccount();
  return (
    <>
      <p>{auth.user ? `Signed in: ${auth.user.name}` : "Signed out"}</p>
      <button onClick={() => void auth.logout()}>Sign out</button>
    </>
  );
}
async function mount() {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  query.setQueryData(["private", "saved-form"], { address: "Entered address" });
  render(
    <QueryClientProvider client={query}>
      <AuthProvider enabled>
        <Status />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Signed in: Customer");
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  requests.api.mockReset().mockResolvedValue({ user });
  requests.send.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
describe("session recovery", () => {
  it.each([0, 429, 503])(
    "keeps the signed-in interface and entered data after a temporary error (%s)",
    async (status) => {
      const query = await mount();
      requests.api.mockRejectedValue(
        new ClientError("Temporary error", "AUTH_UNAVAILABLE", status),
      );
      await act(async () => {
        fireEvent.focus(window);
      });
      expect(screen.getByText("Signed in: Customer")).toBeInTheDocument();
      expect(query.getQueryData(["private", "saved-form"])).toEqual({ address: "Entered address" });
      await act(async () => {
        fireEvent.focus(window);
      });
      expect(requests.error).toHaveBeenCalledTimes(1);
      expect(requests.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) }),
      );
    },
  );
  it("removes private cached data when the server confirms the session has ended", async () => {
    const query = await mount();
    requests.api.mockRejectedValueOnce(new ClientError("Session ended", "SESSION_EXPIRED", 401));
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(query.getQueryData(["private", "saved-form"])).toBeUndefined();
  });
  it("shares overlapping session checks", async () => {
    await mount();
    let finish!: (value: { user: AccountUser }) => void;
    requests.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      fireEvent.focus(window);
      fireEvent.focus(window);
    });
    expect(requests.api).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish({ user });
    });
    expect(screen.getByText("Signed in: Customer")).toBeInTheDocument();
  });
  it("does not restore a logged-out account from a late session response", async () => {
    await mount();
    let finish!: (value: { user: AccountUser }) => void;
    requests.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      fireEvent.focus(window);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    await act(async () => {
      finish({ user });
    });
    expect(screen.getByText("Signed out")).toBeInTheDocument();
  });
});
