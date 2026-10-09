import { Monogram } from "@/components/site/Logo";

/** Marco de las pantallas de acceso (backoffice, portal, invitación, 2FA) */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-deep px-4 py-10">
      <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>
        <div className="rounded-md bg-paper p-7 shadow-xl">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-rose-light">
              <Monogram className="size-7" />
            </span>
            <div>
              <h1 className="font-semibold leading-tight">{title}</h1>
              <p className="text-sm text-muted">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
        {footer && <div className="mt-5 text-center text-sm text-paper/70">{footer}</div>}
      </div>
    </div>
  );
}
