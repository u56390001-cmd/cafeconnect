import "@/styles/globals.css";
import { Providers } from "@/components/providers";

export const metadata = {
  title: "CafeConnect — Food Business AI",
  description:
    "Multi-tenant food business SaaS with Gemini AI and WhatsApp integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
