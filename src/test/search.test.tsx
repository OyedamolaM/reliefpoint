import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { SearchInput } from "@/components/search-input";

afterEach(() => vi.useRealTimers());
it("waits two seconds after the last keystroke and clears immediately", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ text }) => useDebouncedSearch(text), {
    initialProps: { text: "" },
  });
  rerender({ text: "para" });
  act(() => vi.advanceTimersByTime(1999));
  expect(result.current).toBe("");
  rerender({ text: "parace" });
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current).toBe("parace");
  rerender({ text: "" });
  expect(result.current).toBe("");
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current).toBe("");
});
it("provides an accessible clear button", () => {
  const onValueChange = vi.fn();
  render(<SearchInput aria-label="Search products" value="para" onValueChange={onValueChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(onValueChange).toHaveBeenCalledWith("");
});
