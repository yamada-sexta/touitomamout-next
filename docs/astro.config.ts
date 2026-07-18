import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://yamada-sexta.github.io",
  base: "/touitomamout-next",
  integrations: [
    starlight({
      title: "Touitomamout",
      description:
        "Synchronize posts and profiles from X to Bluesky, Mastodon, Misskey, Discord, and Tumblr.",
      logo: {
        src: "./src/assets/touitomamout.svg",
        alt: "Touitomamout",
      },
      favicon: "/touitomamout.svg",
      customCss: ["./src/styles/custom.css"],
      expressiveCode: {
        defaultProps: {
          frame: "none",
        },
      },
      editLink: {
        baseUrl:
          "https://github.com/yamada-sexta/touitomamout-next/edit/main/docs/",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/yamada-sexta/touitomamout-next",
        },
      ],
      sidebar: [
        {
          label: "Documentation",
          items: ["getting-started", "configuration", "platform-support"],
        },
      ],
    }),
  ],
});
