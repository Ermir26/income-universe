import { ImageResponse } from "next/og";

export const alt = "Sharkline — AI Sports Picks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#0a0a0f",
          fontFamily: "sans-serif",
          padding: "60px",
          gap: "60px",
        }}
      >
        {/* Left — Shark with football SVG */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "320px",
            height: "400px",
            flexShrink: 0,
          }}
        >
          <svg
            width="280"
            height="340"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="og-sg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="50%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="og-fb" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#92400e" />
                <stop offset="100%" stopColor="#78350f" />
              </linearGradient>
            </defs>
            {/* Shark facing right, flipper raised with football */}
            <path
              d="M 145,72 L 130,68 L 112,56 L 82,30 L 74,52 L 50,58 L 28,38 L 34,62 L 22,82 L 48,72 L 64,80 L 78,68 L 90,52 L 96,42 L 100,38 L 96,46 L 90,58 L 84,70 L 80,78 L 96,102 L 108,112 L 106,98 L 100,88 L 130,80 Z"
              fill="url(#og-sg)"
            />
            <path d="M 126,70 L 129,67 L 132,70 L 129,73 Z" fill="#0a0a0f" />
            <circle cx="128" cy="68.5" r="1" fill="#e2e8f0" />
            <path d="M 136,76 L 138,73 L 140,76" fill="#e2e8f0" opacity="0.4" />
            <path d="M 140,77 L 142,74 L 144,77" fill="#e2e8f0" opacity="0.35" />
            {/* Football */}
            <ellipse cx="102" cy="36" rx="12" ry="7" fill="url(#og-fb)" transform="rotate(-20, 102, 36)" />
            <line x1="97" y1="33" x2="107" y2="29" stroke="#ffffff" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
            <line x1="99" y1="31" x2="100" y2="33" stroke="#ffffff" strokeWidth="0.8" opacity="0.5" />
            <line x1="102" y1="30" x2="103" y2="32" stroke="#ffffff" strokeWidth="0.8" opacity="0.5" />
            <line x1="105" y1="29.5" x2="106" y2="31.5" stroke="#ffffff" strokeWidth="0.8" opacity="0.5" />
            {/* End zone */}
            <line x1="20" y1="120" x2="180" y2="120" stroke="#eab308" strokeWidth="2" opacity="0.15" />
          </svg>
        </div>

        {/* Right — Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 800,
              background: "linear-gradient(135deg, #6366f1, #06b6d4)",
              backgroundClip: "text",
              color: "transparent",
              marginBottom: 12,
              letterSpacing: "-2px",
            }}
          >
            Sharkline
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "#94a3b8",
              marginBottom: 48,
              letterSpacing: "1px",
            }}
          >
            AI Sports Picks — Blockchain Verified
          </div>
          <div style={{ display: "flex", flexDirection: "row", gap: 24 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 36px",
                borderRadius: 16,
                border: "1px solid #1e293b",
                backgroundColor: "rgba(99, 102, 241, 0.08)",
              }}
            >
              <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#6366f1", marginBottom: 6 }}>68%+</div>
              <div style={{ display: "flex", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "2px" }}>Win Rate</div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 36px",
                borderRadius: 16,
                border: "1px solid #1e293b",
                backgroundColor: "rgba(6, 182, 212, 0.08)",
              }}
            >
              <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#06b6d4", marginBottom: 6 }}>1,200+</div>
              <div style={{ display: "flex", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "2px" }}>Total Picks</div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 36px",
                borderRadius: 16,
                border: "1px solid #1e293b",
                backgroundColor: "rgba(99, 102, 241, 0.06)",
              }}
            >
              <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>On-Chain</div>
              <div style={{ display: "flex", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "2px" }}>Verified</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
