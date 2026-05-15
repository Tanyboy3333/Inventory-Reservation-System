import { releaseExpiredReservations } from "@/lib/reservations";

/**
 * Cron endpoint to release expired reservations.
 * Can be called by Vercel Cron, or any external scheduler.
 * In production, protect this with a CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releasedCount = await releaseExpiredReservations();

  return Response.json({
    message: "Expired reservations released",
    releasedCount,
  });
}
