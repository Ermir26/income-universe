"use client";

import { useId } from "react";

interface SharkLogoProps {
  size?: number;
}

export default function SharkLogo({ size = 200 }: SharkLogoProps) {
  const uid = useId();
  const gradId = `shark-logo-grad-${uid}`;
  const glowId = `shark-logo-glow-${uid}`;
  const footballId = `football-grad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={footballId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feFlood floodColor="#3b82f6" floodOpacity="0.45" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${glowId})`}>
        {/* Shark body — facing right, dynamic pose with arm up */}
        <path
          d={[
            // Snout tip
            "M 145,72",
            // Upper jaw
            "L 130,68",
            // Forehead
            "L 112,56",
            // Dorsal fin peak
            "L 82,30",
            // Dorsal back slope
            "L 74,52",
            // Back
            "L 50,58",
            // Tail upper fork
            "L 28,38",
            // Tail notch
            "L 34,62",
            // Tail lower fork
            "L 22,82",
            // Tail to underbelly
            "L 48,72",
            // Body
            "L 64,80",
            // Arm raised up (right flipper) — holding football
            "L 78,68",
            "L 90,52",
            "L 96,42",
            // Hand area where football sits
            "L 100,38",
            // Arm return
            "L 96,46",
            "L 90,58",
            "L 84,70",
            "L 80,78",
            // Pectoral fin
            "L 96,102",
            "L 108,112",
            // Pectoral return
            "L 106,98",
            "L 100,88",
            // Lower jaw
            "L 130,80",
            "Z",
          ].join(" ")}
          fill={`url(#${gradId})`}
        />

        {/* Eye */}
        <path d="M 126,70 L 129,67 L 132,70 L 129,73 Z" fill="#0a0a0f" />
        <circle cx={128} cy={68.5} r={1} fill="#e2e8f0" />

        {/* Gill slits */}
        <line x1={110} y1={66} x2={107} y2={74} stroke="#0a0a0f" strokeWidth="1" opacity="0.25" strokeLinecap="round" />
        <line x1={105} y1={65} x2={102} y2={72} stroke="#0a0a0f" strokeWidth="1" opacity="0.2" strokeLinecap="round" />

        {/* Teeth */}
        <path d="M 136,76 L 138,73 L 140,76" fill="#e2e8f0" opacity="0.4" />
        <path d="M 140,77 L 142,74 L 144,77" fill="#e2e8f0" opacity="0.35" />
      </g>

      {/* Football — held in raised flipper */}
      <g>
        <ellipse cx="102" cy="36" rx="12" ry="7" fill={`url(#${footballId})`} transform="rotate(-20, 102, 36)" />
        {/* Laces */}
        <line x1="97" y1="33" x2="107" y2="29" stroke="#ffffff" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
        <line x1="99" y1="31" x2="100" y2="33" stroke="#ffffff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
        <line x1="102" y1="30" x2="103" y2="32" stroke="#ffffff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
        <line x1="105" y1="29.5" x2="106" y2="31.5" stroke="#ffffff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      </g>

      {/* End zone line */}
      <line x1="20" y1="120" x2="180" y2="120" stroke="#eab308" strokeWidth="2" opacity="0.15" />
      <text x="100" y="142" fill="#eab308" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace" opacity="0.12" letterSpacing="6">
        END ZONE
      </text>
    </svg>
  );
}
