"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface SportRow {
  sport: string;
  win_rate: number;
  picks: number;
}

export default function SportChart({ data }: { data: SportRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis dataKey="sport" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={35} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value, _name, props) => [`${value}% (${(props as { payload: SportRow }).payload.picks} picks)`, "Win Rate"]}
        />
        <Bar dataKey="win_rate" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.win_rate >= 55 ? "#34d399" : d.win_rate >= 45 ? "#fbbf24" : "#f87171"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
