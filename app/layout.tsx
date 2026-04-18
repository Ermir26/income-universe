import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sharkline.vercel.app"),
  title: {
    default: "Sharkline — AI Sports Picks with Blockchain-Verified Record",
    template: "%s | Sharkline",
  },
  description:
    "AI-powered sports betting picks verified on Polygon blockchain. Track record proven on-chain. Free Telegram channel + VIP subscription with edge detection using Pinnacle sharp lines, reverse line movement, and closing line value.",
  keywords: [
    "AI sports picks", "sports betting tips", "blockchain verified picks",
    "sharp sports betting", "Pinnacle sharp lines", "reverse line movement",
    "closing line value", "sports betting edge", "AI tipster", "verified tipster",
    "sports betting predictions", "NBA picks", "soccer predictions", "NHL picks",
    "MLB predictions", "tennis picks", "smart sports betting", "value betting",
    "expected value betting", "Telegram sports picks", "VIP sports tips",
    "proven track record betting", "on-chain verified picks", "Polygon blockchain betting",
  ],
  authors: [{ name: "Sharkline" }],
  creator: "Sharkline",
  publisher: "Sharkline",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://sharkline.vercel.app",
    siteName: "Sharkline",
    title: "Sharkline — AI Sports Picks, Blockchain Verified",
    description:
      "Every pick timestamped on-chain before kickoff. AI edge detection using Pinnacle sharp lines & reverse line movement. Free Telegram channel available.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Sharkline — AI Sports Picks" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sharkline — AI Sports Picks, Blockchain Verified",
    description:
      "Every pick timestamped on-chain before kickoff. AI edge detection with proven track record.",
    images: ["/opengraph-image"],
    creator: "@sharkline_ai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://sharkline.vercel.app",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Sharkline",
  description: "AI-powered sports picks with blockchain-verified track record",
  url: "https://sharkline.vercel.app",
  applicationCategory: "Sports",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "19",
    highPrice: "69",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#010208] text-slate-200">
        {children}
      </body>
    </html>
  );
}
