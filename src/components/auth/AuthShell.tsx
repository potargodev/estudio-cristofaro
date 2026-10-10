import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { Monogram } from "@/components/site/Logo";

/** Marco de las pantallas de acceso (backoffice, portal, invitación, 2FA) */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
  brand = "faro",
}: {
  /** faro: pantallas de Faro (estudio, Faro Manager). studio: portal de clientes con la marca del estudio */
  brand?: "faro" | "studio";
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-deep px-4 py-10">
      <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>
        {brand === "faro" && <FaroLogo className="mb-6" />}
        <div className="app-ui rounded-lg border-t-2 border-rose-light bg-paper p-7 shadow-brand-lg">
          <div className="mb-6 flex items-center gap-2.5">
            {brand === "studio" && (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-rose-light">
                <Monogram className="size-7" />
              </span>
            )}
            <div>
              <h1 className="text-[19px] font-bold leading-tight">{title}</h1>
              <p className="text-sm text-muted">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
        {footer && <div className="mt-5 text-center text-sm text-paper/70">{footer}</div>}
        {brand === "studio" && <p className="mt-6 text-center text-[12px] text-paper/45">Con tecnología de Faro</p>}
      </div>
    </div>
  );
}
