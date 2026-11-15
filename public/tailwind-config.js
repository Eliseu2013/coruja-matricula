// ATENÇÃO (V8): este arquivo NÃO é mais carregado pelo site. O CSS agora é compilado com
// tailwind.config.cjs (npm run build:css). Ele fica só como referência do tema completo que
// nunca chegou a valer na página (o confirmacao-tailwind.js substituía esta configuração).
// Configuração de Tema do Tailwind CSS
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-container": "#e5eeff",
        "primary-fixed": "#dce1ff",
        "surface": "#f8f9ff",
        "surface-dim": "#cbdbf5",
        "surface-container-lowest": "#ffffff",
        "on-secondary-fixed": "#001943",
        "secondary-fixed-dim": "#afc6ff",
        "surface-bright": "#f8f9ff",
        "primary-container": "#1e3a8a",
        "on-error-container": "#93000a",
        "inverse-primary": "#b6c4ff",
        "secondary-fixed": "#d9e2ff",
        "primary": "#00236f",
        "surface-container-low": "#eff4ff",
        "surface-container-highest": "#d3e4fe",
        "surface-variant": "#d3e4fe",
        "tertiary": "#00312c",
        "outline-variant": "#c5c5d3",
        "error": "#ba1a1a",
        "secondary-container": "#6c9cff",
        "inverse-surface": "#213145",
        "on-tertiary-fixed": "#00201d",
        "inverse-on-surface": "#eaf1ff",
        "surface-container-high": "#dce9ff",
        "primary-fixed-dim": "#b6c4ff",
        "on-secondary-fixed-variant": "#004398",
        "on-background": "#0b1c30",
        "surface-tint": "#4059aa",
        "on-tertiary-fixed-variant": "#005049",
        "error-container": "#ffdad6",
        "on-secondary-container": "#003276",
        "tertiary-fixed": "#89f5e7",
        "tertiary-fixed-dim": "#6bd8cb",
        "on-tertiary": "#ffffff",
        "on-surface": "#0b1c30",
        "tertiary-container": "#004942",
        "on-primary-container": "#90a8ff",
        "outline": "#757682",
        "secondary": "#215aba",
        "on-primary-fixed-variant": "#264191",
        "on-secondary": "#ffffff",
        "on-surface-variant": "#444651",
        "on-primary-fixed": "#00164e",
        "on-primary": "#ffffff",
        "background": "#f8f9ff",
        "on-tertiary-container": "#4ebdb0",
        "on-error": "#ffffff"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        "space-xl": "2.5rem",
        "margin-mobile": "1rem",
        gutter: "1.5rem",
        "gutter-mobile": "1rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        margin: "2rem"
      },
      fontFamily: {
        "headline-xl-mobile": ["Inter", "sans-serif"],
        "title-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "headline-xl": ["Inter", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "display-lg": ["Inter", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "title-lg": ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"]
      },
      fontSize: {
        "headline-xl-mobile": ["22px", { lineHeight: "28px", fontWeight: "700" }],
        "title-md": ["16px", { lineHeight: "24px", fontWeight: "600" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        "headline-xl": ["28px", { lineHeight: "36px", fontWeight: "700" }],
        "body-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }],
        "display-lg": ["36px", { lineHeight: "44px", fontWeight: "700" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "title-lg": ["18px", { lineHeight: "26px", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "28px", fontWeight: "600" }]
      }
    }
  }
};
