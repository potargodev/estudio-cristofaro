import { PageHeader } from "@/components/admin/kit/PageHeader";
import { CreateTenantForm } from "@/components/faro/CreateTenantForm";
import { requireFaro } from "@/lib/auth";

export const metadata = { title: "Alta manual" };

export default async function NuevoTenantPage() {
  await requireFaro(true);
  return (
    <div>
      <PageHeader title="Alta manual" description="Crea el estudio (o el autónomo) con su dueño y una contraseña temporal. Los estudios también se pueden dar de alta solos desde la landing, en el plan Señal." />
      <CreateTenantForm />
    </div>
  );
}
