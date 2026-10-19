"use client";

import { MessageCircle, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { statusVariant } from "./ApiKeyCard";

export type WhatsappMode = "meta" | "qr_trial";
export type WhatsappStatus =
  | "not_configured"
  | "pending_validation"
  | "connected"
  | "disconnected"
  | "error";

interface WhatsappModeCardProps {
  mode: WhatsappMode;
  status: WhatsappStatus;
  loading: boolean;
  onModeChange: (mode: WhatsappMode) => void;
  onSave: () => Promise<void>;
}

export function WhatsappModeCard({
  mode,
  status,
  loading,
  onModeChange,
  onSave,
}: WhatsappModeCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <MessageCircle className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp Connection</CardTitle>
              <CardDescription className="text-sm">
                Choose your WhatsApp provider mode
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusVariant(status)}>
            {status.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel id="whatsapp-mode-label">Provider Mode</FieldLabel>
            <ToggleGroup
              type="single"
              aria-labelledby="whatsapp-mode-label"
              value={mode}
              onValueChange={(value: string) => {
                if (value === "meta" || value === "qr_trial") {
                  onModeChange(value);
                }
              }}
            >
              <ToggleGroupItem value="meta">Meta Cloud API</ToggleGroupItem>
              <ToggleGroupItem value="qr_trial">7-Day QR Trial</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              The two modes are separate providers. A QR trial session is not
              equivalent to the official Meta Cloud API.
            </FieldDescription>
          </Field>

          {mode === "qr_trial" && (
            <Alert>
              <Clock className="size-4" />
              <AlertTitle>7-Day Trial</AlertTitle>
              <AlertDescription>
                Trial start and expiry are enforced server-side. A browser clock
                change cannot extend the trial.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={onSave}
            disabled={loading}
            className="w-full"
            variant="outline"
          >
            {loading ? "Saving..." : "Save WhatsApp Mode"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
