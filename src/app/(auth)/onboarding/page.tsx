"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface BusinessForm {
  businessName: string;
  businessType: string;
  country: string;
  currency: string;
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"business" | "complete">("business");
  const [form, setForm] = useState<BusinessForm>({
    businessName: "",
    businessType: "restaurant",
    country: "PK",
    currency: "PKR",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/signup");
    }
  }, [user, router]);

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

  if (!user) return null;

  if (step === "complete") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-md p-8 shadow-lg border border-border">
          <CardHeader className="space-y-4 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 text-3xl mb-4 mx-auto">
              ✓
            </div>
            <CardTitle className="text-2xl font-bold">Setup Complete!</CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Your business "{form.businessName}" is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              onClick={() => router.push("/dashboard")}
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md p-8 shadow-lg border border-border">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Business Setup</CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Tell us about your food business
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-6">
            <Field>
              <FieldLabel htmlFor="businessName">Business Name</FieldLabel>
              <Input
                id="businessName"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder="e.g. Biryani House"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="businessType">Business Type</FieldLabel>
              <Select
                onValueChange={(value: string) =>
                  setForm({ ...form, businessType: value })
                }
                defaultValue={form.businessType}
              >
                <SelectTrigger id="businessType">
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="cafe">Cafe</SelectItem>
                  <SelectItem value="bakery">Bakery</SelectItem>
                  <SelectItem value="cloud_kitchen">Cloud Kitchen</SelectItem>
                  <SelectItem value="catering">Catering</SelectItem>
                  <SelectItem value="food_stall">Food Stall</SelectItem>
                  <SelectItem value="travel_agency">Travel Agency</SelectItem>
                  <SelectItem value="dental_clinic">Dental Clinic</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal">
              <div className="col-span-4">
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="col-span-4">
                <FieldLabel htmlFor="currency">Currency</FieldLabel>
                <Input
                  id="currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="h-9"
                />
              </div>
            </Field>

            <div className="flex items-center space-x-4 pt-4">
              <button
                type="button"
                onClick={handleSkip}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Skip for now
              </button>
              <Button type="submit" disabled={loading} className="ml-auto">
                {loading ? "Setting up..." : "Continue"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
