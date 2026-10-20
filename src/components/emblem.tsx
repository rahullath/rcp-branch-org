/* eslint-disable @next/next/no-img-element -- small brand PNGs; next/image adds nothing here */

const MARKS = {
  yellow: "/brand/rcs/marks/hammer-sickle-yellow.png",
  red: "/brand/rcs/marks/hammer-sickle-red.png",
  white: "/brand/rcs/marks/hammer-sickle-white.png",
  black: "/brand/rcs/marks/hammer-sickle-icon.png",
} as const;

/** The party's hammer and sickle (the brand mark, 259×382). Sized by height. */
export function HammerSickle({ height = 24, color = "red", className, title }: { height?: number | string; color?: keyof typeof MARKS; className?: string; title?: string }) {
  return (
    <img
      src={MARKS[color]}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{ height, width: "auto", display: "block" }}
      draggable={false}
    />
  );
}
