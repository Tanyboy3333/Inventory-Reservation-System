import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Checks if an idempotency key has already been processed for the given endpoint.
 * If found, returns the stored response. Otherwise returns null.
 */
export async function getIdempotentResponse(
  key: string | null,
  endpoint: string
): Promise<StoredResponse | null> {
  if (!key) return null;

  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.endpoint, endpoint)))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    status: row.responseStatus,
    body: JSON.parse(row.responseBody),
  };
}

/**
 * Stores the response for an idempotency key so retries return the same result.
 */
export async function storeIdempotentResponse(
  key: string | null,
  endpoint: string,
  status: number,
  body: Record<string, unknown>
): Promise<void> {
  if (!key) return;

  try {
    await db.insert(idempotencyKeys).values({
      key,
      endpoint,
      responseStatus: status,
      responseBody: JSON.stringify(body),
    });
  } catch {
    // Unique constraint violation — another request already stored this key.
    // That's fine; just ignore.
  }
}
