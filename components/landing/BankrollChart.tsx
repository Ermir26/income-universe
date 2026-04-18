"use client";

import { useMemo } from "react";

interface BankrollChartProps {
  data: { date: string; units: number }[];
}

export default function BankrollChart({ data }: BankrollChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-64 rounded-lg border border-slate-800 text-slate-500 text-sm">
        No bankroll data available yet.
      </div>
    );
  }

  const PADDING = { top: 20, right: 20, bottom: 40, left: 55 };
  const VIEW_WIDTH = 800;
  const VIEW_HEIGHT = 360;
  const CHART_W = VIEW_WIDTH - PADDING.left - PADDING.right;
  const CHART_H = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const BASELINE = 100;

  const { cumulativeValues, yMin, yMax, lineColor, points, areaPath, linePath, totalLength } =
    useMemo(() => {
      // Build cumulative series starting at baseline
      let running = BASELINE;
      const cumulative = data.map((d) => {
        running += d.units;
        return running;
      });
      // Prepend the baseline as the starting point
      const allValues = [BASELINE, ...cumulative];

      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      // Add 5% vertical padding
      const range = max - min || 1;
      const yMinVal = min - range * 0.05;
      const yMaxVal = max + range * 0.05;

      const currentValue = allValues[allValues.length - 1];
      const color = currentValue >= BASELINE ? "#22c55e" : "#ef4444";

      // Map values to SVG coordinates
      const pts = allValues.map((val, i) => {
        const x = PADDING.left + (i / (allValues.length - 1)) * CHART_W;
        const y = PADDING.top + (1 - (val - yMinVal) / (yMaxVal - yMinVal)) * CHART_H;
        return { x, y };
      });

      // Build SVG line path
      const lPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

      // Build area path (closed polygon for gradient fill)
      const bottomY = PADDING.top + CHART_H;
      const aPath =
        lPath +
        ` L${pts[pts.length - 1].x},${bottomY}` +
        ` L${pts[0].x},${bottomY} Z`;

      // Approximate total path length for animation
      let len = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        len += Math.sqrt(dx * dx + dy * dy);
      }

      return {
        cumulativeValues: allValues,
        yMin: yMinVal,
        yMax: yMaxVal,
        lineColor: color,
        points: pts,
        areaPath: aPath,
        linePath: lPath,
        totalLength: Math.ceil(len),
      };
    }, [data]);

  // Y-axis tick marks
  const yTickCount = 5;
  const yTicks = useMemo(() => {
    const ticks: { value: number; y: number }[] = [];
    for (let i = 0; i <= yTickCount; i++) {
      const value = yMin + (i / yTickCount) * (yMax - yMin);
      const y = PADDING.top + (1 - (value - yMin) / (yMax - yMin)) * CHART_H;
      ticks.push({ value: Math.round(value * 10) / 10, y });
    }
    return ticks;
  }, [yMin, yMax]);

  // X-axis labels: show every Nth date
  const xLabels = useMemo(() => {
    // allValues has length data.length + 1 (baseline + each data point)
    // We label data points (indices 1..allValues.length-1 correspond to data[0..data.length-1])
    const total = data.length;
    if (total === 0) return [];

    const maxLabels = 8;
    const step = Math.max(1, Math.ceil(total / maxLabels));
    const labels: { label: string; x: number }[] = [];

    for (let i = 0; i < total; i += step) {
      // Point index in allValues is i+1
      const ptIdx = i + 1;
      const x = PADDING.left + (ptIdx / (cumulativeValues.length - 1)) * CHART_W;
      labels.push({ label: data[i].date, x });
    }

    return labels;
  }, [data, cumulativeValues]);

  // Grid lines
  const gridLinesY = yTicks.map((t) => t.y);
  const gridLinesX = xLabels.map((l) => l.x);

  const gradientId = "bankroll-gradient";
  const animationName = "bankroll-draw";

  return (
    <div className="w-full">
      <style>{`
        @keyframes ${animationName} {
          from {
            stroke-dashoffset: ${totalLength};
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes bankroll-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        role="img"
        aria-label="Bankroll chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {gridLinesY.map((y, i) => (
          <line
            key={`hgrid-${i}`}
            x1={PADDING.left}
            y1={y}
            x2={PADDING.left + CHART_W}
            y2={y}
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}

        {/* Vertical grid lines */}
        {gridLinesX.map((x, i) => (
          <line
            key={`vgrid-${i}`}
            x1={x}
            y1={PADDING.top}
            x2={x}
            y2={PADDING.top + CHART_H}
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}

        {/* Baseline reference line */}
        {(() => {
          const baseY =
            PADDING.top + (1 - (BASELINE - yMin) / (yMax - yMin)) * CHART_H;
          return (
            <line
              x1={PADDING.left}
              y1={baseY}
              x2={PADDING.left + CHART_W}
              y2={baseY}
              stroke="#334155"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })()}

        {/* Area fill under the line */}
        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
          style={{
            animation: "bankroll-fade-in 1.2s ease-out forwards",
            opacity: 0,
            animationDelay: "0.6s",
          }}
        />

        {/* Animated line */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength}
          style={{
            animation: `${animationName} 1.5s ease-out forwards`,
          }}
        />

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text
            key={`ylabel-${i}`}
            x={PADDING.left - 10}
            y={t.y + 4}
            textAnchor="end"
            fontSize={11}
            fill="#64748b"
            fontFamily="system-ui, sans-serif"
          >
            {t.value}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text
            key={`xlabel-${i}`}
            x={l.x}
            y={PADDING.top + CHART_H + 24}
            textAnchor="middle"
            fontSize={10}
            fill="#64748b"
            fontFamily="system-ui, sans-serif"
          >
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
