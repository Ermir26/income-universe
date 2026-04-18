"use client";

import React from "react";

export default function SharkScene() {
  return (
    <div className="w-full">
      <style>{`
        @keyframes shark-celebrate {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-12px) rotate(-2deg); }
          75% { transform: translateY(-6px) rotate(1deg); }
        }
        .shark-celebrate { animation: shark-celebrate 3s ease-in-out infinite; }

        @keyframes football-spin {
          0% { transform: rotate(0deg) translateY(0); }
          30% { transform: rotate(180deg) translateY(-60px); }
          60% { transform: rotate(360deg) translateY(-30px); }
          100% { transform: rotate(540deg) translateY(0); }
        }
        .football-spin { animation: football-spin 2.5s ease-in-out infinite; transform-origin: center; }

        @keyframes confetti-fall-1 {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(80px) rotate(360deg); opacity: 0; }
        }
        @keyframes confetti-fall-2 {
          0% { transform: translateY(-30px) rotate(0deg); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(90px) rotate(-270deg); opacity: 0; }
        }
        .confetti-1 { animation: confetti-fall-1 3s ease-in infinite; }
        .confetti-2 { animation: confetti-fall-2 3.5s ease-in infinite 0.5s; }
        .confetti-3 { animation: confetti-fall-1 2.8s ease-in infinite 1s; }
        .confetti-4 { animation: confetti-fall-2 3.2s ease-in infinite 0.3s; }
        .confetti-5 { animation: confetti-fall-1 3.8s ease-in infinite 0.8s; }
        .confetti-6 { animation: confetti-fall-2 2.6s ease-in infinite 1.2s; }
        .confetti-7 { animation: confetti-fall-1 3.4s ease-in infinite 0.6s; }
        .confetti-8 { animation: confetti-fall-2 3s ease-in infinite 1.5s; }
        .confetti-9 { animation: confetti-fall-1 2.9s ease-in infinite 0.2s; }
        .confetti-10 { animation: confetti-fall-2 3.6s ease-in infinite 0.9s; }

        @keyframes glow-pulse {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.25; }
        }
        .endzone-glow { animation: glow-pulse 2s ease-in-out infinite; }

        @keyframes line-dash {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .yard-line { animation: line-dash 2s linear infinite; }

        @keyframes score-flash {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .score-flash { animation: score-flash 1.5s ease-in-out infinite; }

        @keyframes odds-drift {
          0%, 100% { opacity: 0.06; transform: translateX(0); }
          50% { opacity: 0.12; transform: translateX(8px); }
        }
        .odds-1 { animation: odds-drift 8s ease-in-out infinite; }
        .odds-2 { animation: odds-drift 10s ease-in-out infinite 2s; }
        .odds-3 { animation: odds-drift 7s ease-in-out infinite 4s; }
        .odds-4 { animation: odds-drift 9s ease-in-out infinite 1s; }
      `}</style>
      <svg
        viewBox="0 0 600 500"
        role="img"
        aria-label="Shark celebrating a touchdown in the end zone, spiking a football with confetti"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="shark-body-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="shark-belly-g" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="football-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="50%" stopColor="#78350f" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
          <linearGradient id="field-g" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#166534" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#14532d" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="endzone-glow-g" cx="50%" cy="80%" r="40%">
            <stop offset="0%" stopColor="#eab308" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
          </radialGradient>
          <filter id="shark-glow-f">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feFlood floodColor="#06b6d4" floodOpacity="0.35" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <rect x="0" y="0" width="600" height="500" fill="#0a0a0f" />

        {/* Floating odds in background */}
        <text className="odds-1" x="60" y="60" fill="#06b6d4" fontSize="13" fontFamily="monospace" opacity="0.07">+105</text>
        <text className="odds-2" x="480" y="80" fill="#3b82f6" fontSize="16" fontFamily="monospace" opacity="0.06">-110</text>
        <text className="odds-3" x="520" y="200" fill="#8b5cf6" fontSize="11" fontFamily="monospace" opacity="0.07">+250</text>
        <text className="odds-4" x="40" y="180" fill="#06b6d4" fontSize="14" fontFamily="monospace" opacity="0.06">O 47.5</text>

        {/* ═══ END ZONE FIELD ═══ */}
        {/* Field surface */}
        <rect x="50" y="340" width="500" height="140" rx="8" fill="url(#field-g)" />

        {/* End zone glow */}
        <ellipse className="endzone-glow" cx="300" cy="380" rx="200" ry="60" fill="url(#endzone-glow-g)" />

        {/* Yard lines */}
        <line x1="100" y1="340" x2="100" y2="480" stroke="#ffffff" strokeWidth="1" opacity="0.08" />
        <line x1="200" y1="340" x2="200" y2="480" stroke="#ffffff" strokeWidth="1" opacity="0.08" />
        <line x1="300" y1="340" x2="300" y2="480" stroke="#ffffff" strokeWidth="1.5" opacity="0.12" />
        <line x1="400" y1="340" x2="400" y2="480" stroke="#ffffff" strokeWidth="1" opacity="0.08" />
        <line x1="500" y1="340" x2="500" y2="480" stroke="#ffffff" strokeWidth="1" opacity="0.08" />

        {/* End zone text */}
        <text x="300" y="430" fill="#eab308" fontSize="42" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif" opacity="0.15" letterSpacing="18">
          END ZONE
        </text>

        {/* Goal line — thick */}
        <line x1="50" y1="340" x2="550" y2="340" stroke="#eab308" strokeWidth="3" opacity="0.3" />

        {/* Hash marks on field */}
        <line x1="230" y1="355" x2="230" y2="362" stroke="#ffffff" strokeWidth="1" opacity="0.06" />
        <line x1="370" y1="355" x2="370" y2="362" stroke="#ffffff" strokeWidth="1" opacity="0.06" />
        <line x1="230" y1="375" x2="230" y2="382" stroke="#ffffff" strokeWidth="1" opacity="0.06" />
        <line x1="370" y1="375" x2="370" y2="382" stroke="#ffffff" strokeWidth="1" opacity="0.06" />

        {/* ═══ CONFETTI ═══ */}
        <rect className="confetti-1" x="180" y="80" width="8" height="4" rx="1" fill="#eab308" opacity="0.7" />
        <rect className="confetti-2" x="350" y="60" width="6" height="10" rx="1" fill="#06b6d4" opacity="0.6" />
        <rect className="confetti-3" x="420" y="100" width="9" height="3" rx="1" fill="#ef4444" opacity="0.7" />
        <rect className="confetti-4" x="150" y="120" width="5" height="8" rx="1" fill="#3b82f6" opacity="0.65" />
        <rect className="confetti-5" x="480" y="70" width="7" height="5" rx="1" fill="#22c55e" opacity="0.6" />
        <rect className="confetti-6" x="250" y="50" width="4" height="9" rx="1" fill="#eab308" opacity="0.7" />
        <rect className="confetti-7" x="380" y="90" width="8" height="3" rx="1" fill="#8b5cf6" opacity="0.6" />
        <rect className="confetti-8" x="120" y="70" width="6" height="6" rx="1" fill="#f97316" opacity="0.65" />
        <rect className="confetti-9" x="300" y="40" width="5" height="7" rx="1" fill="#06b6d4" opacity="0.6" />
        <rect className="confetti-10" x="450" y="55" width="7" height="4" rx="1" fill="#ec4899" opacity="0.6" />

        {/* ═══ SHARK — standing upright, celebrating ═══ */}
        <g className="shark-celebrate" filter="url(#shark-glow-f)">
          {/* Body — upright shark, feet on the ground, leaning back triumphantly */}
          <path
            d={[
              // Left foot
              "M 260,338",
              // Left leg
              "L 262,310",
              "L 265,290",
              // Left hip
              "L 268,270",
              // Left torso
              "L 270,250",
              "L 272,230",
              "L 273,210",
              // Left shoulder area
              "L 274,195",
              // Left arm — raised up celebrating
              "L 262,180",
              "L 248,160",
              "L 240,145",
              "L 236,130",
              // Left fist/hand (holding nothing — right hand has ball)
              "L 234,124",
              "L 238,126",
              "L 242,135",
              "L 250,150",
              "L 260,168",
              "L 272,185",
              // Neck left
              "L 274,180",
              "L 276,170",
              // Head — left jaw
              "L 278,158",
              "L 280,148",
              // Snout
              "L 285,135",
              "L 290,126",
              "L 295,122",
              // Nose tip
              "L 300,120",
              // Right snout
              "L 305,122",
              "L 310,126",
              "L 315,135",
              // Head right
              "L 320,148",
              "L 322,158",
              // Neck right
              "L 324,170",
              "L 326,180",
              // Dorsal fin — on the shark's back/head
              "L 328,172",
              "L 332,155",
              "L 336,140",
              "L 338,130",
              "L 340,125",
              // Dorsal tip
              "L 338,124",
              // Dorsal back edge
              "L 334,132",
              "L 330,145",
              "L 326,162",
              "L 326,180",
              // Right shoulder
              "L 326,195",
              // Right arm — raised high, spiking the ball
              "L 338,168",
              "L 350,148",
              "L 358,132",
              "L 364,118",
              // Right hand/wrist (ball is here)
              "L 368,108",
              "L 370,104",
              // Arm back
              "L 366,110",
              "L 360,122",
              "L 352,138",
              "L 342,158",
              "L 332,178",
              "L 328,190",
              // Right torso
              "L 328,210",
              "L 327,230",
              "L 326,250",
              // Right hip
              "L 324,270",
              // Tail — sticking out behind
              "L 330,268",
              "L 342,262",
              "L 356,254",
              "L 366,248",
              // Upper tail fork
              "L 378,238",
              "L 384,232",
              // Tail notch
              "L 380,240",
              "L 376,248",
              // Lower tail fork
              "L 384,258",
              "L 378,264",
              // Tail base return
              "L 366,260",
              "L 350,266",
              "L 336,272",
              "L 326,276",
              // Right leg
              "L 330,290",
              "L 334,310",
              // Right foot
              "L 336,338",
              // Foot flat on ground
              "L 344,340",
              "L 336,342",
              "L 328,340",
              // Inner right leg
              "L 326,318",
              "L 322,298",
              "L 318,280",
              // Crotch
              "L 300,276",
              // Inner left leg
              "L 282,280",
              "L 278,298",
              "L 274,318",
              "L 272,340",
              // Left foot
              "L 264,342",
              "L 256,340",
              "L 260,338",
              "Z",
            ].join(" ")}
            fill="url(#shark-body-g)"
          />

          {/* Belly stripe */}
          <path
            d={[
              "M 290,140",
              "L 288,160",
              "L 286,180",
              "L 284,200",
              "L 284,220",
              "L 286,240",
              "L 290,260",
              "L 300,274",
              "L 310,260",
              "L 314,240",
              "L 316,220",
              "L 316,200",
              "L 314,180",
              "L 312,160",
              "L 310,140",
              "L 300,130",
              "Z",
            ].join(" ")}
            fill="url(#shark-belly-g)"
            opacity="0.4"
          />

          {/* Eyes — facing forward, fierce */}
          <ellipse cx="288" cy="142" rx="5" ry="6" fill="#0a0a0f" />
          <circle cx="289" cy="141" r="2" fill="#06b6d4" opacity="0.9" />
          <circle cx="290" cy="140" r="0.8" fill="#fff" opacity="0.6" />

          <ellipse cx="312" cy="142" rx="5" ry="6" fill="#0a0a0f" />
          <circle cx="311" cy="141" r="2" fill="#06b6d4" opacity="0.9" />
          <circle cx="310" cy="140" r="0.8" fill="#fff" opacity="0.6" />

          {/* Mouth — wide open grin */}
          <path
            d="M 284,156 Q 292,168 300,170 Q 308,168 316,156"
            fill="#0a0a0f"
            opacity="0.6"
          />
          {/* Teeth — top */}
          <path d="M 286,156 L 289,162 L 292,156" fill="#e2e8f0" opacity="0.5" />
          <path d="M 293,157 L 296,163 L 299,157" fill="#e2e8f0" opacity="0.55" />
          <path d="M 301,157 L 304,163 L 307,157" fill="#e2e8f0" opacity="0.55" />
          <path d="M 308,156 L 311,162 L 314,156" fill="#e2e8f0" opacity="0.5" />
          {/* Teeth — bottom */}
          <path d="M 290,164 L 293,158 L 296,164" fill="#cbd5e1" opacity="0.35" />
          <path d="M 298,165 L 300,159 L 302,165" fill="#cbd5e1" opacity="0.35" />
          <path d="M 304,164 L 307,158 L 310,164" fill="#cbd5e1" opacity="0.35" />

          {/* Gill slits — on neck */}
          <line x1="274" y1="180" x2="276" y2="192" stroke="#0a0a0f" strokeWidth="1.2" opacity="0.25" strokeLinecap="round" />
          <line x1="276" y1="178" x2="278" y2="190" stroke="#0a0a0f" strokeWidth="1.2" opacity="0.2" strokeLinecap="round" />
          <line x1="324" y1="180" x2="322" y2="192" stroke="#0a0a0f" strokeWidth="1.2" opacity="0.25" strokeLinecap="round" />
          <line x1="322" y1="178" x2="320" y2="190" stroke="#0a0a0f" strokeWidth="1.2" opacity="0.2" strokeLinecap="round" />

          {/* Pectoral fins as "shoulders" */}
          <path d="M 270,200 L 254,210 L 248,216 L 252,214 L 264,206 L 272,202" fill="url(#shark-body-g)" opacity="0.7" />
          <path d="M 330,200 L 346,210 L 352,216 L 348,214 L 336,206 L 328,202" fill="url(#shark-body-g)" opacity="0.7" />
        </g>

        {/* ═══ FOOTBALL — being spiked by right hand ═══ */}
        <g className="football-spin" style={{ transformOrigin: "370px 100px" }}>
          <ellipse cx="370" cy="100" rx="18" ry="10" fill="url(#football-g)" transform="rotate(-30, 370, 100)" />
          {/* Laces */}
          <line x1="364" y1="94" x2="376" y2="88" stroke="#ffffff" strokeWidth="1.5" opacity="0.7" strokeLinecap="round" />
          <line x1="366" y1="92" x2="367" y2="95" stroke="#ffffff" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
          <line x1="369" y1="91" x2="370" y2="94" stroke="#ffffff" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
          <line x1="372" y1="90" x2="373" y2="93" stroke="#ffffff" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
          {/* Points */}
          <ellipse cx="354" cy="106" rx="3" ry="1.5" fill="#451a03" transform="rotate(-30, 354, 106)" />
          <ellipse cx="386" cy="94" rx="3" ry="1.5" fill="#451a03" transform="rotate(-30, 386, 94)" />
        </g>

        {/* ═══ SCOREBOARD ═══ */}
        <g className="score-flash">
          <rect x="200" y="16" width="200" height="36" rx="6" fill="#0a0a0f" stroke="#eab308" strokeWidth="1" opacity="0.6" />
          <text x="300" y="40" fill="#eab308" fontSize="16" fontWeight="bold" textAnchor="middle" fontFamily="monospace" opacity="0.8">
            TOUCHDOWN!
          </text>
        </g>

        {/* Motion lines from the spike */}
        <line x1="370" y1="110" x2="375" y2="130" stroke="#eab308" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
        <line x1="380" y1="108" x2="390" y2="125" stroke="#eab308" strokeWidth="0.8" opacity="0.25" strokeLinecap="round" />
        <line x1="360" y1="112" x2="352" y2="128" stroke="#eab308" strokeWidth="0.8" opacity="0.25" strokeLinecap="round" />
      </svg>
    </div>
  );
}
