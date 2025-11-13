# Pruebas manuales para POST /api/invoices

Estos pasos ayudan a validar el flujo de guardado de facturas y pagos múltiples.

1. Configura entorno mock:
   - Copia `.env.example` a `.env.local`.
   - Establece `MOCK_DATA=true`.
   - `npm run dev`.
2. Envía una solicitud POST:

```
POST http://localhost:3000/api/invoices
Content-Type: application/json

{
  "invoice_number": "F-TEST-1",
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
  "payments": [{ "method": "CASH", "amount": 116.00 }]
}
```

3. Espera respuesta 201 con `{ id, invoice_number }`.
4. Si proporcionaste `origin_order_id`, verifica que el pedido quede con estado `facturado` (`GET /api/orders` ya no debe devolverlo).
5. Cambia a `MOCK_DATA=false` y configura `DB_CONNECTION_STRING` para validar inserciones reales.
