import type { Config } from "tailwindcss";
export default {
  content:["./app/**/*.{js,ts,jsx,tsx}","./components/**/*.{js,ts,jsx,tsx}"],
  theme:{extend:{
    // BoardUI sidebar tokens mapped to Selea without replacing app-wide colors.
    borderRadius:{"2lg":"10px"},
    fontSize:{"body-medium":["14px",{lineHeight:"20px",fontWeight:"500"}],"body-regular":["14px",{lineHeight:"20px"}],"caption-1-semibold":["12px",{lineHeight:"16px",fontWeight:"600"}]},
    boxShadow:{sidebar:"0 2px 4px #0003, 0 12px 24px #0002, inset 0 1px 0 #ffffff05","nav-selected":"0 1px 2px #0004, inset 0 1px 0 #ffffff0d"},
    fontFamily:{sans:["var(--font-sans)","Arial","sans-serif"],mono:["monospace"]},
    colors:{
      "background-secondary-default":"var(--sidebar)",
      "background-secondary-hover":"var(--surface-raised)",
      "background-full":"var(--bg)",
      "border-button-white":"var(--line)",
      "foreground-icon-secondary":"var(--muted)",
      "text-secondary":"var(--muted)","text-tertiary":"var(--subtle)","text-primary":"var(--text)",
      "badge-neutral-background":"var(--surface-raised)",
      accent:{400:"#555960",500:"#363b43",600:"#2c3037"},
      background:"hsl(var(--beui-background) / <alpha-value>)",
      foreground:"hsl(var(--beui-foreground) / <alpha-value>)",
      muted:{DEFAULT:"hsl(var(--beui-muted) / <alpha-value>)",foreground:"hsl(var(--beui-muted-foreground) / <alpha-value>)"},
      border:"hsl(var(--beui-border) / <alpha-value>)",
      primary:"hsl(var(--beui-foreground) / <alpha-value>)",
      ring:"hsl(var(--beui-ring) / <alpha-value>)",
    },
  }},plugins:[],
} satisfies Config;
