import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://tusharf5.com",
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        return (
          pathname !== "/tushar-and-garima" &&
          !pathname.startsWith("/tushar-and-garima/")
        );
      },
    }),
  ],
});
