import { Mail } from "lucide-react";
import { Card } from "./ui";

export interface StudioContact {
  name: string;
  email: string;
  image: string | null;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Responsable del estudio asignado a la organización, visible en el inicio del portal */
export function LeadContact({ lead, team, children }: { lead: StudioContact | null; team: StudioContact[]; children?: React.ReactNode }) {
  if (!lead) {
    return (
      <Card>
        <h2 className="font-semibold">Tu equipo en el estudio</h2>
        <p className="mt-2 text-sm text-muted">Estamos asignando a tu responsable. Mientras tanto, escribinos desde Solicitudes.</p>
      </Card>
    );
  }
  return (
    <Card>
      <p className="text-sm text-muted">Tu responsable en el estudio</p>
      <div className="mt-3 flex items-center gap-3">
        {lead.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lead.image} alt="" width={56} height={56} className="size-14 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-navy font-display text-xl text-rose-light">
            {initials(lead.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-xl">{lead.name}</p>
          <a href={`mailto:${lead.email}`} className="inline-flex max-w-full items-center gap-1.5 truncate text-sm text-rose-deep hover:underline">
            <Mail className="size-4 shrink-0" aria-hidden />
            {lead.email}
          </a>
        </div>
      </div>
      {team.length > 0 && <p className="mt-3 text-sm text-muted">También trabajan con ustedes: {team.map((t) => t.name).join(", ")}.</p>}
      {children}
    </Card>
  );
}
