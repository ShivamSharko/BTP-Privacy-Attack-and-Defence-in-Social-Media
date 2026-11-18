export type KeyAction = "next" | "prev" | "first" | "last" | "overview" | "fullscreen" | "theme" | "reset" | "close";

export interface KeyTarget {
  /** Lower-case tag name of the focused element, or "" when nothing is focused. */
  tag: string;
  /** The input's type attribute, when the element is an input. */
  type?: string;
  role?: string | null;
  editable?: boolean;
}

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/**
 * What a key press means for the deck, given where the focus is. Controls keep their own
 * keys: arrows move a slider, a radio group or a tab list; Space and Enter press a button;
 * anything typed into a text field stays there.
 */
export function keyAction(key: string, target: KeyTarget, modifier = false): KeyAction | null {
  if (modifier) return null;
  const { tag, type, role, editable } = target;
  const textual = editable || tag === "textarea" || tag === "select" || (tag === "input" && type !== "range" && type !== "radio" && type !== "checkbox");
  if (textual) return key === "Escape" ? "close" : null;

  const ownsArrows = (tag === "input" && (type === "range" || type === "radio")) || role === "tab" || role === "slider";
  if (ownsArrows && ARROWS.has(key)) return null;
  const pressable = tag === "button" || tag === "a" || role === "tab" || (tag === "input" && (type === "radio" || type === "checkbox"));
  if (pressable && (key === " " || key === "Enter")) return null;

  switch (key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "o":
    case "O":
      return "overview";
    case "f":
    case "F":
      return "fullscreen";
    case "t":
    case "T":
      return "theme";
    case "r":
    case "R":
      return "reset";
    case "Escape":
      return "close";
    default:
      return null;
  }
}

export function describeTarget(element: Element | null): KeyTarget {
  if (!element) return { tag: "" };
  const html = element as HTMLElement;
  return {
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute("type") ?? undefined,
    role: element.getAttribute("role"),
    editable: html.isContentEditable === true,
  };
}
