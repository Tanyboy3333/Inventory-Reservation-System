import { db } from "@/db";
import { products, inventory, warehouses } from "@/db/schema";
import { releaseExpiredReservations } from "@/lib/reservations";
import { ProductListingClient } from "./product-listing-client";

export const dynamic = "force-dynamic";

async function getProductData() {
  // Lazy cleanup on read
  await releaseExpiredReservations();

  const allProducts = await db.select().from(products);
  const allInventory = await db.select().from(inventory);
  const allWarehouses = await db.select().from(warehouses);

  const warehouseMap = new Map(allWarehouses.map((w) => [w.id, w]));

  const inventoryByProduct = new Map<
    string,
    {
      warehouseId: string;
      warehouseName: string;
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
      totalQuantity: inv.totalQuantity,
      reservedQuantity: inv.reservedQuantity,
      availableQuantity: inv.totalQuantity - inv.reservedQuantity,
    });
    inventoryByProduct.set(inv.productId, existing);
  }

  return allProducts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    stock: inventoryByProduct.get(p.id) || [],
  }));
}

export default async function HomePage() {
  const products = await getProductData();

  return <ProductListingClient products={products} />;
}
