import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
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
      <PageHeader title="Privacidad" intro="Cómo cuidamos los datos de quienes nos contactan, agendan una llamada o usan el portal." />
      <section className="mx-auto max-w-3xl space-y-8 px-4 py-14 sm:px-6">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 leading-relaxed text-muted">{s.text}</p>
          </div>
        ))}
        <p className="text-sm text-muted">Última actualización: octubre de 2026.</p>
      </section>
    </>
  );
}
