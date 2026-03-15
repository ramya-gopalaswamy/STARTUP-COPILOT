import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        abyssalBlack: "#010206",
        midnightTrench: "#050B14",
        biolumeTeal: "#00FFE5",
        electricJellyfish: "#7523FF",
        anglerfishAmber: "#FF8100",
      },
    },
  },
  plugins: [],
};

export default config;

