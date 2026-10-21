import { useEffect, useRef, useState } from "react";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { useTheme } from "./ThemeProvider";

function SystemIcon() {
  return (
    <div className="relative h-6 w-6 text-(--ink)">
      <div className="absolute top-0 left-0 w-1/2 overflow-hidden">
        <SunIcon className="h-6 w-6" />
      </div>
      <div className="absolute top-0 right-0 w-1/2 overflow-hidden">
        <MoonIcon className="h-6 w-6 -translate-x-1/2" />
      </div>
    </div>
  );
}

export function ThemeToggler() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden />;
  }

  const currentIcon =
    theme === "light" ? (
      <SunIcon className="h-6 w-6 text-(--ink)" />
    ) : theme === "dark" ? (
      <MoonIcon className="h-6 w-6 text-(--ink)" />
    ) : (
      <SystemIcon />
    );

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="cursor-pointer rounded-full p-1 transition-colors hover:bg-(--paper-deep)"
        aria-label="Toggle theme"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {currentIcon}
        <span className="sr-only">Toggle theme</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[9rem] overflow-hidden rounded-lg border border-(--border) bg-(--surface) p-1 shadow-soft"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("light");
              setOpen(false);
            }}
            className={`flex w-full items-center rounded-md px-3 py-2 text-sm text-(--ink) transition-colors hover:bg-(--paper-deep) ${
              theme === "light" ? "bg-(--paper-deep) font-medium" : ""
            }`}
          >
            <SunIcon className="mr-2 h-6 w-6" />
            Light
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("dark");
              setOpen(false);
            }}
            className={`flex w-full items-center rounded-md px-3 py-2 text-sm text-(--ink) transition-colors hover:bg-(--paper-deep) ${
              theme === "dark" ? "bg-(--paper-deep) font-medium" : ""
            }`}
          >
            <MoonIcon className="mr-2 h-6 w-6" />
            Dark
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("system");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-(--ink) transition-colors hover:bg-(--paper-deep) ${
              theme === "system" || theme == null
                ? "bg-(--paper-deep) font-medium"
                : ""
            }`}
          >
            <SystemIcon />
            System
          </button>
        </div>
      ) : null}
    </div>
  );
}
