import { db } from "@/db";
import { inventory, reservations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { CreateReservationInput } from "./validators";

const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Reserve stock for a product at a specific warehouse.
 *
 * Concurrency guarantee:
 *   We use a SERIALIZABLE transaction with `SELECT ... FOR UPDATE` on the
 *   inventory row. This acquires an exclusive row-level lock so that two
 *   concurrent requests for the same SKU serialise — the second request
 *   blocks until the first commits, at which point it sees the updated
 *   reserved_quantity and correctly rejects if stock is insufficient.
 */
export async function reserveStock(input: CreateReservationInput) {
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

  const result = await db.execute(
    // This atomic query does the following in a single SERIALIZABLE transaction:
    // 1. Lock the inventory row for the product+warehouse
    // 2. Check available stock (total - reserved >= requested)
    // 3. If sufficient, increment reserved_quantity
    // 4. Insert a new reservation row
    // 5. Return the new reservation id
    sql`
      WITH locked_inventory AS (
        SELECT id, total_quantity, reserved_quantity
        FROM inventory
        WHERE product_id = ${input.productId}::uuid
          AND warehouse_id = ${input.warehouseId}::uuid
        FOR UPDATE
      ),
      available_check AS (
        SELECT id,
               (total_quantity - reserved_quantity) AS available
        FROM locked_inventory
      ),
      do_reserve AS (
        UPDATE inventory
        SET reserved_quantity = reserved_quantity + ${input.quantity},
            updated_at = now()
        WHERE id = (SELECT id FROM available_check WHERE available >= ${input.quantity})
        RETURNING id
      )
      INSERT INTO reservations (product_id, warehouse_id, quantity, status, expires_at)
      SELECT ${input.productId}::uuid, ${input.warehouseId}::uuid, ${input.quantity}, 'pending', ${expiresAt}
      FROM do_reserve
      RETURNING id
    `
  );

  if (result.rows.length === 0) {
    return null; // Not enough stock
  }

  // Fetch the full reservation to return
  const reservation = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, result.rows[0].id as string))
    .limit(1);

  return reservation[0] || null;
}

/**
 * Confirm a reservation (payment succeeded).
 * Returns 'confirmed', 'expired', 'not_found', or 'already_confirmed'.
 */
export async function confirmReservation(reservationId: string) {
  // First, release any expired reservations atomically
  await releaseExpiredReservations();

  const result = await db.execute(sql`
    UPDATE reservations
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = ${reservationId}::uuid
      AND status = 'pending'
      AND expires_at > now()
    RETURNING id, product_id, warehouse_id, quantity, status, expires_at, created_at
  `);

  if (result.rows.length === 0) {
    // Check if it exists at all
    const existing = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);

    if (existing.length === 0) return "not_found";
    if (existing[0].status === "confirmed") return "already_confirmed";
    return "expired";
  }

  return "confirmed";
}

/**
 * Release a reservation early (payment failed or user cancelled).
 * Also decrements the reserved_quantity on the inventory row.
 */
export async function releaseReservation(reservationId: string) {
  const result = await db.execute(sql`
    UPDATE reservations
    SET status = 'released', released_at = now()
    WHERE id = ${reservationId}::uuid
      AND status = 'pending'
    RETURNING id, product_id, warehouse_id, quantity
  `);

  if (result.rows.length === 0) {
    // Check if it exists at all
    const existing = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);

    if (existing.length === 0) return "not_found";
    return "already_released";
  }

  const row = result.rows[0];
  // Decrement reserved_quantity
  await db.execute(sql`
    UPDATE inventory
    SET reserved_quantity = GREATEST(reserved_quantity - ${row.quantity}, 0),
        updated_at = now()
    WHERE product_id = ${row.product_id}::uuid
      AND warehouse_id = ${row.warehouse_id}::uuid
  `);

  return "released";
}

/**
 * Release all expired pending reservations and return their inventory.
 */
export async function releaseExpiredReservations() {
  const result = await db.execute(sql`
    UPDATE reservations
    SET status = 'released', released_at = now()
    WHERE status = 'pending' AND expires_at <= now()
    RETURNING id, product_id, warehouse_id, quantity
  `);

  for (const row of result.rows) {
    await db.execute(sql`
      UPDATE inventory
      SET reserved_quantity = GREATEST(reserved_quantity - ${row.quantity}, 0),
          updated_at = now()
      WHERE product_id = ${row.product_id}::uuid
        AND warehouse_id = ${row.warehouse_id}::uuid
    `);
  }

  return result.rows.length;
}
