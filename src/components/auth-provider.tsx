import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, send, ClientError } from "@/lib/api";
import { toast } from "sonner";
import type { StaffRole } from "@/lib/contracts";
import { inactivityMs } from "@/lib/session-policy";
export type AccountUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: StaffRole[];
  aal: string;
  recovery: boolean;
  mfaVerified: boolean;
  mfaExpiresAt: string | null;
};
type Auth = {
  user: AccountUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  changed: () => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
};
const Context = createContext<Auth>({
  user: null,
  loading: false,
  refresh: async () => {},
  changed: async () => {},
  logout: async () => {},
});
export const useAccount = () => useContext(Context);
export function AuthProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(enabled);
  const query = useQueryClient();
  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const result = await api<{ user: AccountUser | null }>("auth/session");
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    void refresh();
    const handle = () => {
      query.removeQueries({ queryKey: ["private"] });
      void refresh();
    };
    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("reliefpoint-account");
      channel.onmessage = handle;
    }
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("reliefpoint:mfa-required", handle);
    return () => {
      channel?.close();
      window.removeEventListener("focus", focus);
      window.removeEventListener("reliefpoint:mfa-required", handle);
    };
  }, [refresh, query]);
  useEffect(() => {
    if (!user) return;
    const timeout = inactivityMs(user.roles.length > 0);
    let lastSync = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const expire = async () => {
      // Another tab may have been active. Let the server decide before ending access.
      try {
        const result = await api<{ user: AccountUser | null }>("auth/session");
        if (disposed) return;
        if (!result.user) {
          rejected();
          return;
        }
        setUser(result.user);
        timer = setTimeout(expire, timeout);
      } catch (error) {
        if (disposed) return;
        if (error instanceof ClientError && error.status === 401) rejected();
        else timer = setTimeout(expire, 60000);
      }
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(expire, timeout);
      // Sync only during activity; do not keep inactive sessions alive with polling.
      if (Date.now() - lastSync > 5 * 60000) {
        lastSync = Date.now();
        void refresh();
      }
    };
    const rejected = () => {
      setUser(null);
      query.removeQueries({ queryKey: ["private"] });
      toast.info("Your session has ended. Please sign in again.", { id: "session-expired" });
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("reliefpoint:session-expired", rejected);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("reliefpoint:session-expired", rejected);
    };
  }, [user?.id, user?.roles.length, query, refresh]);
  useEffect(() => {
    if (!user?.mfaVerified || !user.mfaExpiresAt) return;
    const timer = setTimeout(
      () => {
        setUser((current) =>
          current ? { ...current, mfaVerified: false, mfaExpiresAt: null } : null,
        );
        query.removeQueries({ queryKey: ["private"] });
        void refresh();
      },
      Math.max(0, Date.parse(user.mfaExpiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [user?.id, user?.mfaVerified, user?.mfaExpiresAt, query, refresh]);
  const changed = async () => {
    query.removeQueries({ queryKey: ["private"] });
    await refresh();
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("reliefpoint-account");
      channel.postMessage("changed");
      channel.close();
    }
  };
  const logout = async (all = false) => {
    try {
      await send(all ? "auth/signout-all" : "auth/signout", {});
    } finally {
      setUser(null);
      query.removeQueries({ queryKey: ["private"] });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("reliefpoint-account");
        channel.postMessage("changed");
        channel.close();
      }
    }
  };
  return (
    <Context.Provider value={{ user, loading, refresh, changed, logout }}>
      {children}
    </Context.Provider>
  );
}
