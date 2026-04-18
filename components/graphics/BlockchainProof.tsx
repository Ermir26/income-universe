"use client";

import React from "react";

interface BlockchainProofProps {
  txHashes?: string[];
}

const placeholderHashes = [
  "0x8a2e...4f1c",
  "0x3b7d...a9e2",
  "0xf1c4...7d3b",
  "0x92ae...1f8c",
  "0x5d6f...b2a7",
];

export default function BlockchainProof({ txHashes }: BlockchainProofProps) {
  const hashes = txHashes && txHashes.length > 0 ? txHashes : placeholderHashes;
  const displayHashes = hashes.slice(0, 5);

  const blockWidth = 90;
  const blockHeight = 40;
  const gap = 20;
  const startX = 10;
  const blockY = 30;
  const totalWidth = displayHashes.length * (blockWidth + gap) - gap + startX * 2;

  return (
    <div className="w-full">
      <style>{`
        @keyframes chain-flow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .chain-link {
          animation: chain-flow 1s linear infinite;
        }
      `}</style>
      <svg
        viewBox={`0 0 ${totalWidth} 110`}
        role="img"
        aria-label="Blockchain verification proof showing transaction hashes linked in a chain"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="block-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {displayHashes.map((hash, i) => {
          const x = startX + i * (blockWidth + gap);

          return (
            <g key={i}>
              {/* Connecting line to next block */}
              {i < displayHashes.length - 1 && (
                <line
                  x1={x + blockWidth}
                  y1={blockY + blockHeight / 2}
                  x2={x + blockWidth + gap}
                  y2={blockY + blockHeight / 2}
                  stroke="#8b5cf6"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  className="chain-link"
                  opacity="0.6"
                />
              )}

              {/* Block rectangle */}
              <rect
                x={x}
                y={blockY}
                width={blockWidth}
                height={blockHeight}
                rx="6"
                fill="url(#block-grad)"
                stroke="#8b5cf6"
                strokeWidth="1"
                opacity="0.8"
              />

              {/* Hash text */}
              <text
                x={x + blockWidth / 2}
                y={blockY + blockHeight / 2 + 4}
                fill="#e2e8f0"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {hash}
              </text>

              {/* Block number */}
              <text
                x={x + blockWidth / 2}
                y={blockY - 6}
                fill="#8b5cf6"
                fontSize="7"
                fontFamily="monospace"
                textAnchor="middle"
                opacity="0.6"
              >
                BLOCK #{i + 1}
              </text>
            </g>
          );
        })}

        {/* Verified on Polygon badge */}
        <rect
          x={totalWidth / 2 - 70}
          y={85}
          width={140}
          height={20}
          rx="10"
          fill="#8b5cf6"
          opacity="0.15"
        />
        <text
          x={totalWidth / 2}
          y={98}
          fill="#8b5cf6"
          fontSize="9"
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="monospace"
        >
          Verified on Polygon
        </text>
      </svg>
    </div>
  );
}
