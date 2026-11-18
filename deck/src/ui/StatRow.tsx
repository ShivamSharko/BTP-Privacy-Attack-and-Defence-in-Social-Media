import type { Role } from "../styles/roles";

export interface StatItem {
  label: string;
  value: string;
  role?: Role;
  note?: string;
}

/** Large figures with small labels beneath. More than four items wrap onto a second row. */
export function StatRow({ items }: { items: StatItem[] }) {
  const wrap = items.length > 4;
  const cols = wrap ? Math.ceil(items.length / 2) : Math.max(items.length, 1);
  return (
    <div className="stats" data-wrap={wrap ? "true" : "false"} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div className="stat" data-stat="true" key={`${it.label}-${i}`}>
          <div
            className="stat__value"
            data-long={it.value.length > 14 ? "very" : it.value.length > 8 ? "true" : undefined}
            style={{ color: `var(--${it.role ?? "model"})` }}
          >
            {it.value}
          </div>
          <div className="stat__label">{it.label}</div>
          {it.note && <div className="stat__note">{it.note}</div>}
        </div>
      ))}
    </div>
  );
}
