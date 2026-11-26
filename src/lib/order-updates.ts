import type { QueryClient } from "@tanstack/react-query";

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
