export function BrandMark({
  className = "",
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  return (
    <span
      className={`brand-mark${light ? " light" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}
