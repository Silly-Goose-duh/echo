"use client";

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  /** Fade the layer in while the assistant is speaking. */
  active: boolean;
};

const VB_WIDTH = 1440;
const VB_HEIGHT = 320;
/** Divides VB_WIDTH exactly, so the 200%-wide strip loops seamlessly. */
const WAVELENGTH = 720;

/** Deterministic sine path (no randomness → SSR-safe markup). */
function wavePath(
  amplitude: number,
  phase: number,
  baseline: number,
  fill: boolean,
): string {
  const step = 15;
  let d = "";
  for (let x = 0; x <= VB_WIDTH; x += step) {
    const y =
      baseline + Math.sin((x / WAVELENGTH) * Math.PI * 2 + phase) * amplitude;
    d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)} `;
  }
  return fill ? `${d}L${VB_WIDTH} ${VB_HEIGHT} L0 ${VB_HEIGHT} Z` : d.trim();
}

type Layer = {
  id: string;
  /** Vertical band the wave occupies, as CSS values. */
  bottom: string;
  height: string;
  amplitude: number;
  phase: number;
  baseline: number;
  /** Seconds for one full horizontal loop. */
  drift: number;
  reverse?: boolean;
  bob: number;
  bobDelay: number;
  opacity: number;
  blur?: number;
  fill?: [string, string, string];
  stroke?: string;
  strokeWidth?: number;
};

/** Back-to-front: broad translucent swells, then bright crest lines. */
const LAYERS: Layer[] = [
  {
    id: "swell",
    bottom: "-10%",
    height: "96%",
    amplitude: 40,
    phase: 0,
    baseline: 120,
    drift: 32,
    bob: 13,
    bobDelay: 0,
    opacity: 0.5,
    blur: 22,
    fill: ["#2a51c8", "#3d6ef5", "#3d6ef5"],
  },
  {
    id: "deep",
    bottom: "-6%",
    height: "72%",
    amplitude: 34,
    phase: Math.PI * 0.55,
    baseline: 140,
    drift: 26,
    reverse: true,
    bob: 11,
    bobDelay: 0.6,
    opacity: 0.72,
    blur: 6,
    fill: ["#3257d8", "#4f7dff", "#638cff"],
  },
  {
    id: "mid",
    bottom: "-4%",
    height: "56%",
    amplitude: 26,
    phase: Math.PI * 1.15,
    baseline: 135,
    drift: 19,
    bob: 9,
    bobDelay: 1.1,
    opacity: 0.78,
    fill: ["#4470ff", "#7ea6ff", "#7ee0b8"],
  },
  {
    id: "near",
    bottom: "-8%",
    height: "40%",
    amplitude: 18,
    phase: Math.PI * 1.7,
    baseline: 160,
    drift: 14,
    reverse: true,
    bob: 7,
    bobDelay: 1.9,
    opacity: 0.8,
    fill: ["#638cff", "#9dbcff", "#7ee0b8"],
  },
  {
    id: "line-a",
    bottom: "12%",
    height: "62%",
    amplitude: 34,
    phase: Math.PI * 0.25,
    baseline: 160,
    drift: 22,
    reverse: true,
    bob: 10,
    bobDelay: 0.4,
    opacity: 0.85,
    stroke: "#a8c4ff",
    strokeWidth: 1.75,
  },
  {
    id: "line-b",
    bottom: "34%",
    height: "56%",
    amplitude: 26,
    phase: Math.PI * 1.1,
    baseline: 160,
    drift: 30,
    bob: 12,
    bobDelay: 1.1,
    opacity: 0.6,
    stroke: "#7ee0b8",
    strokeWidth: 1.4,
  },
  {
    id: "line-c",
    bottom: "54%",
    height: "50%",
    amplitude: 30,
    phase: Math.PI * 1.65,
    baseline: 160,
    drift: 38,
    reverse: true,
    bob: 14,
    bobDelay: 2.2,
    opacity: 0.42,
    stroke: "#8fb0ff",
    strokeWidth: 1.25,
  },
];

export function SpeakingWaves({ active }: Props) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="speaking-waves"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.85, ease: "easeInOut" }}
        >
          {/* Deep blue wash so the waves have something to sit in */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(12,20,52,0) 0%, rgba(16,32,90,0.55) 45%, rgba(23,45,120,0.75) 100%)",
            }}
          />

          {/* Soft blue aura behind the orb */}
          <div
            className="echo-aura absolute left-1/2 top-1/2 h-[130vmin] w-[130vmin] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(61,110,245,0.42) 0%, rgba(99,140,255,0.18) 38%, rgba(10,10,10,0) 70%)",
            }}
          />

          {LAYERS.map((l) => {
            const filled = Boolean(l.fill);
            const gradId = `echo-grad-${l.id}`;
            return (
              <div
                key={l.id}
                className="absolute inset-x-0"
                style={{
                  bottom: l.bottom,
                  height: l.height,
                  opacity: l.opacity,
                  filter: l.blur ? `blur(${l.blur}px)` : undefined,
                }}
              >
                <div
                  className="echo-wave-bob h-full w-full"
                  style={{
                    animationDuration: `${l.bob}s`,
                    animationDelay: `${l.bobDelay}s`,
                  }}
                >
                  <div
                    data-echo-wave
                    className="h-full w-[200%]"
                    style={{
                      animation: `${
                        l.reverse ? "echo-wave-x-rev" : "echo-wave-x"
                      } ${l.drift}s linear infinite`,
                      willChange: "transform",
                    }}
                  >
                    <svg
                      viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
                      preserveAspectRatio="none"
                      className="h-full w-full"
                    >
                      <defs>
                        <linearGradient
                          id={gradId}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2={filled ? "1" : "0"}
                        >
                          {filled ? (
                            <>
                              <stop offset="0%" stopColor={l.fill![0]} stopOpacity="0.95" />
                              <stop offset="52%" stopColor={l.fill![1]} stopOpacity="0.7" />
                              <stop offset="100%" stopColor={l.fill![2]} stopOpacity="0.35" />
                            </>
                          ) : (
                            <>
                              <stop offset="0%" stopColor={l.stroke} stopOpacity="0" />
                              <stop offset="28%" stopColor={l.stroke} stopOpacity="1" />
                              <stop offset="72%" stopColor={l.stroke} stopOpacity="1" />
                              <stop offset="100%" stopColor={l.stroke} stopOpacity="0" />
                            </>
                          )}
                        </linearGradient>
                      </defs>
                      <path
                        d={wavePath(l.amplitude, l.phase, l.baseline, filled)}
                        fill={filled ? `url(#${gradId})` : "none"}
                        stroke={filled ? "none" : `url(#${gradId})`}
                        strokeWidth={l.strokeWidth}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Keep the header and caption legible over the waves */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.10) 26%, rgba(10,10,10,0.05) 52%, rgba(10,10,10,0.45) 100%)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
