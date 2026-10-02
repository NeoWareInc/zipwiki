import { useEffect, useId } from "react";
import { integritySummary, type IntegrityLine } from "../lib/nzip";

export function IntegrityDialog({
  lines,
  testing,
  onClose,
}: {
  lines: IntegrityLine[];
  testing: boolean;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#15202b]/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(85vh,900px)] w-full max-w-3xl flex-col rounded-xl border border-(--border) bg-white shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-(--border) px-4 py-3">
          <h2 id={titleId} className="font-display text-lg font-semibold text-(--ink)">
            Integrity
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-(--ink) hover:underline"
          >
            Close
          </button>
        </header>
        <div className="border-b border-(--border) px-4 py-3">
          <p className="text-sm font-medium text-(--ink)">
            {testing ? "Testing…" : integritySummary(lines)}
          </p>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4 font-mono text-xs">
          {lines.map((line) => (
            <li key={line.name}>
              testing: {line.name} ...{" "}
              <span className={line.ok ? "text-green-700" : "text-red-700"}>
                {line.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
