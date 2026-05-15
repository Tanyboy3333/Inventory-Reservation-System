# Allo Inventory — Reservation Platform

A Next.js application implementing an inventory and order-fulfillment platform with real-time stock reservations, built for multi-warehouse retail and D2C brands.

## Features

- **Product listing** with real-time stock levels per warehouse
- **Stock reservation** — hold units for 10 minutes during checkout
- **Confirm/Release** — finalize or cancel reservations
- **Race-condition-free** — concurrent reservation correctness via PostgreSQL `SELECT ... FOR UPDATE`
- **Idempotency** — safe retries via `Idempotency-Key` header
- **Auto-expiry** — expired reservations are lazily cleaned up on read + via a cron endpoint

## How to Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
cp .env.example .env
# Edit .env to set your DATABASE_URL

# 3. Push schema to database
npx drizzle-kit push

# 4. Seed sample data
npx tsx src/db/seed.ts

# 5. Start the dev server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `CRON_SECRET` | (Optional) Bearer token to protect the cron endpoint |

## API Reference

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List warehouses |
| `POST` | `/api/reservations` | Reserve units. Returns 409 if insufficient stock |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation. Returns 410 if expired |
| `POST` | `/api/reservations/:id/release` | Release reservation early |
| `GET` | `/api/reservations/:id` | Get reservation details (for polling) |
| `GET` | `/api/cron/release-expired` | Release all expired reservations (cron job target) |

### Idempotency

All mutating endpoints support the `Idempotency-Key` header. If a request is retried with the same key, the original response is returned without re-executing the side effect. This is implemented via a PostgreSQL table with a unique constraint on `(key, endpoint)`.

### Example — Reserve Stock

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"productId": "...", "warehouseId": "...", "quantity": 2}'
```

### Example — With Idempotency

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-123" \
  -d '{"productId": "...", "warehouseId": "...", "quantity": 1}'
```

## Reservation Expiry Mechanism

Reservations that aren't confirmed before `expiresAt` (10 minutes from creation) are automatically released so the stock returns to available inventory. This is implemented with a **two-pronged approach**:

### 1. Lazy Cleanup on Read
Every read operation — `GET /api/products` and `GET /api/reservations/:id` — triggers `releaseExpiredReservations()` before returning data. This ensures that expired reservations are cleaned up frequently without requiring a separate process.

### 2. Cron Endpoint
`GET /api/cron/release-expired` can be called by any external scheduler (Vercel Cron, AWS EventBridge, cron-job.org, etc.). This provides a fallback for periods when no reads occur.

For **production**, I'd recommend:
- **Vercel Cron**: Add a `vercel.json` with a cron config pointing to `/api/cron/release-expired`
- **Or a dedicated worker**: A small service that runs the cleanup every 1–2 minutes
- **Or PostgreSQL LISTEN/NOTIFY**: Use a trigger on the reservations table to notify a worker when reservations expire (via `pg_cron` + `NOTIFY`)

The lazy-cleanup approach is a reasonable starting point because it's simple, requires no external infrastructure, and naturally scales with traffic. Under high load, expired reservations get cleaned up faster because more read requests trigger the cleanup.

## Concurrency Correctness

The core of this exercise is ensuring that when two customers simultaneously try to reserve the last unit of a SKU, exactly one succeeds and the other gets a 409.

### Implementation

The `reserveStock()` function uses a single atomic SQL statement:

1. **`SELECT ... FOR UPDATE`** on the inventory row acquires an exclusive row-level lock
2. The lock ensures concurrent requests **serialize** — the second request blocks until the first commits
3. After the first commits, the second sees the updated `reserved_quantity` and correctly rejects if stock is insufficient
4. The `INSERT ... RETURNING` only produces a row if the `UPDATE` succeeded (i.e., stock was available)

```sql
WITH locked_inventory AS (
  SELECT id, total_quantity, reserved_quantity
  FROM inventory
  WHERE product_id = $1 AND warehouse_id = $2
  FOR UPDATE                          -- ← exclusive row lock
), ...
UPDATE inventory
SET reserved_quantity = reserved_quantity + $3
WHERE id = (SELECT id FROM ... WHERE available >= $3)
RETURNING id
```

This runs inside a single PostgreSQL transaction, so it's atomic and isolated. No Redis lock needed — PostgreSQL's MVCC + row locks handle it.

## Data Model

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  products    │     │    inventory      │     │  warehouses  │
│─────────────│     │──────────────────│     │──────────────│
│ id (PK)     │◄──┐ │ id (PK)          │ ┌──►│ id (PK)      │
│ name        │   └─│ product_id (FK)  │ │   │ name         │
│ description │     │ warehouse_id (FK)│─┘   │ location     │
│ price       │     │ total_quantity    │     └──────────────┘
│ image_url   │     │ reserved_quantity │
└─────────────┘     └──────────────────┘

                    ┌───────────────────────┐
                    │   reservations         │
                    │───────────────────────│
                    │ id (PK)               │
                    │ product_id (FK)       │
                    │ warehouse_id (FK)     │
                    │ quantity              │
                    │ status (enum)         │
                    │ expires_at (timestamptz)│
                    │ confirmed_at          │
                    │ released_at           │
                    └───────────────────────┘
```

**Available stock** = `inventory.total_quantity - inventory.reserved_quantity`

When a reservation is created: `reserved_quantity += quantity`
When a reservation is released/expired: `reserved_quantity -= quantity`
When a reservation is confirmed: no change (stock was already held)

## Trade-offs & What I'd Do Differently

### With more time, I would:

1. **Redis distributed locking**: For horizontal scaling across multiple app instances, a Redis-based lock (e.g., Redlock) provides an additional layer of safety beyond row-level locks, especially if the database becomes a bottleneck.

2. **Database migrations**: Use `drizzle-kit generate` + `drizzle-kit migrate` instead of `drizzle-kit push` for proper migration tracking in production.

3. **Rate limiting**: Add rate limiting on the reservation endpoint to prevent abuse.

4. **Optimistic concurrency on the frontend**: Use SWR or React Query for smarter data fetching, caching, and optimistic UI updates.

5. **WebSocket for real-time updates**: Instead of polling, push reservation status changes to the client.

6. **Better error recovery**: If the DB write for the reservation succeeds but the response is lost (network failure), the idempotency key ensures a retry returns the original response. But I'd add a cleanup mechanism for stale idempotency keys (TTL-based expiry).

7. **Reservation quantity limits**: More sophisticated per-customer limits (e.g., max 3 active reservations per user) to prevent stock hoarding.

8. **Partial fulfillment**: Allow splitting a reservation across multiple warehouses when one doesn't have enough stock.

9. **Audit trail**: A separate table tracking all reservation state transitions for debugging and compliance.

10. **Testing**: Comprehensive integration tests for the concurrency scenarios, including simulated concurrent requests.
