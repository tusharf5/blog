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
        return ![
          "/tushar-and-garima",
          "/tushar-and-garima-shagun",
          "/tushar-and-garima-bride",
        ].some(
          (invitation) =>
            pathname === invitation || pathname.startsWith(`${invitation}/`),
        );
      },
    }),
  ],
});
