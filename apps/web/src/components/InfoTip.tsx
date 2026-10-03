import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Small “i” control that opens a simple information bubble. */
export function InfoTip({
  label,
  children,
}: {
  /** Accessible name for the info control */
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-(--border) bg-white text-[10px] font-semibold leading-none text-(--muted) hover:border-(--ink) hover:text-(--ink)"
      >
        i
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute top-full left-0 z-30 mt-1.5 w-64 rounded-lg border border-(--border) bg-white p-3 text-left text-xs leading-relaxed font-normal text-(--ink) shadow-soft sm:w-72"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
