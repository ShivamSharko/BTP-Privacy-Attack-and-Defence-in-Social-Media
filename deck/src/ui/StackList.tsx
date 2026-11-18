export function StackList({ items }: { items: { name: string; role: string }[] }) {
  return (
    <dl className="stack">
      {items.map((it, i) => (
        <div className="stack__row" key={`${it.name}-${i}`}>
          <dt>{it.name}</dt>
          <dd>{it.role}</dd>
        </div>
      ))}
    </dl>
  );
}
