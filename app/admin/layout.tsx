import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard | Sharkline",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#010208] text-slate-200">
      {children}
    </div>
  );
}
