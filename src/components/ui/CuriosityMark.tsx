/** Vector artwork keeps the same shape and color across system emoji fonts. */
export function CuriosityMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="11" strokeLinecap="round">
        <path d="M50 9V91M9 50H91M21 21L79 79M21 79L79 21" />
      </g>
    </svg>
  );
}
