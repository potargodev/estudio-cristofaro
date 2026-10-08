"use client";

import { useFormStatus } from "react-dom";

export const adminInput =
  "mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-[15px] focus:border-green focus:outline-none focus:ring-2 focus:ring-green/25";

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  variant = "primary",
  confirm,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-green text-paper hover:bg-green-deep",
    secondary: "border border-line bg-surface hover:border-green",
    danger: "border border-danger/40 text-danger hover:bg-danger/5",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`rounded-md px-4 py-2 text-[15px] font-medium disabled:opacity-60 ${styles}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
