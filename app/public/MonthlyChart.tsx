"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

interface MonthlyPL {
  month: string;
  profit: number;
  units: number;
}

export default function MonthlyChart({ data }: { data: MonthlyPL[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: d.month.length >= 7
      ? new Date(d.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : d.month,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}u`} />
        <Tooltip
          contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value) => [`${Number(value).toFixed(1)}u`, "P/L"]}
        />
        <ReferenceLine y={0} stroke="#475569" />
        <Bar dataKey="units" radius={[4, 4, 0, 0]}>
          {formatted.map((d, i) => (
            <Cell key={i} fill={d.units >= 0 ? "#34d399" : "#f87171"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
