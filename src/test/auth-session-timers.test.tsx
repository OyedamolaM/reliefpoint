import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAccount } from "@/components/auth-provider";
import { hourMs } from "@/lib/session-policy";

const state = vi.hoisted(() => ({ staff: true, lastSeen: 0, mfaUntil: 0, calls: 0 }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return {
    ...actual,
    send: vi.fn(),
    api: vi.fn(async () => {
      state.calls++;
      if (Date.now() - state.lastSeen >= (state.staff ? 24 : 72) * hourMs) return { user: null };
      state.lastSeen = Date.now();
      return {
        user: {
          id: "user",
          name: "Staff",
          roles: state.staff ? ["admin"] : [],
          aal: "aal2",
          recovery: false,
          mfaVerified: Date.now() < state.mfaUntil,
          mfaExpiresAt: new Date(state.mfaUntil).toISOString(),
        },
      };
    }),
  };
});
function Status() {
  const { user } = useAccount();
  return (
    <p>
      {user
        ? user.mfaVerified
          ? "Signed in and verified"
          : "Signed in, code needed"
        : "Signed out"}
    </p>
  );
}
async function mount() {
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider enabled>
          <Status />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  state.staff = true;
  state.calls = 0;
  state.lastSeen = Date.now();
  state.mfaUntil = Date.now() + 24 * hourMs;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("browser session timers", () => {
  it.each([
    [true, 24],
    [false, 72],
  ] as const)("uses the matching inactivity period for staff %s", async (staff, hours) => {
    state.staff = staff;
    state.mfaUntil = 0;
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync((hours - 1) * hourMs);
    });
    expect(screen.getByText("Signed in, code needed")).toBeVisible();
    expect(state.calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(hourMs);
    });
    expect(screen.getByText("Signed out")).toBeVisible();
  });
  it("requires a code at 24 hours while activity keeps the account signed in", async () => {
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(23 * hourMs);
    });
    expect(state.calls).toBe(1);
    await act(async () => {
      fireEvent.pointerDown(window);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(hourMs);
    });
    expect(screen.getByText("Signed in, code needed")).toBeVisible();
    expect(state.calls).toBe(3);
  });
  it("checks server activity before signing out a browser with another active tab", async () => {
    state.mfaUntil = 0;
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(23 * hourMs);
    });
    state.lastSeen = Date.now(); // Activity recorded by a different tab.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(hourMs);
    });
    expect(screen.getByText("Signed in, code needed")).toBeVisible();
    expect(state.calls).toBe(2);
  });
});
