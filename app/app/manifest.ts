import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Squadjar",
    short_name: "Squadjar",
    description: "Ajo with your squad. Nobody holds the jar.",
    start_url: "/home",
    display: "standalone",
    background_color: "#f2eadb",
    theme_color: "#f2eadb",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
