export const metadata = {
  title: "CafeConnect — Food Business AI",
  description: "Multi-tenant food business SaaS with Gemini AI and WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
