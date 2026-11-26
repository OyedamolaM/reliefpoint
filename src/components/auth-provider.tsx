import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, send, ClientError } from "@/lib/api";
import { toast } from "sonner";
import type { StaffRole } from "@/lib/contracts";
import { inactivityMs } from "@/lib/session-policy";
import { clearOtherDelivery, clearSavedDelivery } from "@/lib/cookie-preferences";
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
  const version = useRef(0);
  const checking = useRef<{ version: number; promise: Promise<void> } | null>(null);
  const failureNotified = useRef(false);
  const accountChannel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const requestVersion = version.current;
    if (checking.current?.version === requestVersion) return checking.current.promise;
    const flight = { version: requestVersion, promise: Promise.resolve() };
    const promise = (async () => {
      try {
        const result = await api<{ user: AccountUser | null }>("auth/session");
        if (version.current !== requestVersion) return;
        failureNotified.current = false;
        clearOtherDelivery(result.user?.id ?? "guest");
        setUser(result.user);
        if (!result.user) query.removeQueries({ queryKey: ["private"] });
      } catch (error) {
        if (version.current !== requestVersion) return;
        if (error instanceof ClientError && error.status === 401) {
          clearSavedDelivery();
          setUser(null);
          query.removeQueries({ queryKey: ["private"] });
        } else if (!failureNotified.current) {
          failureNotified.current = true;
          toast.error("We couldn’t check your session. Please try again.", {
            id: "session-check",
            action: {
              label: "Retry",
              onClick: () => {
                void refresh();
              },
            },
          });
        }
      } finally {
        if (version.current === requestVersion) setLoading(false);
        if (checking.current === flight) checking.current = null;
      }
    })();
    flight.promise = promise;
    checking.current = flight;
    return promise;
  }, [enabled, query]);
  useEffect(() => {
    void refresh();
    const handle = () => {
      version.current += 1;
      query.removeQueries({ queryKey: ["private"] });
      void refresh();
    };
    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("reliefpoint-account");
      accountChannel.current = channel;
      channel.onmessage = handle;
    }
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("reliefpoint:mfa-required", handle);
    return () => {
      channel?.close();
      if (accountChannel.current === channel) accountChannel.current = null;
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
      const requestVersion = version.current;
      // Another tab may have been active. Let the server decide before ending access.
      try {
        const result = await api<{ user: AccountUser | null }>("auth/session");
        if (disposed || version.current !== requestVersion) return;
        if (!result.user) {
          rejected();
          return;
        }
        setUser(result.user);
        timer = setTimeout(expire, timeout);
      } catch (error) {
        if (disposed || version.current !== requestVersion) return;
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
      clearSavedDelivery();
      version.current += 1;
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
    version.current += 1;
    query.removeQueries({ queryKey: ["private"] });
    await refresh();
    accountChannel.current?.postMessage("changed");
  };
  const logout = async (all = false) => {
    version.current += 1;
    try {
      await send(all ? "auth/signout-all" : "auth/signout", {});
    } finally {
      clearSavedDelivery();
      version.current += 1;
      setUser(null);
      query.removeQueries({ queryKey: ["private"] });
      accountChannel.current?.postMessage("changed");
    }
  };
  return (
    <Context.Provider value={{ user, loading, refresh, changed, logout }}>
      {children}
    </Context.Provider>
  );
}
