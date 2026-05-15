import { db } from "@/db";
import { warehouses } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const allWarehouses = await db.select().from(warehouses);

  return Response.json({
    warehouses: allWarehouses.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location,
    })),
  });
}
