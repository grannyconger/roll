// Design tokens. Every color in the app is defined here and nowhere else.
// Accent colors carry two values: one that passes contrast on the light surface,
// one that passes on the dark surface.
export const ACCENTS = {
  slate:  { label: "Slate",  onLight: "#475569", onDark: "#CBD5E1" },
  teal:   { label: "Teal",   onLight: "#0F766E", onDark: "#5EEAD4" },
  amber:  { label: "Amber",  onLight: "#92400E", onDark: "#FCD34D" },
  rose:   { label: "Rose",   onLight: "#9F1239", onDark: "#FDA4AF" },
  violet: { label: "Violet", onLight: "#6D28D9", onDark: "#C4B5FD" },
  sage:   { label: "Sage",   onLight: "#4D6B3C", onDark: "#B5CFA2" },
  sky:    { label: "Sky",    onLight: "#0369A1", onDark: "#7DD3FC" },
  sand:   { label: "Sand",   onLight: "#7C5E3C", onDark: "#E7D3B5" }
};

export const COLORS = {
  light: "#FAFAF7",
  lightText: "#16181D",
  lightMuted: "#4A4F59",
  dark: "#14171C",
  darkText: "#F4F4F0",
  darkMuted: "#B9BCC4",
  line: "#C9CCD2",
  up: "#0F766E",       // teal, always paired with the word Up or Bull and a triangle
  upOnDark: "#5EEAD4",
  down: "#92400E",     // amber, always paired with the word Down or Bear and a triangle
  downOnDark: "#FCD34D",
  focus: "#1D4ED8"
};

export function accentOnLight(key) {
  return (ACCENTS[key] || ACCENTS.slate).onLight;
}

export function accentOnDark(key) {
  return (ACCENTS[key] || ACCENTS.slate).onDark;
}

// Writes the color tokens as CSS custom properties so stylesheets never hardcode one.
export function applyColorTokens() {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(COLORS)) root.setProperty(`--${name}`, value);
}
