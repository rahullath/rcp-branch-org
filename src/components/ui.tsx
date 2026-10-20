"use client";

import { useEffect, type ReactNode, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { ICONS, FallbackIcon } from "./icon-map";

/**
 * Renders a lucide SVG sized in `em` units, so the existing `text-sm` /
 * `text-xl` / `text-4xl` classes at call sites keep controlling icon size
 * exactly as they did with the old icon font. Default is 24px to match.
 */
export function Icon({
  name,
  className,
  strokeWidth = 2.25,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Glyph = ICONS[name] ?? FallbackIcon;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center text-2xl", className)} aria-hidden>
      <Glyph width="1em" height="1em" strokeWidth={strokeWidth} absoluteStrokeWidth />
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-on-primary-fixed-variant active-press",
  secondary: "bg-surface-container-high text-tertiary hover:bg-secondary-fixed-dim active-press",
  outline: "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-on-primary active-press",
  ghost: "bg-transparent text-secondary hover:bg-surface-variant active-press",
  danger: "border-2 border-error bg-transparent text-error hover:bg-error hover:text-on-error active-press",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-none font-label-md font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-9 px-3 text-xs",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "h-13 px-7 text-base",
        size === "icon" && "h-11 w-11 px-0",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger" | "tertiary";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-variant text-on-surface-variant border border-outline",
    primary: "bg-primary text-on-primary",
    success: "bg-tertiary text-on-tertiary",
    warning: "bg-action-gold text-on-primary",
    danger: "bg-error text-on-error",
    tertiary: "bg-surface-container-high text-tertiary border border-outline",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-none px-2 py-1 font-label-sm text-[11px] font-semibold uppercase tracking-wider leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The signature surface of this design system: a square newsprint panel with a
 * hard 4px left accent rule. `accent` picks which rule colour is printed.
 */
export function Card({
  children,
  className,
  onClick,
  accent = "none",
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  accent?: "none" | "primary" | "gold" | "ink" | "muted";
}) {
  const accents: Record<string, string> = {
    none: "",
    primary: "border-l-4 border-l-primary",
    gold: "border-l-4 border-l-action-gold",
    ink: "border-l-4 border-l-on-surface",
    muted: "border-l-4 border-l-outline",
  };
  return (
    <div
      onClick={onClick}
      className={cn(
        "min-w-0 rounded-none border border-paper-shadow bg-soft-cream organic-shadow",
        accents[accent],
        onClick && "cursor-pointer transition-colors hover:border-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-primary text-on-primary">
            <Icon name={icon} className="text-lg" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate font-headline-sm text-base font-bold uppercase tracking-wider text-on-surface">
            {title}
          </h2>
          {subtitle && <p className="truncate text-sm font-medium text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-label-md text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-on-surface-variant">{hint}</span>}
    </label>
  );
}

export const inputClasses =
  "w-full rounded-none border border-outline bg-surface-container-lowest px-3 py-3 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClasses, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClasses, "min-h-24 resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputClasses, "appearance-none pr-10", props.className)}>
      {props.children}
    </select>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-none border border-outline bg-surface-variant text-on-surface-variant">
        <Icon name={icon} className="text-2xl" />
      </span>
      <p className="font-headline-sm text-base font-bold uppercase tracking-wider text-on-surface">{title}</p>
      {hint && <p className="max-w-xs text-pretty text-sm text-on-surface-variant">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      // Above the mobile tab bar (z-50) — otherwise it covers the bottom of the
      // sheet, which is exactly where every form's Save button sits.
      className="fixed inset-0 z-[60] flex items-end justify-center bg-on-surface/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-none border-t-4 border-t-primary bg-surface-container-lowest p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:border sm:border-paper-shadow sm:border-t-4 sm:border-t-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-paper-shadow pb-3">
          <h2 className="font-headline-sm text-lg font-bold uppercase tracking-wider text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none text-on-surface-variant transition-colors hover:bg-surface-variant"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary",
        className,
      )}
    />
  );
}
