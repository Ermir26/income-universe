import { create } from "zustand";
import type { PipelineItem, Discovery } from "@/lib/supabase/types";

interface PipelineState {
  items: PipelineItem[];
  discoveries: Discovery[];
  currentStage: string | null;

  setItems: (items: PipelineItem[]) => void;
  setDiscoveries: (discoveries: Discovery[]) => void;
  addItem: (item: PipelineItem) => void;
  updateItem: (id: string, updates: Partial<PipelineItem>) => void;
  setCurrentStage: (stage: string | null) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  items: [],
  discoveries: [],
  currentStage: null,

  setItems: (items) => set({ items }),
  setDiscoveries: (discoveries) => set({ discoveries }),
  addItem: (item) =>
    set((state) => ({ items: [...state.items, item] })),
  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      ),
    })),
  setCurrentStage: (stage) => set({ currentStage: stage }),
}));
