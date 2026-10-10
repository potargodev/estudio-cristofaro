"use client";

import { useState } from "react";
import { AdminField } from "@/components/admin/AdminField";
import { FormSelect, SubmitButton } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AI_PROVIDER_KINDS, PROVIDERS, type AiProviderKind } from "@/lib/ai/catalog";

export interface ProviderFormValues {
  id: string;
  kind: AiProviderKind;
  name: string;
  base_url: string | null;
  key_hint: string | null;
  models: string[];
  resourceName?: string;
  apiVersion?: string;
}

/** Alta o edición de un proveedor. Los campos cambian según el tipo. */
export function ProviderForm({ action, current, defaultKind }: { action: (fd: FormData) => Promise<void>; current?: ProviderFormValues; defaultKind?: AiProviderKind }) {
  const [kind, setKind] = useState<AiProviderKind>(current?.kind ?? defaultKind ?? "anthropic");
  const meta = PROVIDERS[kind];
  const p = current?.id ?? "nuevo";
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {current && <input type="hidden" name="id" value={current.id} />}
      {current ? (
        <input type="hidden" name="kind" value={current.kind} />
      ) : (
        <AdminField label="Proveedor" htmlFor={`${p}-kind`}>
          <select
            id={`${p}-kind`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AiProviderKind)}
            className="mt-1 h-9 w-full border border-line bg-surface px-2 text-[15px]"
          >
            {AI_PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROVIDERS[k].label}
              </option>
            ))}
          </select>
        </AdminField>
      )}
      <AdminField label="Nombre para reconocerlo" htmlFor={`${p}-name`}>
        <Input id={`${p}-name`} name="name" defaultValue={current?.name ?? meta.label} maxLength={80} className="mt-1" />
      </AdminField>
      <AdminField
        label={meta.keyRequired ? "Clave de API" : "Clave de API (opcional)"}
        htmlFor={`${p}-key`}
        hint={current?.key_hint ? `Guardada (termina en …${current.key_hint}). Dejala vacía para no cambiarla.` : meta.help}
        className="sm:col-span-2"
      >
        <Input id={`${p}-key`} name="api_key" type="password" autoComplete="off" placeholder={current?.key_hint ? "••••••••" : ""} className="mt-1 font-mono" />
      </AdminField>
      {meta.baseUrl !== "no" && (
        <AdminField
          label={meta.baseUrl === "requerida" ? "URL base" : "URL base (opcional)"}
          htmlFor={`${p}-url`}
          hint={meta.azure ? "Solo si usás un endpoint propio; si no, alcanza con el nombre del recurso." : "Ejemplo: http://localhost:11434/v1"}
          className="sm:col-span-2"
        >
          <Input id={`${p}-url`} name="base_url" type="url" defaultValue={current?.base_url ?? ""} className="mt-1 font-mono" />
        </AdminField>
      )}
      {meta.azure && (
        <>
          <AdminField label="Nombre del recurso" htmlFor={`${p}-res`} hint="El de https://<recurso>.openai.azure.com">
            <Input id={`${p}-res`} name="resource_name" defaultValue={current?.resourceName ?? ""} className="mt-1" />
          </AdminField>
          <AdminField label="Versión de la API (opcional)" htmlFor={`${p}-ver`}>
            <Input id={`${p}-ver`} name="api_version" defaultValue={current?.apiVersion ?? ""} placeholder="v1" className="mt-1" />
          </AdminField>
        </>
      )}
      <AdminField
        label="Modelos"
        htmlFor={`${p}-models`}
        hint={`Uno por línea o separados por coma.${meta.models.length ? ` Sugeridos: ${meta.models.join(", ")}.` : ""}`}
        className="sm:col-span-2"
      >
        <Textarea id={`${p}-models`} name="models" rows={2} defaultValue={(current?.models ?? meta.models).join("\n")} className="mt-1 font-mono text-[14px]" />
      </AdminField>
      <div className="sm:col-span-2">
        <SubmitButton>{current ? "Guardar cambios" : "Agregar proveedor"}</SubmitButton>
      </div>
    </form>
  );
}

/** Selector de modelo para formularios (todas las opciones de los proveedores del estudio) */
export function ModelSelect({ id, name, options, defaultValue, emptyLabel }: { id: string; name: string; options: { value: string; label: string }[]; defaultValue?: string; emptyLabel: string }) {
  return <FormSelect id={id} name={name} defaultValue={defaultValue} options={[{ value: "", label: emptyLabel }, ...options]} />;
}
