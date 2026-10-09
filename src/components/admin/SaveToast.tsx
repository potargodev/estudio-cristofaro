"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// Los avisos de éxito llegan por la URL después del redirect de cada action
// (?guardado=1, ?nuevo=1, …). Se muestran una vez como toast y se limpian de la
// URL para que no se repitan al recargar.
const SUCCESS_PARAMS = ["guardado", "nuevo", "creado", "activado", "desactivado", "subido", "creada", "enviado"];

export function SaveToast({ message }: { message: string }) {
  useEffect(() => {
    toast.success(message, { id: message });
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of SUCCESS_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, "", url);
  }, [message]);
  return null;
}
