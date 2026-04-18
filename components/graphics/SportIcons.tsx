"use client";

import React, { useId } from "react";

interface IconProps {
  size?: number;
}

export function SoccerIcon({ size = 80 }: IconProps) {
  const id = useId();
  const gradId = `soccer-grad-${id}`;
  const glowId = `soccer-glow-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Soccer ball icon" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="40" cy="40" r="36" fill={`url(#${gradId})`} filter={`url(#${glowId})`} />
      <polygon points="40,18 47,24 45,33 35,33 33,24" fill="#0a0a0f" opacity="0.6" />
      <polygon points="56,34 62,42 57,50 49,48 48,39" fill="#0a0a0f" opacity="0.6" />
      <polygon points="24,34 32,39 31,48 23,50 18,42" fill="#0a0a0f" opacity="0.6" />
      <polygon points="30,56 34,49 46,49 50,56 44,63" fill="#0a0a0f" opacity="0.5" />
      <polygon points="36,63 40,70 44,63 50,56 30,56" fill="#0a0a0f" opacity="0.3" />
      <line x1="40" y1="18" x2="40" y2="8" stroke="#0a0a0f" strokeWidth="1.5" opacity="0.4" />
      <line x1="56" y1="34" x2="64" y2="26" stroke="#0a0a0f" strokeWidth="1.5" opacity="0.4" />
      <line x1="24" y1="34" x2="16" y2="26" stroke="#0a0a0f" strokeWidth="1.5" opacity="0.4" />
      <line x1="23" y1="50" x2="16" y2="58" stroke="#0a0a0f" strokeWidth="1.5" opacity="0.4" />
      <line x1="57" y1="50" x2="64" y2="58" stroke="#0a0a0f" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

export function BasketballIcon({ size = 80 }: IconProps) {
  const id = useId();
  const gradId = `basketball-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Basketball icon" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="36" fill={`url(#${gradId})`} />
      <line x1="4" y1="40" x2="76" y2="40" stroke="#0a0a0f" strokeWidth="2" opacity="0.5" />
      <line x1="40" y1="4" x2="40" y2="76" stroke="#0a0a0f" strokeWidth="2" opacity="0.5" />
      <path d="M 12,14 Q 40,30 12,66" fill="none" stroke="#0a0a0f" strokeWidth="2" opacity="0.5" />
      <path d="M 68,14 Q 40,30 68,66" fill="none" stroke="#0a0a0f" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}

export function HockeyIcon({ size = 80 }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Hockey puck icon" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="48" rx="32" ry="12" fill="#1a1a2e" stroke="#06b6d4" strokeWidth="1.5" />
      <rect x="8" y="36" width="64" height="12" fill="#1a1a2e" />
      <ellipse cx="40" cy="36" rx="32" ry="12" fill="#2a2a3e" stroke="#06b6d4" strokeWidth="1.5" />
      <line x1="15" y1="36" x2="65" y2="36" stroke="#06b6d4" strokeWidth="0.5" opacity="0.3" />
      <circle cx="20" cy="22" r="1.5" fill="white" opacity="0.6" />
      <circle cx="55" cy="18" r="1" fill="white" opacity="0.5" />
      <circle cx="35" cy="15" r="1.2" fill="#06b6d4" opacity="0.4" />
      <circle cx="62" cy="25" r="0.8" fill="white" opacity="0.7" />
      <circle cx="14" cy="30" r="1" fill="#06b6d4" opacity="0.5" />
      <circle cx="48" cy="20" r="1.5" fill="white" opacity="0.4" />
      <circle cx="28" cy="26" r="0.7" fill="white" opacity="0.6" />
      <circle cx="68" cy="32" r="1.2" fill="#06b6d4" opacity="0.3" />
    </svg>
  );
}

export function BaseballIcon({ size = 80 }: IconProps) {
  const id = useId();
  const filterId = `baseball-shadow-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Baseball icon" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id={filterId}>
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <circle cx="40" cy="40" r="36" fill="#f5f5f0" filter={`url(#${filterId})`} />
      <path d="M 22,10 Q 18,20 18,30 Q 18,40 22,50 Q 26,60 30,68" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      <path d="M 58,10 Q 62,20 62,30 Q 62,40 58,50 Q 54,60 50,68" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="18" x2="24" y2="16" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="17" y1="24" x2="23" y2="22" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="17" y1="30" x2="23" y2="28" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="17" y1="36" x2="23" y2="34" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="18" y1="42" x2="24" y2="40" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="19" y1="48" x2="25" y2="46" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="22" y1="54" x2="28" y2="52" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="25" y1="60" x2="31" y2="58" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="62" y1="18" x2="56" y2="16" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="63" y1="24" x2="57" y2="22" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="63" y1="30" x2="57" y2="28" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="63" y1="36" x2="57" y2="34" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="62" y1="42" x2="56" y2="40" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="61" y1="48" x2="55" y2="46" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="58" y1="54" x2="52" y2="52" stroke="#dc2626" strokeWidth="1.2" />
      <line x1="55" y1="60" x2="49" y2="58" stroke="#dc2626" strokeWidth="1.2" />
    </svg>
  );
}

export function TennisIcon({ size = 80 }: IconProps) {
  const id = useId();
  const gradId = `tennis-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Tennis ball icon" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#84cc16" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="36" fill={`url(#${gradId})`} />
      <circle cx="40" cy="40" r="34" fill="none" stroke="#a3e635" strokeWidth="3" strokeDasharray="3 2" opacity="0.6" />
      <path d="M 10,26 Q 30,40 10,56" fill="none" stroke="#f5f5f0" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M 70,26 Q 50,40 70,56" fill="none" stroke="#f5f5f0" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function MMAIcon({ size = 80 }: IconProps) {
  const id = useId();
  const gradId = `mma-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="MMA icon" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <polygon points="40,6 62,16 72,38 62,60 40,70 18,60 8,38 18,16" fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinejoin="round" />
      <path d="M 30,48 L 30,36 Q 30,30 34,28 L 36,28 L 36,24 Q 36,22 38,22 L 39,22 L 39,24 L 39,22 Q 40,20 42,20 L 43,20 L 43,24 L 43,21 Q 44,19 46,20 L 47,20 L 47,26 Q 48,24 50,25 L 50,34 Q 50,40 48,44 L 46,48 Z" fill={`url(#${gradId})`} opacity="0.85" />
    </svg>
  );
}

export function TrophyIcon({ size = 80 }: IconProps) {
  const id = useId();
  const gradId = `trophy-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Trophy icon" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path d="M 26,16 L 54,16 L 52,42 Q 50,52 40,54 Q 30,52 28,42 Z" fill={`url(#${gradId})`} opacity="0.9" />
      <path d="M 26,16 Q 14,18 14,28 Q 14,36 26,36" fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" />
      <path d="M 54,16 Q 66,18 66,28 Q 66,36 54,36" fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" />
      <rect x="36" y="54" width="8" height="10" fill="#06b6d4" opacity="0.7" rx="1" />
      <rect x="28" y="64" width="24" height="4" fill="#8b5cf6" opacity="0.7" rx="2" />
    </svg>
  );
}
