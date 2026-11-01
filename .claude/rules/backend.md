---
paths:
  - "backend/**"
---
# Reglas del backend

- Toda la lógica de negocio vive en servicios del backend y se prueba: cálculo de kilos, precio por kilo (relleno + pan, combinado +$5), depósito de base, tarifa de envío, anticipo (50% del pedido; base y envío completos y aparte), capacidad de horarios (máximo 3 pedidos por media hora) y anticipación (2 días; vitrina el mismo día con 2 horas si hay pan).
- Las fórmulas de referencia están en `docs/reglas-de-negocio.md`. Las cifras viven en tablas editables desde el admin, no en constantes.
- Restricciones que el backend debe rechazar aunque el frontend las oculte: Red velvet solo seco; Choco-pingüino no envinado; Fresa con yogurt no envinado ni combinado; relleno combinado solo con base Normal y máximo 2 sabores; formas sin mezclar entre pisos; máximo 5 pisos; mínimo 4 kg.
- Pedidos con foto de referencia o "otra decoración": quedan en pausa hasta que la pastelería cotice; no se cobra nada antes.
- Pagos en sandbox (Mercado Pago y Stripe) con webhooks idempotentes. Efectivo: el pedido queda apartado y se cancela si no se paga ese día antes de las 22:30.
- Nota en PDF con código QR que abre `/nota/:token`; el token no es adivinable. Solo el personal con sesión registra la devolución de una base.
- Datos PENDIENTE: modelos y campos listos, valores vacíos y visibles en el admin; nunca inventados.
