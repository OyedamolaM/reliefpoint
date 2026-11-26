import { useEffect, useRef, useState, type SetStateAction } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  clearSavedDelivery,
  DELIVERY_STORAGE_KEY,
  useCookiePreferences,
} from "@/lib/cookie-preferences";

const contactSchema = z.object({
  name: z.string().max(120),
  email: z.string().max(180),
  phone: z.string().max(24),
  address: z.string().max(500),
  note: z.string().max(1000),
});
const fieldsSchema = z.object({
  contact: contactSchema,
  state: z.string().max(80),
  area: z.string().max(100),
  zone: z.string().max(100),
});
const storedSchema = fieldsSchema.extend({
  owner: z.string().max(128),
  version: z.literal(1),
  expires: z.number().finite(),
});
type Fields = z.infer<typeof fieldsSchema>;
type Account = {
  loading: boolean;
  user: { id: string; name: string; email: string; phone: string } | null;
};
export function useDeliveryDraft(account: Account, enabled = true) {
  const remember = useCookiePreferences();
  const owner = account.user?.id ?? "guest";
  const defaults = (): Fields => ({
    contact: {
      name: account.user?.name ?? "",
      email: account.user?.email ?? "",
      phone: account.user?.phone ?? "",
      address: "",
      note: "",
    },
    state: "Lagos",
    area: "",
    zone: "",
  });
  const [value, setValue] = useState(() => ({ ...defaults(), owner, dirty: false }));
  const restored = useRef<string | null>(null);
  const warned = useRef(false);
  useEffect(() => {
    if (!enabled || account.loading || remember === undefined) return;
    if (restored.current === owner) {
      if (remember !== true) clearSavedDelivery();
      return;
    }
    if (restored.current !== null) clearSavedDelivery();
    restored.current = owner;
    let next = defaults();
    if (remember === true) {
      try {
        const parsed = storedSchema.safeParse(
          JSON.parse(localStorage.getItem(DELIVERY_STORAGE_KEY) || "null"),
        );
        if (
          parsed.success &&
          parsed.data.owner === owner &&
          parsed.data.expires > Date.now() &&
          parsed.data.expires <= Date.now() + 7 * 86400000
        ) {
          next = fieldsSchema.parse(parsed.data);
          if (account.user) next.contact.email = account.user.email;
        } else clearSavedDelivery();
      } catch {
        clearSavedDelivery();
      }
    } else clearSavedDelivery();
    setValue({ ...next, owner, dirty: false });
  }, [owner, account.loading, enabled, remember]);
  useEffect(() => {
    if (
      !enabled ||
      account.loading ||
      remember !== true ||
      !value.dirty ||
      value.owner !== owner ||
      restored.current !== owner
    )
      return;
    const parsed = fieldsSchema.safeParse(value);
    if (!parsed.success) return;
    try {
      localStorage.setItem(
        DELIVERY_STORAGE_KEY,
        JSON.stringify({ ...parsed.data, owner, version: 1, expires: Date.now() + 7 * 86400000 }),
      );
    } catch {
      if (!warned.current) {
        warned.current = true;
        toast.info(
          "Delivery details couldn't be saved on this device. You can still continue checkout.",
          { id: "delivery-storage" },
        );
      }
    }
  }, [value, owner, enabled, account.loading, remember]);
  function update<K extends keyof Fields>(key: K, action: SetStateAction<Fields[K]>) {
    setValue((previous) => {
      const base = previous.owner === owner ? previous : { ...defaults(), owner, dirty: false };
      const next =
        typeof action === "function"
          ? (action as (old: Fields[K]) => Fields[K])(base[key])
          : action;
      return { ...base, [key]: next, dirty: true };
    });
  }
  const current = value.owner === owner ? value : defaults();
  return {
    ...current,
    remember,
    setContact: (action: SetStateAction<Fields["contact"]>) => update("contact", action),
    setState: (action: SetStateAction<string>) => update("state", action),
    setArea: (action: SetStateAction<string>) => update("area", action),
    setZone: (action: SetStateAction<string>) => update("zone", action),
    clear: () => {
      clearSavedDelivery();
      setValue({ ...defaults(), owner, dirty: false });
    },
  };
}
