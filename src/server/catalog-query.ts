import { requireDb } from "./errors";

type Result<T> = { data: T | null; error: { code: string; message: string } | null };

// New code may reach a deployment before its additive catalog migration.
// Only the optional display price can be omitted; never suppress other database failures.
export async function selectCatalog<T>(
  columns: string,
  read: (columns: string) => PromiseLike<Result<T>>,
) {
  const result = await read(columns);
  if (
    result.error &&
    ["42703", "PGRST204"].includes(result.error.code) &&
    result.error.message.includes("regular_price_kobo") &&
    columns.split(",").includes("regular_price_kobo")
  ) {
    return requireDb(
      await read(
        columns
          .split(",")
          .filter((column) => column !== "regular_price_kobo")
          .join(","),
      ),
    );
  }
  return requireDb(result);
}
