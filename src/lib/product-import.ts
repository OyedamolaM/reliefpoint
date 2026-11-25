import { ClientError } from "./api";
export type ImportOutcome = { row: number; error?: string };
export async function importProductBatches(
  records: unknown[],
  sendBatch: (records: unknown[]) => Promise<{ outcomes: ImportOutcome[] }>,
  progress: (outcomes: ImportOutcome[], total: number) => void,
) {
  if (!records.length)
    throw new ClientError("This file has no products to import.", "EMPTY_IMPORT", 400);
  const outcomes: ImportOutcome[] = [];
  progress([], records.length);
  for (let offset = 0; offset < records.length; offset += 20) {
    let result;
    try {
      result = await sendBatch(records.slice(offset, offset + 20));
    } catch {
      throw new ClientError(
        `Import stopped after ${outcomes.length} of ${records.length} products were checked. Review the product list before retrying; the last batch may have been saved.`,
        "IMPORT_INTERRUPTED",
        503,
      );
    }
    outcomes.push(...result.outcomes.map((row) => ({ ...row, row: row.row + offset })));
    progress([...outcomes], records.length);
  }
  return outcomes;
}
