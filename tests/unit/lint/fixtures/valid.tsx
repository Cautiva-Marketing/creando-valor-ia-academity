// Valid: only design tokens, arbitrary variants and Tailwind v4 variable shorthand.
export function Valid({ value }: { value: number }) {
  return (
    <div className="bg-surface text-text p-4 rounded-md shadow-sm">
      <button className="data-[state=open]:bg-primary aria-[invalid=true]:border-danger group-[.is-active]:text-accent-strong">
        Abrir
      </button>
      <div className="h-(--radix-select-trigger-height) has-[>svg]:px-3 peer-[:checked]:font-semibold" />
      <div
        style={{ color: 'var(--color-text)', '--progress': `${value}%` } as React.CSSProperties}
      />
      <a href="#contenido">Saltar al contenido</a>
    </div>
  );
}
