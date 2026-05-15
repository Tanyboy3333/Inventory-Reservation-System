import { releaseReservation } from "@/lib/reservations";
import {
  getIdempotentResponse,
  storeIdempotentResponse,
} from "@/lib/idempotency";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key") || null;

  // Check idempotency
  const cached = await getIdempotentResponse(
    idempotencyKey,
    `POST /api/reservations/${id}/release`
  );
  if (cached) {
    return new Response(JSON.stringify(cached.body), {
      status: cached.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await releaseReservation(id);

  if (result === "released") {
    const successBody = {
      message: "Reservation released. Stock returned to inventory.",
      reservation: { id, status: "released" },
    };
    await storeIdempotentResponse(
      idempotencyKey,
      `POST /api/reservations/${id}/release`,
      200,
      successBody
    );
    return Response.json(successBody);
  }

  if (result === "already_released") {
    const body = {
      message:
        "Reservation has already been released, confirmed, or is no longer pending.",
      reservation: { id },
    };
    await storeIdempotentResponse(
      idempotencyKey,
      `POST /api/reservations/${id}/release`,
      200,
      body
    );
    return Response.json(body);
  }

  // not_found
  const errorBody = {
    error: "Reservation not found",
    message: "No reservation exists with this ID.",
  };
  await storeIdempotentResponse(
    idempotencyKey,
    `POST /api/reservations/${id}/release`,
    404,
    errorBody
  );
  return Response.json(errorBody, { status: 404 });
}
