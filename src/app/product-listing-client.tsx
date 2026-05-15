"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StockInfo {
  warehouseId: string;
  warehouseName: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  stock: StockInfo[];
}

interface ReserveModal {
  product: Product;
  stock: StockInfo;
}

export function ProductListingClient({ products }: { products: Product[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ReserveModal | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReserve(productId: string, warehouseId: string, qty: number) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, quantity: qty }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError(data.message || "Insufficient stock available.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      // Navigate to reservation page
      router.push(`/reservations/${data.reservation.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Allo Inventory</h1>
            <p className="text-sm text-gray-500">
              Reserve stock for checkout — held for 10 minutes
            </p>
          </div>
        </div>
      </header>

      {/* Product Grid */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-8">
                <div className="flex h-32 items-center justify-center">
                  <span className="text-5xl">
                    {product.name.includes("Sneaker")
                      ? "👟"
                      : product.name.includes("Headphone")
                        ? "🎧"
                        : product.name.includes("T-Shirt")
                          ? "👕"
                          : product.name.includes("Bottle")
                            ? "🧴"
                            : "👜"}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-lg font-semibold text-gray-900">
                  {product.name}
                </h3>
                {product.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {product.description}
                  </p>
                )}
                <p className="mt-3 text-xl font-bold text-gray-900">
                  ${product.price}
                </p>

                {/* Stock per warehouse */}
                <div className="mt-4 space-y-2">
                  {product.stock.map((s) => (
                    <div
                      key={s.warehouseId}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {s.warehouseName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {s.availableQuantity} of {s.totalQuantity} available
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setModal({ product, stock: s });
                          setQuantity(1);
                          setError(null);
                        }}
                        disabled={s.availableQuantity === 0}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                          s.availableQuantity === 0
                            ? "cursor-not-allowed bg-gray-200 text-gray-400"
                            : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"
                        }`}
                      >
                        {s.availableQuantity === 0 ? "Sold out" : "Reserve"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reserve Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900">
              Reserve: {modal.product.name}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              from {modal.stock.warehouseName}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {modal.stock.availableQuantity} units available
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                max={modal.stock.availableQuantity}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(
                      1,
                      Math.min(modal.stock.availableQuantity, parseInt(e.target.value) || 1)
                    )
                  )
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
              />
            </div>

            <p className="mt-3 text-sm text-gray-500">
              💡 Stock will be held for <strong>10 minutes</strong> while you
              complete checkout.
            </p>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setModal(null);
                  setError(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleReserve(modal.product.id, modal.stock.warehouseId, quantity)
                }
                disabled={loading}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Reserving..." : "Confirm Reservation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
