export const metadata = {
  title: "CafeConnect — Auth",
  description: "Sign in or create your food business account",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen flex items-center justify-center bg-gray-50">{children}</div>;
}
