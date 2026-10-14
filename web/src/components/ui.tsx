import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  MinusCircle,
  ShieldAlert,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useT } from "@/i18n";

export function Card({
  title,
  sub,
  icon: Icon,
  tone,
  action,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: "water" | "accent" | "heat";
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const hid = useId();
  return (
    <section className={`card ${className}`} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || Icon) && (
        <div className="card-head">
          {Icon && (
            <span className="icon-badge" data-tone={tone}>
              <Icon aria-hidden="true" />
            </span>
          )}
          <div>
            {title && <h2 id={hid}>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type StatusLevel = "good" | "warning" | "serious" | "critical" | "info" | "neutral";

const STATUS_ICON: Record<StatusLevel, LucideIcon> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: ShieldAlert,
  critical: AlertOctagon,
  info: Info,
  neutral: MinusCircle,
};

/** Status is never colour alone: icon + label + tint. */
export function Status({ level, children }: { level: StatusLevel; children: ReactNode }) {
  const Icon = STATUS_ICON[level];
  return (
    <span className="status" data-level={level}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}

export const riskStatus = (r: 0 | 1 | 2 | 3): StatusLevel =>
  (["good", "warning", "serious", "critical"] as const)[r];

export function RiskBadge({ level }: { level: 0 | 1 | 2 | 3 }) {
  const t = useT();
  const label = [t.level.low, t.level.low, t.level.moderate, t.level.high][level];
  return <Status level={riskStatus(level)}>{label}</Status>;
}

export function Meter({ value, color, label }: { value: number; color?: string; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={color ? ({ "--fill": color } as React.CSSProperties) : undefined}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function Empty({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click mirrors the Escape key handler above
    <div
      className="sheet-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2 style={{ marginBottom: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">
        {msg && <div className="toast">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="source">{children}</p>;
}

export function ErrorNote({ onRetry }: { onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="alert" data-level="warning">
      <AlertTriangle aria-hidden="true" />
      <div>
        <b>{t.app.error}</b>
        {onRetry && (
          <button type="button" className="linkbtn" onClick={onRetry}>
            {t.app.retry}
          </button>
        )}
      </div>
    </div>
  );
}
