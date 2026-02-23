import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

const sizes = {
  sm: { icon: 24, text: "text-lg" },
  md: { icon: 32, text: "text-xl" },
  lg: { icon: 40, text: "text-2xl" },
  xl: { icon: 56, text: "text-4xl" },
};

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoIcon size={s.icon} />
      {showText && (
        <span className={cn("font-bold tracking-tight", s.text)}>
          Elect<span className="text-emerald-600">Hub</span>
        </span>
      )}
    </div>
  );
}

export function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ElectHub logo"
    >
      <rect width="64" height="64" rx="14" fill="#1e293b" />
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#1e293b" stroke="#334155" strokeWidth="1" />

      {/* Ballot box body */}
      <rect x="16" y="26" width="32" height="24" rx="3" fill="#334155" />
      <rect x="16" y="26" width="32" height="6" rx="2" fill="#475569" />

      {/* Ballot slot */}
      <rect x="26" y="27.5" width="12" height="3" rx="1.5" fill="#1e293b" />

      {/* Ballot paper going in */}
      <rect x="24" y="14" width="16" height="18" rx="2" fill="#f8fafc" />
      <rect x="24" y="14" width="16" height="18" rx="2" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="0.5" />

      {/* Checkmark on ballot */}
      <path
        d="M28 23L31 26L36 20"
        stroke="#10b981"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Hub dots */}
      <circle cx="13" cy="44" r="3" fill="#10b981" opacity="0.7" />
      <circle cx="51" cy="44" r="3" fill="#10b981" opacity="0.7" />
      <circle cx="51" cy="34" r="2.5" fill="#10b981" opacity="0.5" />
      <circle cx="13" cy="34" r="2.5" fill="#10b981" opacity="0.5" />

      {/* Connection lines from hub dots to box */}
      <line x1="15.5" y1="44" x2="16" y2="44" stroke="#10b981" strokeWidth="1" opacity="0.4" />
      <line x1="48.5" y1="44" x2="48" y2="44" stroke="#10b981" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
