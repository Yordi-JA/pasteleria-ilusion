# Plan de trabajo: baseline y plan real

El anteproyecto del 1 de octubre de 2026 planeó 8 semanas. El plan real tiene 5 etapas: la Etapa 1 (8 al 31 de octubre) está completada, la Etapa 2 (1 al 7 de noviembre) está completada desde el 6 de noviembre y la Etapa 3 (8 al 13 de noviembre) está por iniciar. Sus entregables (reporte, código y presentación) quedan listos el 23 de noviembre, para la exposición del 24 o del 26 y la entrega del 26. El baseline se conserva sin cambios. Este documento contrasta ambos planes, justifica el desfase y registra los cambios.

## Contenido

- [Baseline original](#baseline-original)
- [Justificación del desfase de la Etapa 1](#justificación-del-desfase-de-la-etapa-1)
- [Plan real en 5 etapas](#plan-real-en-5-etapas)
- [Ejecución real](#ejecución-real)
- [Gantt: baseline y plan real](#gantt-baseline-y-plan-real)
- [Correspondencia con las fases del prompt maestro](#correspondencia-con-las-fases-del-prompt-maestro)
- [Registro de cambios al plan](#registro-de-cambios-al-plan)
- [Riesgos](#riesgos)
- [Ver también](#ver-también)

## Baseline original

El anteproyecto se entregó el 1 de octubre de 2026 con un plan de 8 semanas lineales. La tabla da las fechas desde la entrega (1 de octubre) y desde el arranque técnico (8 de octubre), y el estado real al 4 de noviembre de 2026.

| Etapa (semana) | Fechas desde la entrega (1 oct) | Fechas desde el arranque (8 oct) | Actividad del anteproyecto | Resultado esperado | Estado real al 4 nov 2026 |
| --- | --- | --- | --- | --- | --- |
| 1 | 01 oct al 07 oct | 08 oct al 14 oct | Objetivos y requerimientos; mockup de la interfaz; arquitectura (diagrama de contexto) | Objetivos, requerimientos, mockup y diagrama de contexto definidos | Completada y ampliada (8 al 31 oct): reglas de negocio validadas con la pastelería, arquitectura con patrones, identidad visual y mockup de alta fidelidad de 60 vistas en escritorio y móvil. Es diseño, no código |
| 2 | 08 oct al 14 oct | 15 oct al 21 oct | Framework (selección, instalación, justificación); base de datos relacional; módulo de usuarios e inventario en tiempo real | Framework instalado, base de datos diseñada, módulo de usuarios e inventario desarrollado | En curso (Etapa 2 real). Django 5.2 y React instalados (D24, D25); PostgreSQL 18 con el esquema del catálogo, el inventario y la configuración editable, repositorios y admin (D32); modelo de usuario con correo (D27). Faltan los demás endpoints de negocio (etapas 3 y 4) |
| 3 | 15 oct al 21 oct | 22 oct al 28 oct | Frontend del catálogo; vista de precios; sistema para cotizar pedidos | Catálogo funcional con precios y cotización | Diseño terminado en el mockup; el código no existe. Se programa en la Etapa 3 real, conectado a la API |
| 4 | 22 oct al 28 oct | 29 oct al 04 nov | Módulo WebGL para personalizar y previsualizar en 3D obleas y decoraciones | Módulo WebGL funcional | Flujo visual y reglas del flujo "Diseña tu pastel" definidos; el backend ya calcula el precio y las opciones (D39). El lienzo 3D se programa en la Etapa 3 real |
| 5 | 29 oct al 04 nov | 05 nov al 11 nov | Carrito y pasarela de pagos; base de datos de los importes de bases ligados a cuentas | Pasarela integrada y garantías digitales ligadas a cuentas | Diseño de interfaz y reglas listos; el depósito de la base ya se calcula (D39). Integración de pagos y garantías: Etapa 4 real |
| 6 | 05 nov al 11 nov | 12 nov al 18 nov | Agenda de entregas sin empalmes; cancelaciones y devoluciones | Agenda y cancelaciones funcionales | Reglas de capacidad, lapsos y anticipación definidas; código en la Etapa 4 real. La política de cancelaciones sigue pendiente de la pastelería |
| 7 | 12 nov al 18 nov | 19 nov al 25 nov | Pruebas integrales de compra e inventario; demo funcional | Sistema probado y demo preparado | Pendiente. Las pruebas automatizadas se hacen dentro de las etapas 2 a 4 y la verificación final es el 20 nov (Etapa 5 real). Se amplía con despliegue desde la Etapa 2, que ya existe desde el 4 nov (D38) |
| 8 | 19 nov al 25 nov | 26 nov al 02 dic | Propuesta de negocio; reporte final; fuentes | Propuesta afinada, reporte y referencias | Pendiente (Etapa 5 real): reporte el 21 nov, con la comparativa baseline vs. real y las referencias APA, y presentación el 22 nov |

## Justificación del desfase de la Etapa 1

En el baseline, la semana 1 era un boceto rápido y la semana 2 pasaba a la base de datos. El equipo empezó el 8 de octubre y la Etapa 1 se alargó hasta el 31 de octubre por dos razones.

### Las reglas del negocio cambiaban con cada respuesta de la pastelería

Los flujos de "Diseña tu pastel", el préstamo de bases y la agenda sin empalmes tenían reglas complejas. La bitácora ([`../bitacora.md`](../bitacora.md)) muestra que esas reglas se fueron cerrando durante todo el mes:

- 26 de octubre: anticipación real de 2 días, paso de personas con mínimo de 4 kg y redondeo, relleno en dos niveles.
- 28 de octubre: horarios de la pastelería y de entrega, productos y precios reales, encargo de vitrina el mismo día, oblea de $125.
- 29 de octubre: anticipo del 50%, depósito de la base pagado completo y aparte, efectivo como pedido apartado, y creación de [`../reglas-de-negocio.md`](../reglas-de-negocio.md).
- 31 de octubre: bases y tarifa de envío aprobadas por la pastelería, y el envío se cobra completo y aparte del 50%.

Programar el esquema de PostgreSQL antes de esos cambios habría obligado a rehacer migraciones y modelos.

### La identidad visual se definió en la misma etapa

La pastelería real no tenía identidad visual. El 12 de octubre se fijó la dirección "Betún y duya" y el logo con la vela en la i; la paleta cambió dos veces (de jamaica a durazno el 12 de octubre y a "Fresa y mermelada" el 31 de octubre); y el libro de marca ([`../libro-de-marca.md`](../libro-de-marca.md)) quedó como documento rector visual. El 31 de octubre por la noche empezó el kit para construir el sitio, con 119 capturas de todas las vistas; quedó terminado el 1 de noviembre.

### Qué se adelantó y qué no

Se adelantó el diseño de las vistas, no el código. El mockup son prototipos HTML de un lienzo de diseño (`mockup/fuente/*.dc.html`): 120 tableros que equivalen a 60 vistas en escritorio y móvil, con estados de carga, error, vacío y agotado. No son componentes React y no abren solos, porque dependen de archivos del lienzo que no vienen en el repositorio.

La Etapa 1 absorbió así el diseño de las semanas 1, 3, 5 y 6 del baseline. A partir del 1 de noviembre, el backend cuenta con reglas y contratos de datos definidos, y el frontend tiene una referencia visual completa de cada pantalla. Como ese código no existe, el frontend arranca en la Etapa 2 junto con el backend (ver el [registro de cambios](#registro-de-cambios-al-plan)).

## Plan real en 5 etapas

| Etapa | Fechas | Estado | Entregables |
| --- | --- | --- | --- |
| 1. Levantamiento, identidad visual y diseño | 8 al 31 oct | Completada | Requerimientos y reglas de negocio validadas con la pastelería; identidad visual ("Betún y duya", paleta Fresa y mermelada, logo con la vela, dibujos de línea); libro de marca; mockup de alta fidelidad (60 vistas en escritorio y móvil, con estados); arquitectura y patrones |
| 2. Backend, base de datos y frontend base | 1 al 7 nov | Completada | Backend: proyecto Django y PostgreSQL, modelos ORM, repositorios, servicios de precio y garantías, DRF bajo `/api/v1/`, `drf-spectacular` en `/api/v1/docs/`, admin con precios y límites editables. Frontend base, en paralelo: React y Tailwind con el preset y las fuentes, componentes base del libro de marca, rutas de [`../mapa-de-vistas.md`](../mapa-de-vistas.md), página de muestra. Elección de la PaaS y despliegue del esqueleto de Django y React. Pruebas de lo que se construye. Cierre el 6 nov: proyecto Django 5.2 con PostgreSQL 18 (D24), DRF bajo `/api/v1/` con Swagger solo para el personal, usuario con correo (D27), seguridad de la sesión (D28), esquema del catálogo, inventario y configuración editable con repositorios y admin (D32), límite de intentos (D34), servicios de precio y depósito de la base con `GET /api/v1/cake-designs/options/` y `POST /api/v1/cake-designs/price/` (D39), datos del negocio con `GET /api/v1/store/info/` (D41); frontend con Vite, React, TypeScript y Tailwind con el preset y las fuentes (D25), componentes base y página de muestra (D36), marco del sitio y las 26 rutas del mapa de vistas (D42), perlas de avance y esqueleto de carga (D43); esqueleto desplegado en Heroku desde el 4 nov (D26, D38) con dominio propio https://pasteleriailusion.me y la redirección de `www` (D40); pruebas: 801 de backend y 91 E2E |
| 3. Pantallas conectadas e integración 3D | 8 al 13 nov | Por iniciar | Al iniciar, se define el mínimo para la exposición: qué se demuestra en vivo de cada uno de los 6 objetivos y qué entra solo si sobra tiempo. Portada, catálogo, vitrina, rebanadas y ficha conectados a la API; acceso con Google y correo; "Diseña tu pastel" (8 pasos) con `react-three-fiber` y precio calculado por el backend (Strategy). Con sus pruebas y revisión de accesibilidad por pantalla |
| 4. Compra, pagos, garantías y agenda | 14 al 19 nov | Por iniciar | Carrito; entrega con agenda sin empalmes (lapsos de 30 min, máximo 3 pedidos por lapso, 2 días de anticipación); pago con Factory Method y Adapter, `Idempotency-Key` y webhooks idempotentes; Observer de eventos del pedido; garantías de bases (nota PDF con QR, `/nota/:token`, devolución registrada por el personal); envío de referencia y cotización; cancelaciones. Con sus pruebas. El jueves 19 se congela el código y desde ahí solo se corrigen fallas |
| 5. Cierre: verificación, reporte y presentación | 20 al 23 nov | Por iniciar | Vie 20: verificación (pruebas en el sitio desplegado, revisión final de accesibilidad, video de respaldo de la demo). Sáb 21: reporte final, con la comparativa baseline contra real cerrada con las fechas reales y las referencias APA. Dom 22: presentación. Lun 23: ensayo general, revisión cruzada, etiqueta del commit final y zip del código (lo genera el equipo, D23); los tres entregables quedan listos |

Las 8 etapas del baseline se consolidan así: la Etapa 2 real cubre la semana 2 y la base de datos de las semanas 5 y 6; la Etapa 3, las semanas 3 y 4; la Etapa 4, las semanas 5 y 6; las pruebas de la semana 7 se reparten en las etapas 2 a 4, y la Etapa 5 cubre su verificación final y la semana 8.

Pruebas (`pytest` con `pytest-django` y Playwright) y accesibilidad WCAG 2.1 AA no son una etapa propia: se hacen dentro de las etapas 2 a 4, pantalla por pantalla. El despliegue empieza en la Etapa 2.

Hitos:

- Jueves 19 de noviembre: congelamiento del código. Del 19 al 23 solo se corrigen fallas.
- Lunes 23 de noviembre: entregables listos, con la etiqueta del commit final y el zip del código.
- Martes 24 o jueves 26 de noviembre: exposición (el equipo no sabe qué día le toca y planea para el 24). Del 24 al 26 hay holgura solo para correcciones al reporte o a la presentación, sin código.
- Jueves 26 de noviembre: entrega del reporte, el código (como archivos) y la presentación.

## Ejecución real

Esta tabla se llena al cerrar cada etapa. Si algo se adelanta o se atrasa, se anota aquí y el baseline no se toca.

| Etapa | Plan real | Cierre real | Diferencia contra el plan real | Notas |
| --- | --- | --- | --- | --- |
| 1 | 8 al 31 oct | 31 oct | Sin diferencia | El kit para construir el sitio se terminó el 1 nov (ver la [justificación](#la-identidad-visual-se-definió-en-la-misma-etapa)) |
| 2 | 1 al 7 nov | 6 nov | Un día antes | Las perlas de avance y el esqueleto de carga (D43) cerraron los componentes base el 6 nov. Los endpoints de catálogo, vitrina, rebanadas y ficha no estaban en la etapa y se hacen con sus pantallas en la Etapa 3. El orden de la Etapa 3 queda: portada, "Diseña tu pastel" con el 3D, catálogo, ficha, vitrina y rebanadas, y acceso; el mínimo para la exposición se define al iniciarla |
| 3 | 8 al 13 nov | Por cerrar | Por cerrar | Por cerrar |
| 4 | 14 al 19 nov | Por cerrar | Por cerrar | Por cerrar |
| 5 | 20 al 23 nov | Por cerrar | Por cerrar | Por cerrar |

## Gantt: baseline y plan real

Las barras del baseline son el plan y no llevan estado de avance; usan las fechas desde la entrega (1 de octubre). El plan real sí muestra el avance al 6 de noviembre de 2026.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"background": "#fff4f4", "primaryColor": "#f9c1c1", "primaryTextColor": "#5e1921", "primaryBorderColor": "#5e1921", "lineColor": "#664243", "textColor": "#5e1921", "titleColor": "#5e1921", "sectionBkgColor": "#fff4f4", "altSectionBkgColor": "#fffbfb", "sectionBkgColor2": "#fff4f4", "gridColor": "#ecd2d2", "taskBkgColor": "#fffbfb", "taskBorderColor": "#664243", "taskTextColor": "#5e1921", "taskTextDarkColor": "#5e1921", "taskTextLightColor": "#5e1921", "taskTextOutsideColor": "#5e1921", "activeTaskBkgColor": "#f9c1c1", "activeTaskBorderColor": "#5e1921", "doneTaskBkgColor": "#ecd2d2", "doneTaskBorderColor": "#5e1921", "todayLineColor": "#8f5413"}}}%%
gantt
    title Baseline del anteproyecto y plan real (2026)
    dateFormat YYYY-MM-DD
    axisFormat %d/%m

    section Baseline (8 semanas)
    B1 Objetivos, mockup y contexto       :b1, 2026-10-01, 7d
    B2 Framework, base de datos e inventario :b2, 2026-10-08, 7d
    B3 Frontend del catálogo y cotización :b3, 2026-10-15, 7d
    B4 Módulo WebGL                       :b4, 2026-10-22, 7d
    B5 Carrito, pagos y garantías         :b5, 2026-10-29, 7d
    B6 Agenda y devoluciones              :b6, 2026-11-05, 7d
    B7 Pruebas integrales y demo          :b7, 2026-11-12, 7d
    B8 Propuesta y reporte                :b8, 2026-11-19, 7d

    section Plan real (5 etapas)
    R1 Reglas, identidad visual y mockup  :done, r1, 2026-10-08, 24d
    R2 Backend y base de datos            :done, r2a, 2026-11-01, 7d
    R2 Frontend base                      :done, r2b, 2026-11-01, 7d
    R3 Pantallas conectadas y 3D          :r3, 2026-11-08, 6d
    R4 Pagos, garantías y agenda          :r4, 2026-11-14, 6d
    R5 Verificación                       :r5a, 2026-11-20, 1d
    R5 Reporte                            :r5b, 2026-11-21, 1d
    R5 Presentación                       :r5c, 2026-11-22, 1d
    R5 Ensayo y revisión cruzada          :r5d, 2026-11-23, 1d
    Congelamiento del código              :milestone, m1, 2026-11-19, 0d
    Exposición posible (martes)           :milestone, m2, 2026-11-24, 0d
    Exposición posible (jueves) y entrega :milestone, m3, 2026-11-26, 0d
```

## Correspondencia con las fases del prompt maestro

El prompt maestro con el que se encargó la construcción dividía el trabajo en 6 fases. Caen dentro de las 5 etapas así. La correspondencia es una previsión: el reparto de pantallas dentro de las etapas 3 y 4 se confirma al iniciarlas.

| Fase | Contenido | Etapa |
| --- | --- | --- |
| 1. Base | `frontend/` y `backend/`; componentes base del libro de marca; página de muestra | 2 |
| 2. Catálogo | Modelos de productos e inventario; admin de productos, precios y existencias; portada, catálogo, vitrina, rebanadas y ficha | 2 (modelos y admin) y 3 (pantallas) |
| 3. Cuenta y compra | Acceso con Google y correo; carrito; entrega con horarios y tarifa; pago en sandbox y efectivo; confirmación; "Mis pedidos"; detalle con bases | 3 (acceso) y 4 (el resto) |
| 4. Diseña tu pastel | Los 8 pasos con reglas validadas en el backend; precio calculado por el backend; vista previa 3D por etapas; revisión y paso al carrito | 3 (el paso al carrito se completa en la 4) |
| 5. Referencia y nota | Pedido con foto de referencia y cotización; nota en PDF con QR y su página de verificación; devolución de bases | 4 |
| 6. Cierre | Accesibilidad WCAG 2.1 AA; pruebas de la lógica de negocio; revisión de interfaz; lista de datos PENDIENTE | 2 a 4 (accesibilidad, pruebas y revisión por pantalla) y 5 (revisión final y lista de datos PENDIENTE) |

## Registro de cambios al plan

| Fecha | Cambio | Motivo |
| --- | --- | --- |
| 1 nov 2026 | Se corrige la narrativa del mockup: son prototipos de diseño, no código React. El frontend arranca en la Etapa 2 y avanza en paralelo con el backend | La Etapa 1 adelantó el diseño de las vistas, no su programación. Esperar al backend para empezar el frontend dejaría las etapas 3 y 4 sin margen |
| 1 nov 2026 | La Etapa 2 pasa de "backend y base de datos" a "backend, base de datos y frontend base" | Consecuencia del cambio anterior |
| 1 nov 2026 | Las etapas 3 a 5 pasan de 8 al 14, 15 al 21 y 22 al 28 de noviembre a 8 al 13, 14 al 19 y 20 al 23. Pruebas y accesibilidad se hacen dentro de las etapas 2 a 4 y el despliegue empieza en la Etapa 2 | Exposición el 24 o el 26 de noviembre y entrega el 26 con reporte, código y presentación (D23) |

## Riesgos

| Riesgo | Efecto posible | Mitigación |
| --- | --- | --- |
| Carga del frontend: 60 vistas con sus estados, 8 pasos de "Diseña tu pastel" y escena 3D, que ahora se construyen en el mismo periodo que el backend | Pantallas incompletas al cierre | Empezar por los componentes base y la página de muestra; construir cada pantalla contra sus capturas de escritorio y móvil; avanzar por etapas |
| Datos PENDIENTE de la pastelería: precio de las decoraciones fijas, repartidor propio o aplicación, vigencia de una cotización, políticas de cambios y cancelaciones, base dañada, dirección, WhatsApp, aviso de privacidad y términos | No se pueden cerrar el objetivo 6 ni los textos legales | Dejar cada dato configurable en la base de datos o el admin, con marcador PENDIENTE visible; nunca un valor supuesto. Las decoraciones fijas sin precio se muestran con "Precio por confirmar" y no se pueden elegir (D39) |
| Integración de tres formas de pago (Mercado Pago, Stripe y efectivo) con cobros duplicados o webhooks repetidos | Cobros dobles o estados inconsistentes | Factory Method con registro y Adapter por SDK; `Idempotency-Key`; webhooks idempotentes; pruebas con SDK simulados |
| Fechas fijas: las etapas 3 y 4 pierden un día cada una y absorben pruebas y despliegue | Pantallas o pruebas incompletas al congelar el código | Pruebas y accesibilidad por pantalla; despliegue desde la Etapa 2; mínimo para la exposición definido al iniciar la Etapa 3; congelamiento del código el 19 de noviembre |
| Decisión abierta: la API de distancias para la tarifa de envío. Las versiones (D24, D25) y la PaaS (D26) ya están resueltas | Retrasos al integrar el envío en la Etapa 4 | Elegir la API de distancias antes de la Etapa 4; ver [`tecnologias.md`](tecnologias.md#decisiones-abiertas) |

## Ver también

- [Objetivos y definición del producto](objetivos.md)
- [Arquitectura](arquitectura.md)
- [Decisiones](decisiones.md)
- [Bitácora del proyecto](../bitacora.md)
- [Reglas de negocio](../reglas-de-negocio.md)
