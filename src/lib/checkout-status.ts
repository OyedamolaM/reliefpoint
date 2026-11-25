export type CheckoutReadiness = {
  available: boolean;
  mode: "test" | "live" | "unconfigured";
  checks: { key: string; label: string; ready: boolean }[];
};
