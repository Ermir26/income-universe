import { create } from "zustand";
import type { AgentLog } from "@/lib/supabase/types";

interface FeedEvent {
  id: string;
  type: "agent" | "revenue" | "planet" | "scan" | "system";
  message: string;
  planetName?: string;
  galaxyColor?: string;
  amount?: number;
  timestamp: string;
}

interface FeedState {
  events: FeedEvent[];
  maxEvents: number;

  addEvent: (event: FeedEvent) => void;
  setEvents: (events: FeedEvent[]) => void;
  clear: () => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  events: [],
  maxEvents: 150,

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event].slice(-state.maxEvents),
    })),
  setEvents: (events) => set({ events: events.slice(-150) }),
  clear: () => set({ events: [] }),
}));

// Helper to convert AgentLog to FeedEvent
export function agentLogToFeedEvent(
  log: AgentLog,
  planetName?: string,
  galaxyColor?: string
): FeedEvent {
  return {
    id: log.id,
    type: log.revenue_generated > 0 ? "revenue" : "agent",
    message: `${log.agent_name}: ${log.action}`,
    planetName,
    galaxyColor,
    amount: log.revenue_generated > 0 ? log.revenue_generated : undefined,
    timestamp: log.created_at,
  };
}
