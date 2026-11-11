"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-sky-400 text-slate-900 hover:bg-sky-300",
        variant === "ghost" &&
          "border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-white/5",
        variant === "danger" && "bg-red-400 text-slate-900 hover:bg-red-300",
        className,
      )}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={clsx(
          "min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)] placeholder:text-slate-500",
          className,
        )}
      />
    );
  },
);

/** Nhãn gắn với ô nhập qua `htmlFor`, thông báo lỗi được đọc bằng `aria-describedby`. */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm text-[var(--muted)]">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={clsx("rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6", className)}
    >
      {children}
    </section>
  );
}

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "ok";
  children: ReactNode;
}) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-lg border px-3 py-2 text-sm",
        kind === "error"
          ? "border-red-400/40 bg-red-400/10 text-red-300"
          : "border-green-400/40 bg-green-400/10 text-green-300",
      )}
    >
      {children}
    </p>
  );
}
