import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  try {
    const { month } = await params;
    // month format: 2026-04
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid month format. Use YYYY-MM." }, { status: 400 });
    }

    const [, yearStr, monthStr] = match;
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const monthName = MONTH_NAMES[monthNum - 1] || monthStr;

    const startDate = `${month}-01`;
    const endMonth = monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
    const endDate = `${endMonth}-01`;

    const { data: picks } = await supabase
      .from("picks")
      .select("sport, game, pick, odds, tier, stake, result, profit, sent_at")
      .gte("sent_at", startDate)
      .lt("sent_at", endDate)
      .in("result", ["won", "lost", "push"])
      .order("sent_at", { ascending: true });

    if (!picks || picks.length === 0) {
      return NextResponse.json({ error: "No settled picks for this month." }, { status: 404 });
    }

    const wins = picks.filter((p) => p.result === "won").length;
    const losses = picks.filter((p) => p.result === "lost").length;
    const pushes = picks.filter((p) => p.result === "push").length;
    const totalProfit = picks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
    const totalWagered = picks.reduce((s, p) => s + (parseFloat(p.stake) || 1), 0);
    const roi = totalWagered > 0 ? +((totalProfit / totalWagered) * 100).toFixed(1) : 0;

    // Calculate opening/closing balance
    const { data: priorPicks } = await supabase
      .from("picks")
      .select("profit")
      .lt("sent_at", startDate)
      .in("result", ["won", "lost", "push"]);

    const openingBalance = 100 + (priorPicks ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
    const closingBalance = openingBalance + totalProfit;

    // Generate PDF
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();

    // Dark background
    doc.setFillColor(3, 3, 8);
    doc.rect(0, 0, w, doc.internal.pageSize.getHeight(), "F");

    // Header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text(`SHARK METHOD — ${monthName} ${year} Report`, 15, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("sharkline.ai", w - 15, 20, { align: "right" });

    // Separator
    doc.setDrawColor(30, 41, 59);
    doc.line(15, 25, w - 15, 25);

    // Summary section
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    const summaryY = 34;
    doc.text(`Opening Balance: ${openingBalance.toFixed(1)}u`, 15, summaryY);
    doc.text(`Closing Balance: ${closingBalance.toFixed(1)}u`, 85, summaryY);
    doc.text(`Record: ${wins}W-${losses}L${pushes > 0 ? `-${pushes}P` : ""}`, 155, summaryY);
    doc.text(`Net: ${totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}u`, 215, summaryY);
    doc.text(`ROI: ${roi}%`, 255, summaryY);

    // Table header
    const tableY = 44;
    doc.setFillColor(15, 23, 42);
    doc.rect(15, tableY - 4, w - 30, 8, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const cols = [15, 40, 60, 120, 165, 195, 215, 233, 250, 268];
    const headers = ["Date", "Sport", "Game", "Pick", "Odds", "Tier", "Stake", "Result", "P/L"];
    headers.forEach((h, i) => doc.text(h, cols[i], tableY));

    // Table rows
    doc.setFontSize(7);
    let y = tableY + 7;
    const maxY = doc.internal.pageSize.getHeight() - 15;

    for (const p of picks) {
      if (y > maxY) {
        doc.addPage();
        // Repeat dark bg
        doc.setFillColor(3, 3, 8);
        doc.rect(0, 0, w, doc.internal.pageSize.getHeight(), "F");
        y = 20;
        // Repeat header
        doc.setFillColor(15, 23, 42);
        doc.rect(15, y - 4, w - 30, 8, "F");
        doc.setTextColor(100, 116, 139);
        headers.forEach((h, i) => doc.text(h, cols[i], y));
        y += 7;
      }

      // Alternating row bg
      if (picks.indexOf(p) % 2 === 0) {
        doc.setFillColor(8, 10, 18);
        doc.rect(15, y - 3.5, w - 30, 6, "F");
      }

      doc.setTextColor(203, 213, 225);
      doc.text(p.sent_at?.slice(0, 10) ?? "", cols[0], y);
      doc.text((p.sport || "").slice(0, 12), cols[1], y);
      doc.text((p.game || "").slice(0, 35), cols[2], y);
      doc.text((p.pick || "").slice(0, 25), cols[3], y);
      doc.text(p.odds || "", cols[4], y);
      doc.text(p.tier || "", cols[5], y);
      doc.text(`${parseFloat(p.stake) || 1}u`, cols[6], y);

      const profit = parseFloat(p.profit) || 0;
      if (p.result === "won") doc.setTextColor(0, 255, 136);
      else if (p.result === "lost") doc.setTextColor(255, 68, 102);
      else doc.setTextColor(148, 163, 184);
      doc.text(p.result === "won" ? "Won" : p.result === "lost" ? "Lost" : "Push", cols[7], y);
      doc.text(`${profit >= 0 ? "+" : ""}${profit.toFixed(2)}u`, cols[8], y);

      y += 6;
    }

    // Footer
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.text("Generated by Sharkline — sharkline.ai", w / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

    const pdfBytes = doc.output("arraybuffer");
    const filename = `sharkline-${monthStr}-${yearStr}.pdf`;

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
