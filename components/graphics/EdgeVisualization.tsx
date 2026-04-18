"use client";

import React from "react";

export default function EdgeVisualization() {
  const bars = [
    { x: 40, height: 90, label: "BK1" },
    { x: 110, height: 70, label: "BK2" },
    { x: 180, height: 130, label: "BK3" },
    { x: 250, height: 60, label: "BK4" },
    { x: 320, height: 85, label: "BK5" },
  ];

  const thresholdY = 80;
  const edgeBarIndex = 2; // BK3 crosses threshold

  return (
    <div className="w-full">
      <style>{`
        @keyframes bar-float-0 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes bar-float-1 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes bar-float-2 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes bar-float-3 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes bar-float-4 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .edge-bar-0 { animation: bar-float-0 3s ease-in-out infinite; }
        .edge-bar-1 { animation: bar-float-1 3.5s ease-in-out infinite 0.2s; }
        .edge-bar-2 { animation: bar-float-2 2.8s ease-in-out infinite 0.4s; }
        .edge-bar-3 { animation: bar-float-3 3.2s ease-in-out infinite 0.6s; }
        .edge-bar-4 { animation: bar-float-4 3.4s ease-in-out infinite 0.8s; }

        @keyframes edge-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .edge-pulse { animation: edge-pulse 1.5s ease-in-out infinite; }

        @keyframes flash-in {
          0% { opacity: 0; transform: translateY(5px); }
          20% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; }
          100% { opacity: 0.8; }
        }
        .edge-flash { animation: flash-in 2s ease-out infinite; }
      `}</style>
      <svg
        viewBox="0 0 400 200"
        role="img"
        aria-label="Edge detection visualization showing bookmaker odds bars with threshold analysis"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="edge-bar-default" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="edge-bar-active" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.6" />
          </linearGradient>
          <filter id="edge-green-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#22c55e" floodOpacity="0.5" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dark background */}
        <rect x="0" y="0" width="400" height="200" fill="#0a0a0f" rx="8" />

        {/* Grid lines */}
        {[40, 80, 120, 160].map((y) => (
          <line
            key={y}
            x1="20"
            y1={y}
            x2="380"
            y2={y}
            stroke="#ffffff"
            strokeWidth="0.3"
            opacity="0.1"
          />
        ))}

        {/* Threshold line */}
        <line
          x1="20"
          y1={thresholdY}
          x2="380"
          y2={thresholdY}
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeDasharray="6 3"
          opacity="0.7"
        />
        <text x="382" y={thresholdY + 4} fill="#f59e0b" fontSize="8" opacity="0.7">
          THR
        </text>

        {/* Bars */}
        {bars.map((bar, i) => {
          const isEdge = i === edgeBarIndex;
          const barY = 180 - bar.height;
          return (
            <g key={bar.label} className={`edge-bar-${i}`}>
              <rect
                x={bar.x}
                y={barY}
                width="30"
                height={bar.height}
                fill={isEdge ? "url(#edge-bar-active)" : "url(#edge-bar-default)"}
                rx="3"
                opacity={isEdge ? 1 : 0.7}
                filter={isEdge ? "url(#edge-green-glow)" : undefined}
                className={isEdge ? "edge-pulse" : undefined}
              />
              <text
                x={bar.x + 15}
                y="195"
                fill="#ffffff"
                fontSize="8"
                textAnchor="middle"
                opacity="0.5"
              >
                {bar.label}
              </text>
            </g>
          );
        })}

        {/* EDGE DETECTED label */}
        <g className="edge-flash">
          <rect x="140" y="12" width="120" height="22" rx="4" fill="#22c55e" opacity="0.15" />
          <text
            x="200"
            y="27"
            fill="#22c55e"
            fontSize="11"
            fontWeight="bold"
            textAnchor="middle"
            fontFamily="monospace"
          >
            EDGE DETECTED
          </text>
        </g>

        {/* Terminal header */}
        <text x="24" y="16" fill="#ffffff" fontSize="7" opacity="0.3" fontFamily="monospace">
          ODDS ANALYSIS TERMINAL
        </text>
      </svg>
    </div>
  );
}
