-- Seed new permissions for cuentas por cobrar workflows
INSERT INTO "app"."permissions" ("code", "name", "description")
VALUES
  ('menu.cxc.view',            'Acceso a Cuentas por Cobrar', 'Permite consultar clientes, documentos y gestiones de cartera'),
  ('customers.manage',         'Gestión de clientes',         'Permite crear y editar clientes del catálogo'),
  ('payment-terms.manage',     'Gestión de condiciones',      'Permite administrar las condiciones de pago disponibles'),
  ('customer.documents.manage','Gestión de documentos CxC',   'Permite crear documentos de cuentas por cobrar y notas asociadas'),
  ('customer.documents.apply', 'Aplicación de documentos',    'Permite aplicar y revertir pagos, recibos y retenciones'),
  ('customer.credit.manage',   'Gestión de líneas de crédito','Permite asignar y ajustar límites de crédito por cliente'),
  ('customer.collections.manage','Gestión de cobranza',       'Permite registrar seguimientos, promesas y actividades de cobranza'),
  ('customer.disputes.manage', 'Gestión de disputas',         'Permite registrar y resolver disputas asociadas a documentos')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updated_at" = CURRENT_TIMESTAMP;

WITH admin_role AS (
  SELECT id FROM "app"."roles" WHERE code = 'ADMINISTRADOR' LIMIT 1
),
permission_ids AS (
  SELECT id
  FROM "app"."permissions"
  WHERE code IN (
    'menu.cxc.view',
    'customers.manage',
    'payment-terms.manage',
    'customer.documents.manage',
    'customer.documents.apply',
    'customer.credit.manage',
    'customer.collections.manage',
    'customer.disputes.manage'
  )
)
INSERT INTO "app"."role_permissions" ("role_id", "permission_id")
SELECT ar.id, pid.id
FROM admin_role ar
CROSS JOIN permission_ids pid
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
