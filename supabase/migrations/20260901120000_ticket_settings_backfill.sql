-- La impresion automatica de ticket pasa a ser opt-in (Configuracion > Ticket), leida de
-- businesses.settings.ticket.auto_print_enabled con default false en el codigo cuando esa
-- clave no existe (ver DEFAULT_TICKET_SETTINGS). Antes de este cambio el codigo imprimia
-- SIEMPRE al confirmar una venta, sin configuracion de por medio -- para que los negocios
-- que ya venian usando el sistema no pierdan esa impresion automatica de golpe, se les
-- escribe aca el mismo objeto que representa DEFAULT_TICKET_SETTINGS pero con
-- auto_print_enabled en true (el resto de las claves tienen que estar presentes: el mapeo
-- del frontend las lee directo del jsonb, no completa claves faltantes con defaults propios
-- una vez que el objeto 'ticket' ya existe). Solo toca negocios que todavia no tienen la
-- clave 'ticket' en settings, asi que es seguro correrla mas de una vez y no pisa
-- configuracion que un negocio ya haya guardado desde la pantalla nueva.
update public.businesses
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{ticket}',
  '{"auto_print_enabled": true, "paper_width_mm": 80, "header_text": null, "footer_text": "¡Gracias por su compra!"}'::jsonb,
  true
)
where settings -> 'ticket' is null;
