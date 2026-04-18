"use client";

const NEBULAS = [
  { x: 15, y: 25, color: "rgba(56, 189, 248, 0.08)", size: 400 },
  { x: 70, y: 20, color: "rgba(167, 139, 250, 0.06)", size: 350 },
  { x: 40, y: 65, color: "rgba(74, 222, 128, 0.05)", size: 300 },
  { x: 85, y: 70, color: "rgba(251, 146, 60, 0.05)", size: 280 },
];

export default function NebulaBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {NEBULAS.map((nebula, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            left: `${nebula.x}%`,
            top: `${nebula.y}%`,
            width: `${nebula.size}px`,
            height: `${nebula.size}px`,
            background: `radial-gradient(circle, ${nebula.color}, transparent 70%)`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}
