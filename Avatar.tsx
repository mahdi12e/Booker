export default function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return src ? (
    <img className="avatar" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />
  ) : (
    <span className="avatar avatar--blank" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {initial}
    </span>
  );
}
