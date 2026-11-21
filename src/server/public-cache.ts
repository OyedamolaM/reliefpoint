// Public projections only. Never place sessions, orders or prescription data here.
const entries = new Map<string, { expires: number; value: Promise<unknown> }>();
export async function cachedPublic<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  if (entries.size >= 128) entries.delete(entries.keys().next().value!);
  const value = load();
  entries.set(key, { expires: Date.now() + 60000, value });
  try {
    return await value;
  } catch (error) {
    entries.delete(key);
    throw error;
  }
}
export function invalidatePublic() {
  entries.clear();
}
