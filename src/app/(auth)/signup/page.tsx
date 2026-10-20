"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { friendlyAuthErrorMessage } from "@/lib/auth/auth-errors";

export default function SignupPage() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("restaurant");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            businessName,
            businessType,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || "Signup failed");
        }

        await signIn(email, password);
        router.push("/onboarding");
      } else {
        await signIn(email, password);
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(friendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(friendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md p-8 shadow-lg border border-border">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {mode === "signup" ? "Create Account" : "Welcome Back"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            {mode === "signup"
              ? "Join CafeConnect to manage your food business"
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === "signup" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="businessName">Business Name</FieldLabel>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Biryani House"
                    required
                  />
                </Field>
              </FieldGroup>
            )}

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </Field>
            </FieldGroup>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Loading..." : mode === "signup" ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <hr className="h-px w-full bg-border" />
            <span className="text-center text-xs uppercase text-muted-foreground">
              Or continue with
            </span>
            <hr className="h-px w-full bg-border" />
          </div>

          <Button
            onClick={handleGoogleSignIn}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            Sign in with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup"
              ? "Already have an account?"
              : "Don't have an account?"}
            <button
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              className="font-medium text-primary hover:text-primary/90"
            >
              {mode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
