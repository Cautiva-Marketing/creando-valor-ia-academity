export function InvalidStyle({ size }: { size: number }) {
  return (
    <div style={{ marginTop: 12 }}>
      <span style={{ width: `${size}px` }} />
      <span style={{ fontSize: '14px' }} />
    </div>
  );
}
