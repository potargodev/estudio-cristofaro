import { Feedback, InvoiceFormView } from "@/components/facturacion/views";
import { personalScope } from "../../scope";

export const metadata = { title: "Editar borrador" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return (
    <>
      <Feedback sp={await searchParams} />
      <InvoiceFormView scope={scope} id={(await params).id} />
    </>
  );
}
