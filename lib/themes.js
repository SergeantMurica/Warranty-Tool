/*
 * Theme catalogue.
 *
 * Theme colours and picker labels used by the popup.
 *
 * META is the default and is declared on bare `:root`, so the popup paints
 * correctly even before any JavaScript runs.
 */

export const DEFAULT_THEME = "meta";

export const THEMES = [
  {
    id: "meta",
    name: "Meta",
    bg: "#080708",
    panel: "#151214",
    line: "#35242b",
    text: "#f3edef",
    muted: "#a79aa0",
    accent: "#dd213e",
    secondary: "#762536",
    orange: "#ff715b",
    onAccent: "#ffffff",
  },
  {
    id: "nightreaper",
    name: "Nightreaper",
    bg: "#080b09",
    panel: "#151b16",
    line: "#29362c",
    text: "#f0f7ee",
    muted: "#9eaea0",
    accent: "#b7f52a",
    secondary: "#25b96f",
    orange: "#e46b75",
    onAccent: "#10160a",
  },
  {
    id: "hyperbeast",
    name: "Hyperbeast",
    bg: "#13091d",
    panel: "#261332",
    line: "#4e2857",
    text: "#fff0fb",
    muted: "#d0a7d0",
    accent: "#fa3fc4",
    secondary: "#23dce5",
    orange: "#c2ed35",
    onAccent: "#18091d",
  },
  {
    id: "phoenix",
    name: "Phoenix",
    bg: "#11152e",
    panel: "#20274b",
    line: "#46456d",
    text: "#fff1d8",
    muted: "#beb9cf",
    accent: "#ff8a3d",
    secondary: "#32c6d0",
    orange: "#ed4d76",
    onAccent: "#24150e",
  },
  {
    id: "gray",
    name: "Gray",
    bg: "#303236",
    panel: "#414448",
    line: "#5b5f64",
    text: "#f1f2f3",
    muted: "#b9bdc1",
    accent: "#c5c9cd",
    secondary: "#858b91",
    orange: "#e2e4e6",
    onAccent: "#17191b",
  },
  {
    id: "black",
    name: "Black",
    bg: "#000000",
    panel: "#0b0b0b",
    line: "#252525",
    text: "#ffffff",
    muted: "#8d8d8d",
    accent: "#f2f2f2",
    secondary: "#777777",
    orange: "#b7b7b7",
    onAccent: "#111111",
  },
  {
    id: "white",
    name: "White",
    bg: "#f7f7f5",
    panel: "#ffffff",
    line: "#d7d7d4",
    text: "#171717",
    muted: "#686868",
    accent: "#202020",
    secondary: "#a0a0a0",
    orange: "#777777",
    onAccent: "#ffffff",
  },
];

export function isTheme(id) {
  return THEMES.some((t) => t.id === id);
}
