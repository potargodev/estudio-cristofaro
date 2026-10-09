"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Adaptado de shadcn/ui: sin next-themes (el sitio es solo claro) y con los colores de la marca.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{ style: { boxShadow: "var(--shadow-brand-lg)", fontFamily: "var(--font-sans)" } }}
      icons={{
        success: <CircleCheckIcon className="size-4 text-rose-light" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4 text-[#f0a597]" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // Toasts de marca: azul noche con borde rosé y sombra con tinte azul
          "--normal-bg": "var(--color-navy)",
          "--normal-text": "var(--color-paper)",
          "--normal-border": "rgb(201 165 150 / 0.35)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
