import { type ReactNode, useId } from "react";
import type { Role } from "../styles/roles";

/** Groups the inputs of a slide under its text. */
export function Controls({ children }: { children: ReactNode }) {
  return <div className="controls">{children}</div>;
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  format?(value: number): string;
}

export function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  const id = useId();
  const shown = format ? format(value) : String(value);
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="slider__value" htmlFor={id}>
        {shown}
      </output>
    </div>
  );
}

export interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}

/** Pick one of a few named options. */
export function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      <div className="choice__options">
        {options.map((option) => (
          <label className="choice__opt" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Button({
  onClick,
  children,
  kind = "primary",
}: {
  onClick(): void;
  children: ReactNode;
  kind?: "primary" | "quiet";
}) {
  return (
    <button type="button" className="btn" data-kind={kind} onClick={onClick}>
      {children}
    </button>
  );
}

/** A row of buttons. */
export function Buttons({ children }: { children: ReactNode }) {
  return <div className="btn-row">{children}</div>;
}

/** A live figure computed by the slide's simulation. */
export function Readout({ label, value, role }: { label: string; value: string; role?: Role }) {
  return (
    <div className="readout">
      <span className="readout__value" style={role ? { color: `var(--${role})` } : undefined}>
        {value}
      </span>
      <span className="readout__label">{label}</span>
    </div>
  );
}

/** A row of readouts. */
export function Readouts({ children }: { children: ReactNode }) {
  return (
    <div className="readouts" aria-live="polite">
      {children}
    </div>
  );
}
