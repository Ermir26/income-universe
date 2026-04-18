"use client";

import { useState, useRef, useEffect } from "react";

interface MasterCommandProps {
  onCommand: (command: string) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "scan for new opportunities",
  "pause all agents",
  "resume all agents",
  "show revenue report",
  "boost top performers",
  "run optimizer",
  "deploy seed planets",
];

export default function MasterCommand({
  onCommand,
  disabled,
}: MasterCommandProps) {
  const [value, setValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.length > 0
    ? SUGGESTIONS.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase())
      )
    : SUGGESTIONS;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const submit = (cmd: string) => {
    onCommand(cmd);
    setValue("");
    setShowSuggestions(false);
  };

  return (
    <div className="relative px-6 py-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              submit(value.trim());
            }
            if (e.key === "Escape") {
              setShowSuggestions(false);
              inputRef.current?.blur();
            }
          }}
          disabled={disabled}
          placeholder="Command the universe... (⌘K)"
          className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 font-mono"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono">
          ⌘K
        </div>
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div className="absolute left-6 right-6 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden z-50 shadow-xl">
          {filtered.map((suggestion) => (
            <button
              key={suggestion}
              onMouseDown={() => submit(suggestion)}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-cyan-400 transition-colors font-mono"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
