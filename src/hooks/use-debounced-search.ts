import { useEffect, useState } from "react";

export function useDebouncedSearch(value: string) {
  const [query, setQuery] = useState(value.trim());
  useEffect(() => {
    if (!value.trim()) {
      setQuery("");
      return;
    }
    const timer = setTimeout(() => setQuery(value.trim()), 2000);
    return () => clearTimeout(timer);
  }, [value]);
  return value.trim() ? query : "";
}
