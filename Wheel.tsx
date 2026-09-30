import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PostType } from './types';

/** Display order around the dial. POEM sits at the top when it is the default. */
export const WHEEL_ORDER: PostType[] = ['story', 'poem', 'book_part'];
const LABEL: Record<PostType, string> = { poem: 'POEM', story: 'STORY', book_part: 'BOOK PART' };
const HUB: Record<PostType, string> = { poem: 'in verse', story: 'in prose', book_part: 'in chapters' };

const N = WHEEL_ORDER.length;
const STEP_DEG = 56;
const PX_PER_ITEM = 90;

const mod = (n: number) => ((n % N) + N) % N;
/** Wraps an item offset into [-1.5, 1.5) so every item stays on the upper half of the dial. */
const wrap = (v: number) => mod(v + 1.5) - 1.5;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  value: PostType;
  onChange: (t: PostType) => void;
  disabled?: boolean;
  label?: string;
}

interface DragState {
  id: number;
  x: number;
  startPos: number;
  idx: number;
  moved: boolean;
  lastX: number;
  lastT: number;
  v: number;
}

export default function Wheel({ value, onChange, disabled, label = 'Content type' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ringRef = useRef<SVGGElement>(null);

  const startIdx = WHEEL_ORDER.indexOf(value);
  const posRef = useRef(startIdx); // continuous position, in items
  const targetRef = useRef(startIdx);
  const geo = useRef({ r: 130, cx: 190, cy: 164 });
  const animRaf = useRef(0);
  const drawRaf = useRef(0);
  const drag = useRef<DragState | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [size, setSize] = useState({ w: 380, h: 204 });

  // Positions are written straight to the DOM each frame: no React re-render while animating.
  const draw = useCallback(() => {
    const { r, cx, cy } = geo.current;
    const pos = posRef.current;
    const active = mod(Math.round(pos));
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const off = wrap(i - pos);
      const a = ((-90 + off * STEP_DEG) * Math.PI) / 180;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      const near = 1 - Math.min(1, Math.abs(off));
      const edge = Math.max(0, Math.abs(off) - 1.15) / 0.35;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.82 + 0.28 * near).toFixed(3)})`;
      el.style.opacity = String(Math.max(0, (0.55 + 0.45 * near) * (1 - edge)).toFixed(3));
      el.style.zIndex = String(Math.round(near * 10));
      el.dataset.active = i === active ? 'true' : 'false';
    });
    ringRef.current?.setAttribute('transform', `rotate(${(-pos * STEP_DEG).toFixed(2)} ${cx} ${cy})`);
  }, []);

  const scheduleDraw = useCallback(() => {
    if (drawRaf.current) return;
    drawRaf.current = requestAnimationFrame(() => {
      drawRaf.current = 0;
      draw();
    });
  }, [draw]);

  const animateTo = useCallback(
    (target: number) => {
      cancelAnimationFrame(animRaf.current);
      const from = posRef.current;
      const dist = target - from;
      if (Math.abs(dist) < 0.001 || reduceMotion()) {
        posRef.current = target;
        draw();
        return;
      }
      const dur = 320 + Math.min(1, Math.abs(dist)) * 120;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        posRef.current = from + dist * eased;
        draw();
        if (p < 1) animRaf.current = requestAnimationFrame(step);
      };
      animRaf.current = requestAnimationFrame(step);
    },
    [draw]
  );

  const settleTo = useCallback(
    (abs: number) => {
      targetRef.current = abs;
      animateTo(abs);
      onChangeRef.current(WHEEL_ORDER[mod(abs)]);
    },
    [animateTo]
  );

  const nearestAbs = (idx: number) => idx + N * Math.round((posRef.current - idx) / N);

  // Layout: measure the container and size the dial to fit.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(280, el.clientWidth);
      const r = Math.max(88, Math.min(150, (w - 132) / 2));
      const cy = r + 34;
      geo.current = { r, cx: w / 2, cy };
      const h = cy + 40;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    draw();
  }, [size, draw]);

  // Follow external changes to `value`.
  useEffect(() => {
    const idx = WHEEL_ORDER.indexOf(value);
    if (mod(Math.round(targetRef.current)) === idx) return;
    const abs = nearestAbs(idx);
    targetRef.current = abs;
    animateTo(abs);
  }, [value, animateTo]);

  useEffect(
    () => () => {
      cancelAnimationFrame(animRaf.current);
      cancelAnimationFrame(drawRaf.current);
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      startPos: posRef.current,
      idx: hit ? Number(hit.dataset.idx) : -1,
      moved: false,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      cancelAnimationFrame(animRaf.current);
      rootRef.current?.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = now;
    posRef.current = d.startPos - dx / PX_PER_ITEM;
    scheduleDraw();
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      // Project a little past release for flicks, but never skip more than one item.
      const projected = posRef.current - d.v * 2;
      const base = Math.round(d.startPos);
      settleTo(Math.min(base + 1, Math.max(base - 1, Math.round(projected))));
    } else if (!cancelled && d.idx >= 0) {
      settleTo(nearestAbs(d.idx));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let step = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step = -1;
    else return;
    e.preventDefault();
    const abs = Math.round(targetRef.current) + step;
    settleTo(abs);
    requestAnimationFrame(() => itemRefs.current[mod(abs)]?.focus({ preventScroll: true }));
  };

  const { w, h } = size;
  const { r, cx, cy } = geo.current;

  return (
    <div
      ref={rootRef}
      className="wheel"
      style={{ height: h }}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onKeyDown={onKeyDown}
    >
      <svg className="wheel__svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
        <circle className="wheel__rim" cx={cx} cy={cy} r={r} />
        <g ref={ringRef}>
          <circle className="wheel__ticks" cx={cx} cy={cy} r={r - 18} />
          <circle className="wheel__ticks wheel__ticks--outer" cx={cx} cy={cy} r={r + 20} />
        </g>
        <path className="wheel__notch" d={`M${cx - 6} ${cy - r + 46} L${cx + 6} ${cy - r + 46} L${cx} ${cy - r + 34} Z`} />
      </svg>

      {WHEEL_ORDER.map((t, i) => (
        <button
          key={t}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === t}
          tabIndex={value === t ? 0 : -1}
          data-idx={i}
          disabled={disabled}
          className="wheel__item"
          onClick={(e) => {
            // Pointer taps are handled on pointer-up; this covers keyboard and assistive-tech activation.
            if (e.detail === 0) settleTo(nearestAbs(i));
          }}
        >
          {LABEL[t]}
        </button>
      ))}

      <div className="wheel__hub" aria-hidden="true">
        {HUB[value]}
      </div>
    </div>
  );
}
