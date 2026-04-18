"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface Entry {
  balance: number;
  date: string;
}

export default function BankrollChart({ data }: { data: Entry[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}u`} />
        <Tooltip
          contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value) => [`${Number(value).toFixed(1)}u`, "Balance"]}
        />
        <ReferenceLine y={100} stroke="#475569" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
