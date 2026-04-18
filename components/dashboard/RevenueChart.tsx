"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@/components/ui/Card";

interface DataPoint {
  time: string;
  revenue: number;
}

interface RevenueChartProps {
  data: DataPoint[];
  title?: string;
  height?: number;
}

export default function RevenueChart({
  data,
  title = "Revenue Over Time",
  height = 200,
}: RevenueChartProps) {
  const formattedData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        time: new Date(d.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })),
    [data]
  );

  return (
    <Card className="p-4">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {data.length === 0 ? (
        <div
          className="flex items-center justify-center text-slate-600 text-sm"
          style={{ height }}
        >
          No revenue data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={formattedData}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="time"
              stroke="#475569"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              stroke="#475569"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
