import { render as testingRender, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import type { ReactElement } from "react";
export function render(ui: ReactElement, options?: RenderOptions) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["posts", 0], { posts: [], more: false });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return testingRender(
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>{ui}</RouterContextProvider>
    </QueryClientProvider>,
    options,
  );
}
