"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type KeyStatus =
  | "not_configured"
  | "pending_validation"
  | "connected"
  | "error";

type Provider = "gemini" | "meta_whatsapp" | "qr_provider";

interface ApiKeyCardProps {
  title: string;
  description: string;
  provider: Provider;
  status: KeyStatus;
  placeholder: string;
  loading: boolean;
  onSave: (keyValue: string) => Promise<void>;
  footnote: string;
}

export function statusVariant(status: string) {
  switch (status) {
    case "connected":
      return "success" as const;
    case "pending_validation":
      return "default" as const;
    case "error":
    case "disconnected":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export function ApiKeyCard({
  title,
  description,
  provider,
  status,
  placeholder,
  loading,
  onSave,
  footnote,
}: ApiKeyCardProps) {
  const [value, setValue] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    await onSave(value.trim());
    setValue("");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <KeyRound className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="text-sm">
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusVariant(status)}>
            {status.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${provider}-key`}>API Key</FieldLabel>
              <Input
                id={`${provider}-key`}
                type="password"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={loading}
              />
              <FieldDescription>{footnote}</FieldDescription>
            </Field>
            <Button
              type="submit"
              disabled={loading || !value.trim()}
              className="w-full"
            >
              {loading ? "Saving..." : "Save Encrypted Key"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function SecurityNotice() {
  return (
    <Alert variant="success">
      <ShieldCheck className="size-4" />
      <AlertTitle>Security</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          <li>All API keys are encrypted server-side before storage</li>
          <li>Full keys are never returned to the browser</li>
          <li>Only masked hints (for example ••••••abcd) are shown</li>
          <li>Firebase Admin SDK authorizes all server-side access</li>
          <li>Tenant ID is validated on every request</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
