import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plan B — Fieldday",
    short_name: "Plan B",
    description: "Plan A is your day. Plan B is what happens when it changes.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F4F0",
    theme_color: "#F5F4F0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
