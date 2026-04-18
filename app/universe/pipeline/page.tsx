"use client";

import TopBar from "@/components/dashboard/TopBar";
import PipelineView from "@/components/pipeline/PipelineView";
import LiveFeed from "@/components/dashboard/LiveFeed";

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <PipelineView />
        </div>
        <LiveFeed />
      </div>
    </div>
  );
}
