import { z } from "zod";

export const createReservationSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  warehouseId: z.string().uuid("Invalid warehouse ID"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Must reserve at least 1 unit")
    .max(100, "Cannot reserve more than 100 units at once"),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
