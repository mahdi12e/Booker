export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M8 46a24 24 0 0 1 48 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="8" cy="46" r="5" fill="var(--mark)" />
      <circle cx="32" cy="22" r="6" fill="currentColor" />
      <circle cx="56" cy="46" r="5" fill="var(--mark)" />
    </svg>
  );
}
