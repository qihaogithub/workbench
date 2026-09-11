import type { Config } from "tailwindcss";
import workbenchTailwindPreset from "../../tailwind.preset";

const config: Config = {
  presets: [workbenchTailwindPreset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../sketch-react/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
      },
    },
  },
  plugins: [],
};

export default config;
