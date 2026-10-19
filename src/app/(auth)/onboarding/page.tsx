"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface BusinessInfo {
  businessName: string;
  businessType: string;
  country: string;
  timezone: string;
  currency: string;
  enabledModules: string[];
}

export default function OnboardingPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"business" | "complete">("business");
  const [form, setForm] = useState<BusinessInfo>({
    businessName: "",
    businessType: "restaurant",
    country: "PK",
    timezone: "Asia/Karachi",
    currency: "PKR",
    enabledModules: ["chat", "knowledge", "settings"],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleNext = async () => {
    if (!form.businessName.trim()) {
      setError("Business name is required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ownerUserId: user?.uid,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Onboarding failed");
      }

      setStep("complete");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
  };

  if (step === "complete") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 text-3xl mb-4">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Setup Complete!</h1>
          <p className="mt-2 text-gray-600">
            Your business "{form.businessName}" is ready.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Business Setup
            </h1>
            <p className="mt-2 text-gray-600">
              Tell us about your food business
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Business Name
              </label>
              <input
                type="text"
                value={form.businessName}
                onChange={(e) =>
                  setForm({ ...form, businessName: e.target.value })
                }
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                placeholder="e.g. Biryani House"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Business Type
              </label>
              <select
                value={form.businessType}
                onChange={(e) =>
                  setForm({ ...form, businessType: e.target.value })
                }
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="restaurant">Restaurant</option>
                <option value="cafe">Cafe</option>
                <option value="bakery">Bakery</option>
                <option value="cloud_kitchen">Cloud Kitchen</option>
                <option value="catering">Catering</option>
                <option value="food_stall">Food Stall</option>
                <option value="travel_agency">Travel Agency</option>
                <option value="dental_clinic">Dental Clinic</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Country
              </label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Currency
              </label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div className="pt-6 flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSkip}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={loading}
                className="ml-auto px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Setting up..." : "Continue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
