"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ReservationData {
  id: string;
  quantity: number;
  status: "pending" | "confirmed" | "released";
  expiresAt: string;
  createdAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  product: {
    id: string;
    name: string;
    description: string | null;
    price: string;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export default function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [reservationId, setReservationId] = useState<string>("");
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    params.then((p) => setReservationId(p.id));
  }, [params]);

  const fetchReservation = useCallback(async () => {
    if (!reservationId) return;
    try {
      const res = await fetch(`/api/reservations/${reservationId}`);
      const data = await res.json();
      if (res.ok) {
        setReservation(data.reservation);
        setServerError(null);
      } else {
        setServerError(data.error || "Failed to load reservation");
      }
    } catch {
      setServerError("Network error");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  // Poll every 5 seconds while pending
  useEffect(() => {
    if (!reservation || reservation.status !== "pending") return;
    const interval = setInterval(fetchReservation, 5000);
    return () => clearInterval(interval);
  }, [reservation, fetchReservation]);

  async function handleConfirm() {
    setActionLoading(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.status === 410) {
        setServerError(
          data.message || "This reservation has expired. Stock has been released."
        );
        await fetchReservation();
        return;
      }

      if (!res.ok) {
        setServerError(data.error || "Failed to confirm reservation.");
        return;
      }

      await fetchReservation();
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRelease() {
    setActionLoading(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error || "Failed to release reservation.");
        return;
      }

      await fetchReservation();
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-gray-500">Loading reservation...</p>
        </div>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 shadow-lg text-center">
          <p className="text-lg font-semibold text-red-600">
            {serverError || "Reservation not found"}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-indigo-600 hover:underline"
          >
            ← Back to products
          </Link>
        </div>
      </main>
    );
  }

  const isPending = reservation.status === "pending";
  const isConfirmed = reservation.status === "confirmed";
  const isReleased = reservation.status === "released";

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link
            href="/"
            className="text-sm text-indigo-600 hover:underline"
          >
            ← Products
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            Reservation Checkout
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Status Banner */}
        {isConfirmed && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
            <p className="text-lg font-bold text-green-800">
              ✅ Purchase Confirmed!
            </p>
            <p className="mt-1 text-sm text-green-700">
              Your payment has been processed successfully. The stock has been
              permanently reserved for your order.
            </p>
          </div>
        )}

        {isReleased && (
          <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-5">
            <p className="text-lg font-bold text-orange-800">
              🔄 Reservation Released
            </p>
            <p className="mt-1 text-sm text-orange-700">
              The reserved stock has been returned to inventory. You can create
              a new reservation from the product page.
            </p>
          </div>
        )}

        {serverError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="text-lg font-bold text-red-800">⚠️ Error</p>
            <p className="mt-1 text-sm text-red-700">{serverError}</p>
          </div>
        )}

        {/* Countdown Timer */}
        {isPending && (
          <CountdownTimer
            expiresAt={reservation.expiresAt}
            onExpired={fetchReservation}
          />
        )}

        {/* Reservation Details Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Reservation Details
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-sm text-gray-500">Reservation ID</span>
              <span className="text-sm font-mono text-gray-700">
                {reservation.id.slice(0, 8)}...
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-sm text-gray-500">Product</span>
              <span className="text-sm font-semibold text-gray-900">
                {reservation.product.name}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-sm text-gray-500">Unit Price</span>
              <span className="text-sm text-gray-900">
                ${reservation.product.price}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-sm text-gray-500">Quantity</span>
              <span className="text-sm text-gray-900">
                {reservation.quantity}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-sm text-gray-500">Warehouse</span>
              <span className="text-sm text-gray-900">
                {reservation.warehouse.name} ({reservation.warehouse.location})
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-sm text-gray-500">Status</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isConfirmed
                    ? "bg-green-100 text-green-800"
                    : isReleased
                      ? "bg-orange-100 text-orange-800"
                      : "bg-blue-100 text-blue-800"
                }`}
              >
                {reservation.status.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-base font-bold text-gray-900">
                $
                {(
                  parseFloat(reservation.product.price) * reservation.quantity
                ).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {isPending && (
            <div className="mt-6 flex gap-4">
              <button
                onClick={handleRelease}
                disabled={actionLoading}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? "Processing..." : "Cancel Reservation"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={actionLoading}
                className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? "Processing..." : "✓ Confirm Purchase"}
              </button>
            </div>
          )}

          {isConfirmed && (
            <div className="mt-6">
              <Link
                href="/"
                className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Continue Shopping
              </Link>
            </div>
          )}

          {(isReleased || serverError) && (
            <div className="mt-6">
              <Link
                href="/"
                className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Browse Products
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Countdown Timer Component ────────────────────────────────────────────────

function CountdownTimer({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      const left = getTimeLeft(expiresAt);
      setTimeLeft(left);
      if (left.total <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  if (timeLeft.total <= 0) {
    return (
      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-lg font-bold text-red-800">
          ⏰ Reservation Expired
        </p>
        <p className="mt-1 text-sm text-red-700">
          Your reservation has expired. The stock has been released back to
          inventory.
        </p>
      </div>
    );
  }

  const minutes = Math.floor(timeLeft.total / 60000);
  const seconds = Math.floor((timeLeft.total % 60000) / 1000);

  const pct = Math.min(
    100,
    Math.max(0, (timeLeft.total / (10 * 60 * 1000)) * 100)
  );

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-800">
            ⏱️ Time remaining to complete purchase
          </p>
          <p className="mt-1 text-3xl font-bold font-mono text-blue-900">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-blue-600">Reservation expires in</p>
          <p className="text-sm font-medium text-blue-800">
            {new Date(expiresAt).toLocaleTimeString()}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function getTimeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return { total: Math.max(0, diff) };
}
