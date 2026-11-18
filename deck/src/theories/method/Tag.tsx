import { Label, type LabelProps } from "../../world/kit";

/** A scene label that exists only while its view is the one on show; labels ignore group visibility. */
export function Tag({ on, ...props }: LabelProps & { on: boolean }) {
  return on ? <Label {...props} /> : null;
}
