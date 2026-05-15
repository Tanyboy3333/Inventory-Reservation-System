import { createReservationSchema } from "@/lib/validators";
import { reserveStock } from "@/lib/reservations";
import {
  getIdempotentResponse,
  storeIdempotentResponse,
} from "@/lib/idempotency";

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("Idempotency-Key") || null;

  // Check idempotency
  const cached = await getIdempotentResponse(idempotencyKey, "POST /api/reservations");
  if (cached) {
    return new Response(JSON.stringify(cached.body), {
      status: cached.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const errorBody = { error: "Invalid JSON body" };
    await storeIdempotentResponse(idempotencyKey, "POST /api/reservations", 400, errorBody);
    return Response.json(errorBody, { status: 400 });
  }

  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) {
    const errorBody = {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    };
    await storeIdempotentResponse(idempotencyKey, "POST /api/reservations", 400, errorBody);
    return Response.json(errorBody, { status: 400 });
  }

  // Attempt to reserve stock (concurrency-safe via SELECT FOR UPDATE)
  const reservation = await reserveStock(parsed.data);

  if (!reservation) {
    const errorBody = {
      error: "Insufficient stock",
      message:
        "Not enough available stock for the requested product at this warehouse. Another customer may have reserved the units.",
    };
    await storeIdempotentResponse(idempotencyKey, "POST /api/reservations", 409, errorBody);
    return Response.json(errorBody, { status: 409 });
  }

  const successBody = {
    reservation: {
      id: reservation.id,
      productId: reservation.productId,
      warehouseId: reservation.warehouseId,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
    },
  };

  await storeIdempotentResponse(
    idempotencyKey,
    "POST /api/reservations",
    201,
    successBody
  );

  return Response.json(successBody, { status: 201 });
}
