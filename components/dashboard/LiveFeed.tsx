"use client";

import { useEffect, useRef } from "react";
import { useFeedStore } from "@/store/feed";

const TYPE_COLORS: Record<string, string> = {
  revenue: "text-green-400",
  agent: "text-cyan-400",
  planet: "text-purple-400",
  scan: "text-yellow-400",
  system: "text-slate-400",
};

const TYPE_ICONS: Record<string, string> = {
  revenue: "💰",
  agent: "🤖",
  planet: "🪐",
  scan: "🔭",
  system: "⚙️",
};

export default function LiveFeed() {
  const { events } = useFeedStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="w-72 bg-slate-900/60 backdrop-blur-sm border-l border-slate-800 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-800">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Feed</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-xs font-mono">
        {events.length === 0 && (
          <div className="text-slate-600 text-center py-8">No events yet</div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className={`py-1.5 px-2 rounded ${
              event.type === "revenue" ? "bg-green-500/10" : ""
            }`}
          >
            <div className="flex items-start gap-1.5">
              <span>{TYPE_ICONS[event.type]}</span>
              <div className="flex-1 min-w-0">
                <span className={TYPE_COLORS[event.type]}>{event.message}</span>
                {event.amount && (
                  <span className="text-green-400 font-bold ml-1">
                    +${event.amount.toFixed(2)}
                  </span>
                )}
                {event.planetName && (
                  <div className="text-slate-600 text-[10px] truncate">
                    {event.planetName}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
