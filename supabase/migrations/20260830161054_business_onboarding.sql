-- Wizard de bienvenida (primer login): permite saber si un negocio ya paso por la carga
-- inicial (productos, revision de medios de pago) o si hay que mandarlo a /bienvenida antes
-- del dashboard normal. Se agrega con default false para que los negocios NUEVOS lo vean, y
-- se hace backfill a true para los negocios EXISTENTES (ya vienen usando el sistema, no
-- tiene sentido interrumpirlos con el wizard).
alter table public.businesses add column onboarding_completed boolean not null default false;
update public.businesses set onboarding_completed = true;
