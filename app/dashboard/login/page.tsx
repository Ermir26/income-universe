"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard/login", { method: "POST" })
      .then((res) => {
        if (res.ok) {
          router.push("/dashboard");
        } else {
          res.json().then((d) => setError(d.error ?? "Login failed"));
        }
      })
      .catch(() => setError("Network error"));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {"🦈"} Sharkline Admin
        </h1>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm text-slate-400">Signing in...</p>
        )}
      </div>
    </div>
  );
}
