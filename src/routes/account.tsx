import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/account-page";
export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "account | ReliefPoint Pharmacy" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccountPage,
});
