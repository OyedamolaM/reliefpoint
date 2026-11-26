import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "./render";
import { HealthTipsPage } from "@/components/blog";
const fetchPosts = vi.hoisted(() =>
  vi.fn(async (_path: string) => ({
    posts: [],
    more: false,
    categories: ["Wellness", "Nutrition"],
  })),
);
vi.mock("@/lib/api", () => ({ api: (path: string) => fetchPosts(path), notifyError: vi.fn() }));
vi.mock("@/components/site-shell", () => ({
  SiteShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
afterEach(cleanup);
it("filters published health tips by category and restores all categories", async () => {
  render(
    <HealthTipsPage initial={{ posts: [], more: false, categories: ["Wellness", "Nutrition"] }} />,
  );
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Nutrition" } });
  await waitFor(() => expect(fetchPosts).toHaveBeenCalledWith("posts?page=0&category=Nutrition"));
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "" } });
  expect(screen.getByLabelText("Category")).toHaveValue("");
});
