import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Cómo cuida el Estudio Cristofaro los datos personales de quienes nos contactan, agendan una llamada o usan el portal.",
  alternates: { canonical: "/privacidad" },
};

const sections = [
  {
    title: "Quién es responsable",
    text: `${site.name}, estudio contable con domicilio en la Ciudad Autónoma de Buenos Aires, es responsable de los datos personales que se recolectan en este sitio y en la plataforma de clientes, en los términos de la Ley 25.326 de Protección de los Datos Personales.`,
  },
  {
    title: "Qué datos usamos y para qué",
    text: "Los datos que nos dejás en los formularios de contacto, el diagnóstico o la agenda (nombre, email, teléfono, empresa y lo que nos cuentes) se usan solo para responderte, coordinar la llamada y, si avanzamos, prestarte el servicio. En el portal guardamos la información contable y los documentos que comparten con el estudio. No vendemos ni cedemos datos a terceros con fines comerciales.",
  },
  {
    title: "Agenda y Google",
    text: "Cuando agendás una llamada, creamos un evento en el Google Calendar de la persona del estudio que te atiende, con un link de Google Meet, y te enviamos la invitación a tu email. Para eso Google procesa tu nombre, tu email y el horario, según sus propias políticas de privacidad. El estudio solo accede a su calendario para ver horarios ocupados y crear o modificar esos eventos. Si entrás al portal con tu cuenta de Google, solo usamos tu nombre y tu email para identificarte.",
  },
  {
    title: "Cookies",
    text: "Usamos solo cookies necesarias: la sesión del backoffice y del portal, y la elección de organización en el portal. No usamos cookies de publicidad ni de seguimiento de terceros.",
  },
  {
    title: "Seguridad y conservación",
    text: "Los documentos se guardan de forma privada y solo se descargan con una sesión autorizada. Los accesos del estudio usan segundo factor y toda acción sensible queda registrada. Conservamos los datos mientras dure la relación profesional y el tiempo que exijan las normas contables e impositivas.",
  },
  {
    title: "Tus derechos",
    text: `Podés pedir acceso, rectificación o supresión de tus datos escribiendo a ${site.email}. La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y reclamos relacionados con el incumplimiento de las normas sobre protección de datos personales.`,
  },
];

export default function PrivacidadPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Privacidad" intro="Cómo cuidamos los datos de quienes nos contactan, agendan una llamada o usan el portal." />
      <section aria-label="Política de privacidad">
        <Container className="py-16 lg:py-24">
          <ol className="max-w-4xl border-t border-hair">
            {sections.map((s, i) => (
              <li key={s.title} className="grid gap-3 border-b border-hair py-8 lg:grid-cols-[3rem_16rem_1fr] lg:gap-8">
                <span className="tabular text-[12px] text-rose-light">0{i + 1}</span>
                <h2 className="text-[17px] text-paper">{s.title}</h2>
                <p className="text-[15px] leading-relaxed text-paper/65">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-[13px] text-paper/55">Última actualización: octubre de 2026.</p>
        </Container>
      </section>
    </>
  );
}
