"use client";

import { useEffect, useState } from "react";
import RevenueChart from "@/components/dashboard/RevenueChart";

interface RevenueHistoryProps {
  planetId: string;
}

interface DataPoint {
  time: string;
  revenue: number;
}

export default function RevenueHistory({ planetId }: RevenueHistoryProps) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const res = await fetch(`/api/planets/${planetId}/revenue`);
        if (res.ok) {
          const json = await res.json();
          setData(json.data || []);
        }
      } catch {
        // silently fail — chart will show empty state
      } finally {
        setLoading(false);
      }
    };
    fetchRevenue();
  }, [planetId]);

  if (loading) {
    return (
      <div className="text-center py-6 text-slate-600 text-sm animate-pulse">
        Loading revenue data...
      </div>
    );
  }

  return <RevenueChart data={data} title="Planet Revenue" height={160} />;
}
