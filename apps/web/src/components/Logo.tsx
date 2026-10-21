import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";

const ASSETS = {
  lockup: {
    light: { src: "/zipwiki-logo.svg", width: 442, height: 148 },
    dark: { src: "/zipwiki-logo-dark.svg", width: 442, height: 148 },
  },
  wordmark: {
    light: { src: "/zipwiki-logo-wordmark.svg", width: 442, height: 118 },
    dark: { src: "/zipwiki-logo-dark.svg", width: 442, height: 148 },
  },
  mark: {
    light: { src: "/zipwiki-mark.svg", width: 180, height: 180 },
    dark: { src: "/zipwiki-mark.svg", width: 180, height: 180 },
  },
} as const;

type LogoVariant = keyof typeof ASSETS;

export function Logo({
  variant = "wordmark",
  className,
  alt = "ZipWiki",
}: {
  variant?: LogoVariant;
  className?: string;
  alt?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const mode =
    mounted && resolvedTheme === "dark" ? ("dark" as const) : ("light" as const);
  const asset = ASSETS[variant][mode];

  return (
    <img
      src={asset.src}
      alt={alt}
      width={asset.width}
      height={asset.height}
      className={className}
      decoding="async"
    />
  );
}
