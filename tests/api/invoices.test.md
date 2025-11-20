# Pruebas manuales para POST /api/invoices

Estos pasos ayudan a validar el flujo de guardado de facturas y pagos múltiples.

1. Configura entorno mock:
   - Copia `.env.example` a `.env.local`.
   - Establece `MOCK_DATA=true`.
   - `npm run dev`.
2. Abre una sesión de caja como administradora (`POST /api/cajas/aperturas`) con un payload similar a:

```
{
  "cash_register_code": "CAJA-01",
  "opening_amount": 500,
  "opening_notes": "Apertura de pruebas"
}
```

3. Envía una solicitud POST:

```
POST http://localhost:3000/api/invoices
Content-Type: application/json

{
  "invoice_date": "2024-05-01",
  "table_code": "M-12",
  "waiter_code": "MESERO01",
  "origin_order_id": 1,
  "subtotal": 100.00,
  "service_charge": 0,
  "vat_amount": 16.00,
  "vat_rate": 0.16,
  "total_amount": 116.00,
  "currency_code": "MXN",
  "items": [
    { "article_code": "CAF-001", "description": "Café americano", "quantity": 2, "unit_price": 35.00, "unit": "RETAIL" },
    { "article_code": "KIT-DESAYUNO", "description": "Kit desayuno ejecutivo", "quantity": 1, "unit_price": 80.00 }
  ],
  "payments": [{ "method": "CASH", "amount": 116.00 }]
}
```

4. Espera respuesta 201 con `{ id, invoice_number }`.
4. Espera respuesta 201 con `{ id, invoice_number }`. Si omites `invoice_number`, el servidor genera el folio usando el consecutivo configurado para la caja activa.
6. Si proporcionaste `origin_order_id`, verifica que el pedido quede con estado `facturado` (`GET /api/orders` ya no debe devolverlo).
7. Cambia a `MOCK_DATA=false` y configura `DB_CONNECTION_STRING` para validar inserciones reales.
