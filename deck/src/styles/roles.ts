/**
 * Colour roles. One meaning per colour, the same in HTML and in the 3D world:
 * honest users are sodium streetlight amber, protected signals are aqua, attackers are
 * hot pink-red, noise is lavender grey, the ledger is receipt green, the model is pale lilac.
 */
export type Role = "honest" | "protected" | "attacker" | "noise" | "ledger" | "model" | "muted";
export type Theme = "dark" | "light";

export const ROLES: Role[] = ["honest", "protected", "attacker", "noise", "ledger", "model", "muted"];

export const ROLE_HEX: Record<Theme, Record<Role, string>> = {
  dark: {
    honest: "#ffc66b",
    protected: "#5fe0cf",
    attacker: "#ff5c7a",
    noise: "#8f92b8",
    ledger: "#c9f26b",
    model: "#edebff",
    muted: "#5a5e8c",
  },
  light: {
    honest: "#a85f00",
    protected: "#00796b",
    attacker: "#c2185b",
    noise: "#6b6e8f",
    ledger: "#557000",
    model: "#2b2d5e",
    muted: "#a3a5c4",
  },
};

export const SURFACE_HEX: Record<Theme, Record<string, string>> = {
  dark: {
    dusk: "#1b1d3a",
    "dusk-2": "#2a2350",
    ink: "#edebff",
    "ink-soft": "#b9b7dd",
    rule: "rgba(237, 235, 255, 0.16)",
    slab: "rgba(20, 21, 46, 0.82)",
    scrim: "rgba(27, 29, 58, 0.92)",
  },
  light: {
    dusk: "#f6f4fb",
    "dusk-2": "#e4dff5",
    ink: "#1b1d3a",
    "ink-soft": "#4b4e78",
    rule: "rgba(27, 29, 58, 0.2)",
    slab: "rgba(255, 255, 255, 0.9)",
    scrim: "rgba(246, 244, 251, 0.94)",
  },
};

/** Writes the theme's colours as CSS custom properties on the root element. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  for (const role of ROLES) root.style.setProperty(`--${role}`, ROLE_HEX[theme][role]);
  for (const [name, value] of Object.entries(SURFACE_HEX[theme])) root.style.setProperty(`--${name}`, value);
}
