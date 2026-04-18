import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://sharkline.vercel.app", lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: "https://sharkline.vercel.app/public", lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: "https://sharkline.vercel.app/tipster", lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];
}
