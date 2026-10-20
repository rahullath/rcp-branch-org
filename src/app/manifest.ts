import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/home",
    name: APP_NAME,
    short_name: "RCI Branch",
    description: "The branch's logistics: this week, who's going, what to bring, who follows up whom.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#d4161f",
    theme_color: "#e31b23",
    categories: ["productivity", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Inbox", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Events", url: "/events", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Log a contact", url: "/contacts?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Feedback", url: "/feedback", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
