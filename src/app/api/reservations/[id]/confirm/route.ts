import { confirmReservation } from "@/lib/reservations";
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
    `POST /api/reservations/${id}/confirm`
  );
  if (cached) {
    return new Response(JSON.stringify(cached.body), {
      status: cached.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await confirmReservation(id);

  if (result === "confirmed") {
    const successBody = {
      message: "Reservation confirmed successfully. Payment processed.",
      reservation: { id, status: "confirmed" },
    };
    await storeIdempotentResponse(
      idempotencyKey,
      `POST /api/reservations/${id}/confirm`,
      200,
      successBody
    );
    return Response.json(successBody);
  }

  if (result === "expired") {
    const errorBody = {
      error: "Reservation expired",
      message:
        "This reservation has expired and the stock has been released back to inventory. Please start a new reservation.",
    };
    await storeIdempotentResponse(
      idempotencyKey,
      `POST /api/reservations/${id}/confirm`,
      410,
      errorBody
    );
    return Response.json(errorBody, { status: 410 });
  }

  if (result === "already_confirmed") {
    const body = {
      message: "Reservation was already confirmed.",
      reservation: { id, status: "confirmed" },
    };
    await storeIdempotentResponse(
      idempotencyKey,
      `POST /api/reservations/${id}/confirm`,
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
    `POST /api/reservations/${id}/confirm`,
    404,
    errorBody
  );
  return Response.json(errorBody, { status: 404 });
}
