import type { QueryClient } from "@tanstack/react-query";

// Visible order screens discover updates from other customers and staff.
// These reads must not count as human activity for the inactivity timeout.
export const orderReadOptions = { headers: { "X-Background-Read": "1" } };
export const orderRefreshInterval = (query: { state: { error: Error | null } }) =>
  query.state.error ? false : 30000;

export function invalidateOrderData(client: QueryClient) {
  return Promise.all(
    [
      ["private", "admin"],
      ["private", "admin-summary"],
      ["private", "orders"],
      ["private", "order"],
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}
