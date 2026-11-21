import { useEffect } from "react";
import { toast } from "sonner";
export function GlobalNotifications() {
  useEffect(() => {
    const invalid = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.validationMessage) toast.error(input.validationMessage, { id: "form-validation" });
    };
    document.addEventListener("invalid", invalid, true);
    return () => document.removeEventListener("invalid", invalid, true);
  }, []);
  return null;
}
