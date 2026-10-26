"use client";

// Motion building blocks for the landing page and the inner pages. Every one of them stays still
// when the user has asked for reduced motion (the CSS rules live under
// `prefers-reduced-motion: no-preference` in globals.css; the framer-motion parts check
// useReducedMotion), and every piece of text stays readable by screen readers.
//
// Adapted from Skiper UI (https://skiper-ui.com, free tier, credited in the footer):
// - StickyStack: skiper16 "Card stack scroll" (cards pin and shrink as the next one arrives);
// - ScrollLetters: skiper31 "Text scroll animation" (letters fly together as the line scrolls in);
// - Spotlight: skiper61 "Mouse follow" (a spring-damped glow that follows the pointer);
// - CountUp: skiper37 "Animated number" 004 (Number Flow counts up when the number comes into view).

import { useEffect, useRef, useState } from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "cn";
import { graphemes } from "@/lib/segment";

/**
 * Fades and lifts its children into place the first time they scroll into view. With
 * `group`, each direct child arrives in turn (give children `style={{ "--i": n }}`).
 * Hidden only once JavaScript runs (the `js` class), so nothing is lost if it never does.
 */
export function Reveal({
  children,
  className,
  group = false,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  group?: boolean;
  as?: "div" | "ul" | "ol" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.shown = "";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const props = group ? { "data-reveal-group": "" } : { "data-reveal": "" };
  return (
    <Tag ref={ref as never} className={className} {...props}>
      {children}
    </Tag>
  );
}

/** Counts up from 0 to `value` when it comes into view; screen readers get the final number. */
export function CountUp({
  value,
  locale,
  format,
  className,
}: {
  value: number;
  locale: string;
  format?: Format;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const shown = inView || reduce ? value : 0;
  return (
    <span ref={ref} className={cn("tabular", className)}>
      <span className="sr-only">{value.toLocaleString(`${locale}-IN`, format)}</span>
      <span aria-hidden="true">
        <NumberFlow value={shown} locales={`${locale}-IN`} format={format} />
      </span>
    </span>
  );
}

/**
 * A soft marigold glow that follows the mouse inside its parent (which must be `relative` and
 * clip its overflow). Touch screens never move it, so phones simply don't see it.
 */
export function Spotlight({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const spring = { mass: 0.4, damping: 22, stiffness: 120 };
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const opacity = useSpring(0, spring);
  const reduce = useReducedMotion();

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || reduce) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = parent.getBoundingClientRect();
      x.set(e.clientX - box.left);
      y.set(e.clientY - box.top);
      opacity.set(1);
    };
    const leave = () => opacity.set(0);
    parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerleave", leave);
    return () => {
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerleave", leave);
    };
  }, [x, y, opacity, reduce]);

  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      style={{ x, y, opacity }}
      className={cn(
        "pointer-events-none absolute top-0 left-0 -mt-48 -ml-48 size-96 rounded-full bg-[radial-gradient(circle,oklch(0.83_0.155_76/0.32),transparent_65%)]",
        className,
      )}
    />
  );
}

/**
 * skiper31: each letter starts spread out and tilted, and flies into place as the line scrolls
 * to the middle of the screen. Letters are graphemes, so Hindi and Tamil letters stay whole.
 * They stay at full strength the whole time: faded letters would be hard to read.
 */
export function ScrollLetters({
  text,
  locale,
  className,
}: {
  text: string;
  locale: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const letters = graphemes(text, locale);
  const centre = Math.floor(letters.length / 2);
  return (
    <p ref={ref} className={className} style={{ perspective: "500px" }}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {letters.map((letter, i) =>
          reduce ? (
            <span key={i}>{letter}</span>
          ) : (
            <Letter key={i} letter={letter} offset={i - centre} progress={scrollYProgress} />
          ),
        )}
      </span>
    </p>
  );
}

function Letter({
  letter,
  offset,
  progress,
}: {
  letter: string;
  offset: number;
  progress: MotionValue<number>;
}) {
  const x = useTransform(progress, [0, 1], [offset * 40, 0]);
  const rotateX = useTransform(progress, [0, 1], [offset * 40, 0]);
  return (
    <motion.span
      className={cn("inline-block", letter === " " && "w-[0.3em]")}
      style={{ x, rotateX }}
    >
      {letter}
    </motion.span>
  );
}

/**
 * skiper16: cards pin near the top one after another; each shrinks a little as the next one
 * slides over it, so the five checks build up into a stack. With reduced motion it is a plain
 * list. `renderCard` gets the index so each card can have its own look.
 */
export function StickyStack<T>({
  items,
  renderCard,
  className,
}: {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    // Short phones get a gentler stack: less shrinking, smaller offsets.
    const media = matchMedia("(max-height: 700px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  if (reduce) {
    return (
      <ol className={cn("flex flex-col gap-4", className)}>
        {items.map((item, i) => (
          <li key={i}>{renderCard(item, i)}</li>
        ))}
      </ol>
    );
  }
  return (
    <ol ref={ref} className={cn("relative flex flex-col gap-[18vh] pb-[8vh]", className)}>
      {items.map((item, i) => (
        <StackCard
          key={i}
          index={i}
          count={items.length}
          progress={scrollYProgress}
          shrink={narrow ? 0.03 : 0.05}
        >
          {renderCard(item, i)}
        </StackCard>
      ))}
    </ol>
  );
}

function StackCard({
  index,
  count,
  progress,
  shrink,
  children,
}: {
  index: number;
  count: number;
  progress: MotionValue<number>;
  shrink: number;
  children: React.ReactNode;
}) {
  const targetScale = 1 - (count - index - 1) * shrink;
  const scale = useTransform(progress, [index / count, 1], [1, targetScale]);
  return (
    <li className="sticky" style={{ top: `calc(5.5rem + ${index * 1.25}rem)` }}>
      <motion.div style={{ scale }} className="origin-top">
        {children}
      </motion.div>
    </li>
  );
}
