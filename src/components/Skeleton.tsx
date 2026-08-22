/* Loading performance kit: first-paint skeletons + progressive reveal. */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Static shimmer block used to sketch a layout before data lands. */
export function Skeleton({ w, h = 14, r = 6, className = "" }: { w?: number | string; h?: number; r?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ width: w ?? "100%", height: h, borderRadius: r }} />;
}

/**
 * Progressive loading: children mount only when the block scrolls near the
 * viewport (240px look-ahead), then reveal with a fade. Keeps below-the-fold
 * panels out of the initial render pass entirely.
 */
export function Progressive({ children, height = 180, delay = 0 }: { children: ReactNode; height?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setReady(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {ready ? (
        <div className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>{children}</div>
      ) : (
        <div className="space-y-2.5" aria-hidden>
          <Skeleton w={140} h={10} />
          <Skeleton h={height - 46} r={10} />
        </div>
      )}
    </div>
  );
}

/** Brief first-paint gate so a view's frame appears instantly, then settles. */
export function useBoot(ms = 420): boolean {
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return booting;
}
