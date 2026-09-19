const ASSETS = {
  lockup: { src: "/zipwiki-logo.svg", width: 442, height: 148 },
  wordmark: { src: "/zipwiki-logo-wordmark.svg", width: 442, height: 108 },
  mark: { src: "/zipwiki-mark.svg", width: 180, height: 180 },
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
  const asset = ASSETS[variant];
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
