import type { ReactNode } from "react";

type FlowStep = {
  id: string;
  label: string;
  detail: string;
};

const STEP_IMAGES: Record<string, { src: string; alt: string }> = {
  files: {
    src: "/marketing/workflow/workflow-files.png",
    alt: "Stack of printed documents",
  },
  extract: {
    src: "/marketing/workflow/workflow-extract.png",
    alt: "Document scanner beside a laptop",
  },
  okf: {
    src: "/marketing/workflow/workflow-okf.png",
    alt: "Index cards with colored tabs",
  },
  package: {
    src: "/marketing/workflow/workflow-package.png",
    alt: "Sealed kraft archive box",
  },
  open: {
    src: "/marketing/workflow/workflow-open.png",
    alt: "Open manila folder with papers",
  },
  search: {
    src: "/marketing/workflow/workflow-search.png",
    alt: "Magnifying glass on documents",
  },
  parsed: {
    src: "/marketing/workflow/workflow-parsed.png",
    alt: "Printed notes and tablet of text",
  },
  origin: {
    src: "/marketing/workflow/workflow-origin.png",
    alt: "Globe with cable and map sheets",
  },
  disk: {
    src: "/marketing/workflow/workflow-disk.png",
    alt: "Portable hard drive beside folders",
  },
};

function Arrow() {
  return (
    <div
      className="hidden shrink-0 items-center self-center text-(--accent) md:flex"
      aria-hidden
    >
      <svg width="36" height="16" viewBox="0 0 36 16" fill="none">
        <path
          className="flow-path"
          d="M2 8h28"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M26 3l6 5-6 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

function DownArrow() {
  return (
    <div className="flex justify-end pr-[18%] text-(--accent) md:pr-[12%]" aria-hidden>
      <svg width="16" height="36" viewBox="0 0 16 36" fill="none">
        <path
          className="flow-path-dashed"
          d="M8 2v26"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M3 24l5 6 5-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

function StepPhoto({
  step,
  index,
}: {
  step: FlowStep;
  index: number;
}) {
  const image = STEP_IMAGES[step.id] ?? STEP_IMAGES.files;

  return (
    <figure
      className="anim-rise flex min-w-0 flex-1 flex-col items-center text-center"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <img
        src={image.src}
        alt={image.alt}
        width={220}
        height={220}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full max-w-[11rem] object-contain"
      />
      <figcaption className="mt-3 space-y-0.5 px-1">
        <p className="font-display text-base font-semibold text-(--ink)">
          {step.label}
        </p>
        <p className="text-xs leading-snug text-(--muted)">{step.detail}</p>
      </figcaption>
    </figure>
  );
}

function FlowRow({
  steps,
  startIndex = 0,
}: {
  steps: ReadonlyArray<FlowStep>;
  startIndex?: number;
}) {
  const nodes: ReactNode[] = [];
  steps.forEach((step, i) => {
    if (i > 0) nodes.push(<Arrow key={`arrow-${step.id}`} />);
    nodes.push(
      <StepPhoto key={step.id} step={step} index={startIndex + i} />,
    );
  });

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
      {nodes}
    </div>
  );
}

function LinearPhotoFlow({
  steps,
  ariaLabel,
}: {
  steps: ReadonlyArray<FlowStep>;
  ariaLabel: string;
}) {
  return (
    <div className="anim-rise" role="img" aria-label={ariaLabel}>
      <FlowRow steps={steps} />
    </div>
  );
}

function BranchedPhotoFlow({
  steps,
  ariaLabel,
}: {
  steps: ReadonlyArray<FlowStep>;
  ariaLabel: string;
}) {
  const main = steps.slice(0, 4);
  const optional = steps.slice(4);

  return (
    <div className="anim-rise" role="img" aria-label={ariaLabel}>
      <p className="mb-4 text-[0.7rem] font-semibold tracking-[0.08em] text-(--accent) uppercase">
        Selective read
      </p>
      <FlowRow steps={main} />
      {optional.length > 0 && (
        <>
          <DownArrow />
          <p className="mb-3 text-[0.7rem] font-semibold tracking-[0.08em] text-(--muted) uppercase">
            Only if needed
          </p>
          <div className="md:ml-auto md:w-[58%]">
            <FlowRow steps={optional} startIndex={main.length} />
          </div>
        </>
      )}
    </div>
  );
}

export function ProductQueryFlow({
  steps,
}: {
  steps: ReadonlyArray<FlowStep>;
}) {
  return (
    <LinearPhotoFlow
      steps={steps}
      ariaLabel="Simple query workflow: open, search, read OKF, read extracted markdown"
    />
  );
}

export function PackProcessorFlow({
  steps,
}: {
  steps: ReadonlyArray<FlowStep>;
}) {
  return (
    <LinearPhotoFlow
      steps={steps}
      ariaLabel="Pack processor workflow: files, extract, index, zipwiki package"
    />
  );
}

export function QueryExtractFlow({
  steps,
}: {
  steps: ReadonlyArray<FlowStep>;
}) {
  return (
    <BranchedPhotoFlow
      steps={steps}
      ariaLabel="Query and extract workflow with optional origin and extract steps"
    />
  );
}
