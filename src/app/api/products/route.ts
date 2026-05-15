import { db } from "@/db";
import { products, inventory, warehouses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { releaseExpiredReservations } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function GET() {
  // Lazy cleanup: release expired reservations on every product listing read
  await releaseExpiredReservations();

  const allProducts = await db.select().from(products);
  const allInventory = await db
    .select({
      productId: inventory.productId,
      warehouseId: inventory.warehouseId,
      totalQuantity: inventory.totalQuantity,
      reservedQuantity: inventory.reservedQuantity,
    })
    .from(inventory);

  const allWarehouses = await db.select().from(warehouses);

  const warehouseMap = new Map(allWarehouses.map((w) => [w.id, w]));

  // Group inventory by product
  const inventoryByProduct = new Map<
    string,
    {
      warehouseId: string;
      warehouseName: string;
      warehouseLocation: string;
      totalQuantity: number;
      reservedQuantity: number;
      availableQuantity: number;
    }[]
  >();

  for (const inv of allInventory) {
    const existing = inventoryByProduct.get(inv.productId) || [];
    const wh = warehouseMap.get(inv.warehouseId);
    existing.push({
      warehouseId: inv.warehouseId,
      warehouseName: wh?.name || "Unknown",
      warehouseLocation: wh?.location || "Unknown",
      totalQuantity: inv.totalQuantity,
      reservedQuantity: inv.reservedQuantity,
      availableQuantity: inv.totalQuantity - inv.reservedQuantity,
    });
    inventoryByProduct.set(inv.productId, existing);
  }

  return Response.json({
    products: allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      stock: inventoryByProduct.get(p.id) || [],
    })),
  });
}
