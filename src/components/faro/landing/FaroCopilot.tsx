import { Check, Mic, NotebookPen, Paperclip, Undo2, Users, WandSparkles } from "lucide-react";
import { Container, CtaLink, SectionIndex } from "@/components/web/ui";
import { cn } from "@/lib/utils";

// Copiloto, Bitácora y Grupos construidos en código con datos ficticios (sin
// capturas ni fotos). Entran con .faro-demo-in, que se apaga con reduced motion.

const d = (n: number) => ({ "--d": n }) as React.CSSProperties;

function Phone() {
  return (
    <div className="faro-demo-in mx-auto w-full max-w-[320px] overflow-hidden rounded-[34px] border-[7px] border-[#0d1120] bg-[#f7f5f3] text-[#1b1e26] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]" style={d(0)} aria-label="Ejemplo del Copiloto en el teléfono (datos ficticios)" role="img">
      <div className="flex items-center gap-2 bg-[#1c2235] px-4 pb-3 pt-4 text-[#f7f5f3]">
        <span className="grid size-7 place-items-center rounded-full bg-[#c9a596] text-[#1c2235]">
          <WandSparkles className="size-3.5" aria-hidden />
        </span>
        <span className="text-[13px] font-medium">Copiloto</span>
      </div>
      <div className="grid gap-2.5 px-3 py-4 text-[12.5px] leading-snug">
        <div className="faro-demo-in ml-auto flex max-w-[82%] items-center gap-2 rounded-[16px] rounded-br-[5px] bg-[#1c2235] px-3 py-2 text-[#f7f5f3]" style={d(200)}>
          <Mic className="size-3.5 shrink-0 text-[#c9a596]" aria-hidden />
          <span>«Ayer 5.000 de nafta y 3.200 en el chino»</span>
        </div>
        <div className="faro-demo-in max-w-[88%] rounded-[16px] rounded-bl-[5px] border border-[#e5e1dc] bg-white px-3 py-2" style={d(450)}>
          Te dejé 2 registros:
          {[
            ["Gasto $ 5.000", "Nafta · Transporte · ayer", true],
            ["Gasto $ 3.200", "Chino · Supermercado · ayer", false],
          ].map(([t, l, done], i) => (
            <div key={i} className="mt-2 rounded-[8px] border border-[#e5e1dc] p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[#6b7083]">Bitácora</p>
                  <p className="text-[13px] font-semibold">{t as string}</p>
                  <p className="text-[11px] text-[#6b7083]">{l as string}</p>
                </div>
                <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px]", done ? "bg-[#e8eaf2]" : "text-[#6b7083]")}>{done ? "Registrado" : "Para confirmar"}</span>
              </div>
              <div className="mt-1.5 flex gap-1.5 text-[11px]">
                {done ? (
                  <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#e5e1dc] px-2 py-1">
                    <Undo2 className="size-3" aria-hidden /> Deshacer
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#1c2235] px-2 py-1 text-[#f7f5f3]">
                    <Check className="size-3" aria-hidden /> Confirmar
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="faro-demo-in ml-auto max-w-[82%] rounded-[16px] rounded-br-[5px] bg-[#1c2235] px-3 py-2 text-[#f7f5f3]" style={d(750)}>
          ¿Cuánto gasté en delivery este mes?
        </div>
        <div className="faro-demo-in max-w-[88%] rounded-[16px] rounded-bl-[5px] border border-[#e5e1dc] bg-white px-3 py-2" style={d(950)}>
          En octubre llevás <strong>$ 38.400</strong> en Comida y delivery, un 12 % menos que en septiembre. <span className="underline">Ver en Bitácora</span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-[#e5e1dc] px-3 py-2.5">
        <Paperclip className="size-4 text-[#6b7083]" aria-hidden />
        <span className="flex-1 rounded-full border border-[#e5e1dc] bg-white px-3 py-1.5 text-[11px] text-[#9095a3]">Contame un gasto…</span>
        <span className="grid size-8 place-items-center rounded-full bg-[#c9a596] text-[#1c2235]">
          <Mic className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function BitacoraCard() {
  const cats = [
    ["Supermercado", 62],
    ["Comida y delivery", 38],
    ["Transporte", 27],
    ["Salidas", 18],
  ] as const;
  return (
    <div className="faro-demo-in rounded-lg border border-hair-strong bg-navy-deep p-5" style={d(300)} role="img" aria-label="Ejemplo de Bitácora del mes (datos ficticios)">
      <p className="flex items-center gap-2 text-[12px] text-paper/60">
        <NotebookPen className="size-4 text-gold" aria-hidden /> Bitácora · octubre
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Entró", "$ 950.000"],
          ["Salió", "$ 612.300"],
          ["Queda", "$ 337.700"],
        ].map(([l, v]) => (
          <div key={l}>
            <p className="text-[11px] text-paper/50">{l}</p>
            <p className="font-display text-[20px] leading-tight text-paper">{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-2">
        {cats.map(([n, w]) => (
          <li key={n} className="text-[12px] text-paper/75">
            <span className="flex justify-between">
              <span>{n}</span>
              <span className="text-paper/50">{w} %</span>
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-paper/10">
              <span className="block h-full rounded-full bg-gold" style={{ width: `${w}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupCard() {
  return (
    <div className="faro-demo-in rounded-lg border border-hair-strong bg-navy-deep p-5" style={d(500)} role="img" aria-label="Ejemplo de grupo de gastos (datos ficticios)">
      <p className="flex items-center gap-2 text-[12px] text-paper/60">
        <Users className="size-4 text-gold" aria-hidden /> Viaje a Mendoza · 4 personas
      </p>
      <ul className="mt-3 divide-y divide-hair text-[13px]">
        {[
          ["Lu le debe a Mati", "$ 18.250"],
          ["Juan le debe a Mati", "$ 9.800"],
        ].map(([t, v]) => (
          <li key={t} className="flex justify-between py-2 text-paper/85">
            <span>{t}</span>
            <span className="tabular-nums text-gold">{v}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-paper/55">Dividido en partes iguales, por montos o por porcentaje. Dos transferencias y quedan a mano.</p>
    </div>
  );
}

/** Para personas: el Copiloto anota, la Bitácora muestra, los Grupos dividen */
export function FaroCopilot() {
  return (
    <section aria-labelledby="copiloto-titulo" className="bg-night py-24 lg:py-32">
      <Container>
        <div className="grid gap-14 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <SectionIndex n="01">Para vos</SectionIndex>
            <h2 id="copiloto-titulo" className="mt-6 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.02] text-paper">
              Contale tus gastos. Él los anota.
            </h2>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-paper/75">
              Mandale un audio, un texto o la foto del ticket al Copiloto. Te propone cada registro en una tarjeta para que lo confirmes, y tu Bitácora se arma sola: cuánto entró, cuánto salió y en qué se fue. Y si compartiste la cena, lo divide en tu grupo.
            </p>
            <ul className="mt-6 grid gap-2 text-[15px] text-paper/80">
              <li>· Gratis para empezar, desde el teléfono.</li>
              <li>· Tu Bitácora es privada: no la ve nadie más.</li>
              <li>· La IA propone, vos confirmás.</li>
            </ul>
            <CtaLink tone="gold" href="/faro/registro?tipo=persona" className="mt-9">
              Empezá gratis
            </CtaLink>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7 lg:items-center">
            <Phone />
            <div className="grid gap-5">
              <BitacoraCard />
              <GroupCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
