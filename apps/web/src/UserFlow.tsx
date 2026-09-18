const STEPS = [
  { id: "docs", label: "Your files", detail: "Contracts, scans, notes" },
  { id: "plugin", label: "Plugin", detail: "Cursor or Claude" },
  { id: "archive", label: ".zipwiki", detail: "Portable knowledge file" },
  { id: "agents", label: "Ask", detail: "What’s inside / find it" },
] as const;

const NODE_X = [96, 304, 512, 720];
const NODE_Y = 110;

export default function UserFlow() {
  return (
    <figure className="anim-rise anim-rise-delay-4 w-full" aria-label="ZipWiki user flow">
      <svg
        viewBox="0 0 816 220"
        role="img"
        className="h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>From files through the ZipWiki plugin to a .zipwiki</title>
        <desc>
          Flow showing documents going through the ZipWiki plugin into a
          portable .zipwiki, then answered by your agent.
        </desc>

        <defs>
          <linearGradient id="flow-band" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#dff0ef" stopOpacity="0.2" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#efe6d4" stopOpacity="0.35" />
          </linearGradient>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
          </marker>
        </defs>

        <rect
          x="12"
          y="24"
          width="792"
          height="172"
          rx="28"
          fill="url(#flow-band)"
          stroke="var(--line)"
          strokeWidth="1"
        />

        {NODE_X.slice(0, -1).map((fromX, i) => {
          const toX = NODE_X[i + 1];
          return (
            <path
              key={`link-${i}`}
              className="flow-path"
              d={`M ${fromX + 48} ${NODE_Y} C ${fromX + 90} ${NODE_Y}, ${toX - 90} ${NODE_Y}, ${toX - 48} ${NODE_Y}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              markerEnd="url(#arrow)"
              style={{ animationDelay: `${0.35 + i * 0.15}s` }}
            />
          );
        })}

        {STEPS.map((step, i) => {
          const x = NODE_X[i];
          const y = NODE_Y;
          return (
            <g key={step.id} className="flow-node" style={{ animationDelay: `${i * 0.35}s` }}>
              <circle
                cx={x}
                cy={y}
                r="42"
                fill="var(--flow-fill)"
                stroke="var(--flow-stroke)"
                strokeWidth="2"
              />
              <StepIcon index={i} x={x} y={y - 8} />
              <text
                x={x}
                y={y + 68}
                textAnchor="middle"
                fill="var(--ink)"
                style={{ fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 600 }}
              >
                {step.label}
              </text>
              <text
                x={x}
                y={y + 88}
                textAnchor="middle"
                fill="var(--muted)"
                style={{ fontFamily: "Sora, sans-serif", fontSize: 11 }}
              >
                {step.detail}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function StepIcon({ index, x, y }: { index: number; x: number; y: number }) {
  const stroke = "var(--accent)";
  const common = {
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (index) {
    case 0:
      return (
        <g transform={`translate(${x - 12}, ${y - 12})`}>
          <rect x="2" y="1" width="16" height="20" rx="2" {...common} />
          <path d="M6 7h8M6 11h8M6 15h5" {...common} />
        </g>
      );
    case 1:
      return (
        <g transform={`translate(${x - 12}, ${y - 12})`}>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M8 12l3 3 5-6" {...common} />
        </g>
      );
    case 2:
      return (
        <g transform={`translate(${x - 12}, ${y - 12})`}>
          <path d="M4 7h16v12H4z" {...common} />
          <path d="M4 7l8-4 8 4" {...common} />
          <path d="M12 7v12" {...common} />
        </g>
      );
    default:
      return (
        <g transform={`translate(${x - 12}, ${y - 12})`}>
          <rect x="3" y="6" width="18" height="12" rx="3" {...common} />
          <circle cx="9" cy="12" r="1.5" fill={stroke} stroke="none" />
          <circle cx="15" cy="12" r="1.5" fill={stroke} stroke="none" />
          <path d="M8 3h8" {...common} />
        </g>
      );
  }
}
