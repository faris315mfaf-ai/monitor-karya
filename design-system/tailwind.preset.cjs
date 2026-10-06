/** Monitor Karya — preset Tailwind (v3/v4 config). Semua nilai menunjuk ke variabel CSS di tokens.css. */
module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "bg": "var(--bg)",
        "surface": "var(--surface)",
        "surface-2": "var(--surface-2)",
        "fill-1": "var(--fill-1)",
        "fill-2": "var(--fill-2)",
        "line": "var(--line)",
        "line-strong": "var(--line-strong)",
        "ink": "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "putih": "var(--putih)",
        "merah": "var(--merah)",
        "merah-fill": "var(--merah-fill)",
        "merah-soft": "var(--merah-soft)",
        "merah-tua": "var(--merah-tua)",
        "merah-cerah": "var(--merah-cerah)",
        "merah-dalam": "var(--merah-dalam)",
        "accent": "var(--accent)",
        "accent-fill": "var(--accent-fill)",
        "accent-soft": "var(--accent-soft)",
        "on-accent": "var(--on-accent)",
        "focus": "var(--focus)",
        "biru": "var(--biru)",
        "biru-fill": "var(--biru-fill)",
        "biru-soft": "var(--biru-soft)",
        "hijau": "var(--hijau)",
        "hijau-fill": "var(--hijau-fill)",
        "hijau-soft": "var(--hijau-soft)",
        "ungu": "var(--ungu)",
        "ungu-fill": "var(--ungu-fill)",
        "ungu-soft": "var(--ungu-soft)",
        "oranye": "var(--oranye)",
        "oranye-fill": "var(--oranye-fill)",
        "oranye-soft": "var(--oranye-soft)",
        "grafit": "var(--grafit)",
        "grafit-fill": "var(--grafit-fill)",
        "grafit-soft": "var(--grafit-soft)",
        "on-grafit": "var(--on-grafit)",
        "biru-cerah": "var(--biru-cerah)",
        "hijau-cerah": "var(--hijau-cerah)",
        "ungu-cerah": "var(--ungu-cerah)",
        "oranye-cerah": "var(--oranye-cerah)",
        "grafit-cerah": "var(--grafit-cerah)",
        "accent-cerah": "var(--accent-cerah)",
        "sukses": "var(--sukses)",
        "sukses-soft": "var(--sukses-soft)",
        "waspada": "var(--waspada)",
        "waspada-soft": "var(--waspada-soft)",
        "bahaya": "var(--bahaya)",
        "bahaya-soft": "var(--bahaya-soft)",
        "info": "var(--info)",
        "info-soft": "var(--info-soft)",
        "data-1": "var(--data-1)",
        "data-2": "var(--data-2)",
        "data-3": "var(--data-3)",
        "data-4": "var(--data-4)",
        "data-5": "var(--data-5)",
        "data-6": "var(--data-6)",
        "chart-idle": "var(--chart-idle)",
        "chart-grid": "var(--chart-grid)",
        "glass": "var(--glass)",
        "glass-tipis": "var(--glass-tipis)",
        "glass-tebal": "var(--glass-tebal)",
        "glass-sorot": "var(--glass-sorot)",
        "scrim": "var(--scrim)"
      },
      "spacing": {
        "1": "var(--space-1)",
        "2": "var(--space-2)",
        "3": "var(--space-3)",
        "4": "var(--space-4)",
        "5": "var(--space-5)",
        "6": "var(--space-6)",
        "8": "var(--space-8)",
        "10": "var(--space-10)",
        "12": "var(--space-12)",
        "16": "var(--space-16)"
      },
      "borderRadius": {
        "xs": "var(--radius-xs)",
        "sm": "var(--radius-sm)",
        "md": "var(--radius-md)",
        "lg": "var(--radius-lg)",
        "xl": "var(--radius-xl)",
        "full": "var(--radius-full)"
      },
      "boxShadow": {
        "card": "var(--shadow-card)",
        "float": "var(--shadow-float)",
        "sheet": "var(--shadow-sheet)",
        "control": "var(--shadow-control)",
        "glow": "var(--shadow-glow)"
      },
      "backgroundImage": {
        "grad-merah": "var(--grad-merah)",
        "grad-merah-teks": "var(--grad-merah-teks)",
        "grad-senja": "var(--grad-senja)",
        "grad-fajar": "var(--grad-fajar)",
        "grad-laut": "var(--grad-laut)",
        "grad-daun": "var(--grad-daun)",
        "grad-malam": "var(--grad-malam)",
        "aurora": "var(--aurora)",
        "kilau": "var(--kilau)"
      },
      "fontFamily": {
        "sans": [
          "var(--font-sans)"
        ],
        "display": [
          "var(--font-display)"
        ],
        "mono": [
          "var(--font-mono)"
        ]
      },
      "fontSize": {
        "display-xl": [
          "48px",
          {
            "lineHeight": "52px",
            "fontWeight": "700",
            "letterSpacing": "-0.03em"
          }
        ],
        "large-title": [
          "40px",
          {
            "lineHeight": "44px",
            "fontWeight": "700",
            "letterSpacing": "-0.025em"
          }
        ],
        "title-1": [
          "34px",
          {
            "lineHeight": "40px",
            "fontWeight": "700",
            "letterSpacing": "-0.02em"
          }
        ],
        "title-2": [
          "28px",
          {
            "lineHeight": "34px",
            "fontWeight": "700",
            "letterSpacing": "-0.02em"
          }
        ],
        "title-3": [
          "20px",
          {
            "lineHeight": "26px",
            "fontWeight": "600",
            "letterSpacing": "-0.01em"
          }
        ],
        "headline": [
          "17px",
          {
            "lineHeight": "24px",
            "fontWeight": "600",
            "letterSpacing": "-0.01em"
          }
        ],
        "body-lg": [
          "17px",
          {
            "lineHeight": "24px",
            "fontWeight": "400",
            "letterSpacing": "0"
          }
        ],
        "body": [
          "15px",
          {
            "lineHeight": "22px",
            "fontWeight": "400",
            "letterSpacing": "0"
          }
        ],
        "body-strong": [
          "15px",
          {
            "lineHeight": "22px",
            "fontWeight": "600",
            "letterSpacing": "0"
          }
        ],
        "callout": [
          "14px",
          {
            "lineHeight": "20px",
            "fontWeight": "500",
            "letterSpacing": "0"
          }
        ],
        "footnote": [
          "13px",
          {
            "lineHeight": "18px",
            "fontWeight": "400",
            "letterSpacing": "0"
          }
        ],
        "caption": [
          "12px",
          {
            "lineHeight": "16px",
            "fontWeight": "500",
            "letterSpacing": "0.01em"
          }
        ],
        "code": [
          "13px",
          {
            "lineHeight": "18px",
            "fontWeight": "500",
            "letterSpacing": "0"
          }
        ]
      },
      "transitionDuration": {
        "fast": "var(--dur-fast)",
        "base": "var(--dur-base)",
        "slow": "var(--dur-slow)",
        "data": "var(--dur-data)"
      },
      "transitionTimingFunction": {
        "standard": "var(--ease-standard)",
        "spring": "var(--ease-spring)",
        "exit": "var(--ease-exit)"
      },
      "zIndex": {
        "sticky": "10",
        "tabbar": "20",
        "scrim": "40",
        "sheet": "50",
        "toast": "60"
      },
      "screens": {
        "tablet": "600px",
        "desktop": "1024px",
        "wide": "1440px"
      },
      "maxWidth": {
        "content": "var(--content-max)"
      },
      "width": {
        "sidebar": "var(--sidebar-w)",
        "sheet": "var(--sheet-w)"
      }
    }
  },
  "darkMode": [
    "selector",
    "[data-theme=\"dark\"]"
  ]
};
