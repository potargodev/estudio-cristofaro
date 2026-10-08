-- Datos iniciales del estudio. Correr después de 0001_init.sql.

insert into public.studios (slug, name)
values ('cristofaro', 'Estudio Cristofaro & Asociados')
on conflict (slug) do nothing;

-- Planes de referencia (completar price_label con los montos reales desde el backoffice)
insert into public.plans (studio_id, name, segment, price_label, description, features, highlighted, position)
select s.id, p.name, p.segment, null, p.description, p.features, p.highlighted, p.position
from public.studios s,
(values
  ('Monotributo', 'monotributistas', 'Para quienes facturan como monotributistas y quieren olvidarse de los trámites.',
    array['Control de categoría y recategorizaciones','Emisión de facturas o asistencia para emitirlas','Alertas de pago mensual','Ingresos Brutos (Convenio o local)','Respuesta en menos de 24 h hábiles'], false, 1),
  ('Responsable Inscripto', 'pymes-y-sociedades', 'Para profesionales y comercios inscriptos en IVA y Ganancias.',
    array['Liquidación mensual de IVA e Ingresos Brutos','Ganancias y Bienes Personales anuales','Informe mensual de impuestos pagados y a pagar','Atención de requerimientos de ARCA','Portal del cliente'], true, 2),
  ('Sociedades', 'pymes-y-sociedades', 'Para SAS, SRL y SA que necesitan contabilidad, balances e impuestos al día.',
    array['Registraciones contables y balance anual','Impuestos nacionales y provinciales','Libros societarios y actas','Informes de gestión mensuales','Contador asignado'], false, 3),
  ('Sueldos', 'empleadores', 'Para empleadores con personal en relación de dependencia.',
    array['Liquidación de sueldos y F.931','Altas y bajas en ARCA y sindicatos','Recibos y libro de sueldos digital','Liquidaciones finales','Consultas laborales del día a día'], false, 4)
) as p(name, segment, description, features, highlighted, position)
where s.slug = 'cristofaro';

insert into public.faqs (studio_id, question, answer, position)
select s.id, f.q, f.a, f.pos
from public.studios s,
(values
  ('¿Atienden solo en CABA?', 'Tenemos oficina en CABA y trabajamos con clientes de toda Capital y Gran Buenos Aires. La mayor parte de la gestión es digital, así que no hace falta que vengas al estudio.', 1),
  ('¿Cómo es el abono mensual?', 'Es un monto fijo según tu situación (régimen, volumen de operaciones y empleados). Antes de empezar te pasamos una propuesta cerrada con todo lo que incluye.', 2),
  ('¿Qué necesito para empezar?', 'Tu CUIT, clave fiscal y una charla de 20 minutos para entender tu actividad. Con eso armamos el diagnóstico y la propuesta.', 3),
  ('Ya tengo contador, ¿cómo es el cambio?', 'Nos encargamos de pedir la documentación necesaria y revisar que no haya presentaciones pendientes. El cambio no interrumpe tus vencimientos.', 4),
  ('¿Cuánto tardan en responder?', 'Respondemos todas las consultas en menos de 24 horas hábiles, por WhatsApp, mail o desde el portal.', 5)
) as f(q, a, pos)
where s.slug = 'cristofaro';

-- ───────────── Crear el primer usuario administrador ─────────────
-- 1. Supabase → Authentication → Users → "Add user" (email + contraseña).
-- 2. Copiá su UUID y corré:
--
-- insert into public.profiles (id, studio_id, full_name, role)
-- select '<UUID-DEL-USUARIO>', id, 'Nombre Apellido', 'admin'
-- from public.studios where slug = 'cristofaro';
