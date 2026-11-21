import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, send } from "@/lib/api";
import { toast } from "sonner";
import type { StaffRole } from "@/lib/contracts";
export type AccountUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: StaffRole[];
  aal: string;
  recovery: boolean;
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
    return () => {
      channel?.close();
      window.removeEventListener("focus", focus);
    };
  }, [refresh, query]);
  useEffect(() => {
    if (!user) return;
    const timeout = (user.roles.length ? 15 : 30) * 60000;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      setUser(null);
      query.removeQueries({ queryKey: ["private"] });
      toast.info("Your session has ended. Please sign in again.", { id: "session-expired" });
      void send("auth/signout", {}).catch(() => {});
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(expire, timeout);
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
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("reliefpoint:session-expired", rejected);
    };
  }, [user?.id, user?.roles.length, query]);
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
