import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NoTenantNotice() {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Business setup pending</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your account is not linked to a business yet. Complete the business
          setup to use this page.
        </p>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-primary hover:underline"
        >
          Go to business setup
        </Link>
      </CardContent>
    </Card>
  );
}
