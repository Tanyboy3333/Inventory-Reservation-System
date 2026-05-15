import { db } from "./index";
import { warehouses, products, inventory } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  // ─── Warehouses ───────

  const [whEast] = await db
    .insert(warehouses)
    .values([
      { name: "East Coast Fulfillment Center", location: "New York, NY" },
      { name: "West Coast Fulfillment Center", location: "Los Angeles, CA" },
      { name: "Central Warehouse", location: "Chicago, IL" },
    ])
    .returning();

  const allWarehouses = await db.select().from(warehouses);
  const whNY = allWarehouses[0];
  const whLA = allWarehouses[1];
  const whCHI = allWarehouses[2];

  // ─── Products ──────

  const allProducts = await db
    .insert(products)
    .values([
      {
        name: "Classic White Sneakers",
        description:
          "Minimalist leather sneakers with a clean silhouette. Perfect for everyday wear.",
        price: "89.99",
      },
      {
        name: "Wireless Noise-Cancelling Headphones",
        description:
          "Premium over-ear headphones with active noise cancellation and 30-hour battery life.",
        price: "249.99",
      },
      {
        name: "Organic Cotton T-Shirt",
        description:
          "Soft, breathable 100% organic cotton tee. Available in multiple colors.",
        price: "34.99",
      },
      {
        name: "Stainless Steel Water Bottle",
        description:
          "Double-walled insulated bottle that keeps drinks cold for 24 hours or hot for 12.",
        price: "29.99",
      },
      {
        name: "Leather Crossbody Bag",
        description:
          "Handcrafted genuine leather bag with adjustable strap and multiple compartments.",
        price: "129.99",
      },
    ])
    .returning();

  // ─── Inventory ───────

  const inventoryData: (typeof inventory.$inferInsert)[] = [];

  for (const product of allProducts) {
    // Each product has stock in each warehouse
    const stockLevels: Record<string, [number, number, number]> = {
      "Classic White Sneakers": [15, 10, 5],
      "Wireless Noise-Cancelling Headphones": [8, 3, 6],
      "Organic Cotton T-Shirt": [25, 20, 18],
      "Stainless Steel Water Bottle": [50, 30, 40],
      "Leather Crossbody Bag": [4, 2, 3],
    };

    const levels = stockLevels[product.name] || [10, 10, 10];

    inventoryData.push(
      { productId: product.id, warehouseId: whNY.id, totalQuantity: levels[0], reservedQuantity: 0 },
      { productId: product.id, warehouseId: whLA.id, totalQuantity: levels[1], reservedQuantity: 0 },
      { productId: product.id, warehouseId: whCHI.id, totalQuantity: levels[2], reservedQuantity: 0 }
    );
  }

  await db.insert(inventory).values(inventoryData);

  console.log("Seed complete!");
  console.log(`Warehouses: ${allWarehouses.length}`);
  console.log(`Products: ${allProducts.length}`);
  console.log(`Inventory rows: ${inventoryData.length}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
