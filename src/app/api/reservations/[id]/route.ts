import { db } from "@/db";
import { reservations, products, warehouses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { releaseExpiredReservations } from "@/lib/reservations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Lazy cleanup
  await releaseExpiredReservations();

  const rows = await db
    .select({
      id: reservations.id,
      productId: reservations.productId,
      warehouseId: reservations.warehouseId,
      quantity: reservations.quantity,
      status: reservations.status,
      expiresAt: reservations.expiresAt,
      createdAt: reservations.createdAt,
      confirmedAt: reservations.confirmedAt,
      releasedAt: reservations.releasedAt,
      productName: products.name,
      productDescription: products.description,
      productPrice: products.price,
      warehouseName: warehouses.name,
      warehouseLocation: warehouses.location,
    })
    .from(reservations)
    .innerJoin(products, eq(reservations.productId, products.id))
    .innerJoin(warehouses, eq(reservations.warehouseId, warehouses.id))
    .where(eq(reservations.id, id))
    .limit(1);

  if (rows.length === 0) {
    return Response.json(
      { error: "Reservation not found" },
      { status: 404 }
    );
  }

  const r = rows[0];

  return Response.json({
    reservation: {
      id: r.id,
      quantity: r.quantity,
      status: r.status,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
      releasedAt: r.releasedAt,
      product: {
        id: r.productId,
        name: r.productName,
        description: r.productDescription,
        price: r.productPrice,
      },
      warehouse: {
        id: r.warehouseId,
        name: r.warehouseName,
        location: r.warehouseLocation,
      },
    },
  });
}
