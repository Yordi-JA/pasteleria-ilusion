# Objetivos y definición del producto

Este documento fija qué construye el proyecto, para quién y cómo se evalúa. Las reglas de negocio las define la pastelería en [`../reglas-de-negocio.md`](../reglas-de-negocio.md); aquí solo se enlazan.

## Contenido

- [Datos del proyecto](#datos-del-proyecto)
- [Objetivo general](#objetivo-general)
- [Objetivos específicos](#objetivos-específicos)
- [Definición del producto o servicio](#definición-del-producto-o-servicio)
- [Trazabilidad de los objetivos](#trazabilidad-de-los-objetivos)
- [Rúbrica de evaluación](#rúbrica-de-evaluación)
- [Ver también](#ver-también)

## Datos del proyecto

| Dato | Valor |
| --- | --- |
| Institución | Universidad Nacional Autónoma de México (UNAM), Facultad de Ingeniería |
| Asignatura | Negocios Electrónicos y Desarrollo Web, semestre 2027-1, grupo 3 |
| Profesor | Mtro. Gerardo Gabriel Carrasco Zúñiga |
| Equipo | Equipo 02 |
| Integrantes | Jaramillo Rodríguez Leslie Citlalli, Jiménez Ayala Yordi Josué, Salas Hernández Camila Alexandra |
| Negocio | Pastelería Ilusión, pastelería familiar real de la Ciudad de México |

## Objetivo general

Aplicar los conceptos de la materia para desarrollar una aplicación web funcional de comercio electrónico que digitalice las ventas, el control de inventario y la gestión de pedidos de una pastelería local.

## Objetivos específicos

1. **Catálogo digital e inventario en tiempo real.** Mostrar los precios de cada producto o servicio y permitir consultar la disponibilidad para compra inmediata o apartado, sin ir al local.
2. **Cotización, compra y carrito en línea.** Permitir que el cliente cotice, compre y pague en línea uno o más pasteles o servicios.
3. **Diseño de pedidos a medida con precio exacto.** El cliente arma su pastel paso a paso y el backend calcula un precio exacto. Como complemento, una vista previa interactiva en WebGL (`react-three-fiber`) muestra el pastel, la oblea y las decoraciones. En la interfaz este flujo se llama "Diseña tu pastel".
4. **Garantías digitales para el préstamo de bases.** Sustituir la nota de papel por un comprobante digital en PostgreSQL, ligado a la cuenta del cliente, que gestione el depósito de la base y su reembolso cuando se devuelve.
5. **Agenda de entregas sin empalmes.** Proponer una fecha de entrega, o recibir la que propone el cliente, sin cruces de horario ni saturación de una fecha.
6. **Cancelaciones y devoluciones.** Ofrecer opciones claras y funcionales de cancelación y devolución. La política concreta la define la pastelería y sigue pendiente ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 14); el sistema guarda sus parámetros en la base de datos o el admin, con un marcador PENDIENTE visible.

## Definición del producto o servicio

El proyecto entrega tres servicios, separados en el dominio y en el código:

1. **Catálogo y vitrina.** Pasteles y postres de precio fijo, vitrina del día y rebanadas, con disponibilidad consultable.
2. **"Diseña tu pastel".** Un pedido personalizado de 8 pasos con vista previa y precio calculado por el backend, más el envío de referencia (hasta 3 imágenes) para diseños que el flujo no cubre. La pastelería responde con una cotización.
3. **Préstamo de bases con depósito.** Los pedidos de 4 kg o más llevan una base en préstamo con depósito; una nota en PDF con código QR lo respalda y el depósito se reembolsa al devolver la base.

## Trazabilidad de los objetivos

La tabla liga cada objetivo con las reglas que lo gobiernan, las vistas del mockup, los módulos del backend y la etapa del plan. Los módulos son los de la estructura obligatoria de [`arquitectura.md`](arquitectura.md#estructura-del-backend). Las etapas están en [`plan-de-trabajo.md`](plan-de-trabajo.md).

| Objetivo | Reglas de negocio | Vistas ([`mapa-de-vistas.md`](../mapa-de-vistas.md)) | Módulos del backend | Etapa |
| --- | --- | --- | --- | --- |
| 1. Catálogo e inventario | Secciones 1 (disponibilidad de pan) y 2 (catálogo) | Portada, Catálogo, Vitrina, Rebanadas de hoy, Ficha de producto, Vitrina agotada | `models.py`, `repositories/product_repo.py`, `api/` | 2 (modelos y API), 3 (pantallas) |
| 2. Cotización, compra y carrito | Secciones 4 a 6 (precio), 8 (entrega), 9 (envío de referencia), 10 (pago) | Carrito, Entrega, Pago, Pago rechazado, Confirmación, Pedido apartado, Enviar referencia, Cotización lista | `services/pricing_service.py`, `services/payments/payment_factory.py`, `repositories/order_repo.py` | 3 y 4 |
| 3. Pedidos a medida con precio exacto | Secciones 3 a 6 (pasos 1 a 7) y 6.3 (oblea) | "Diseña tu pastel", pasos 1 a 8 y sus estados | `services/pricing_service.py` (Strategy); en el frontend, `frontend/src/three/` | 3 |
| 4. Garantías de bases | Secciones 7 (depósito), 11 (nota y QR), 12 (estado de la base) | Bases en préstamo (cuenta y `/bases`), Nota de pedido en PDF, Verificación de la nota, Detalle de pedido | `services/warranty_service.py`, `repositories/order_repo.py`, `services/orders/order_observer.py` | 4 |
| 5. Agenda de entregas | Sección 1 (lapsos, capacidad, anticipación) y 8 (entrega) | Entrega (calendario con días no disponibles) | `repositories/order_repo.py` (agenda), `models.py` | 4 |
| 6. Cancelaciones y devoluciones | Secciones 10 (efectivo no recibido), 12 (`cancelado`) y 14 (política pendiente) | Pedido apartado, Detalle de pedido, Mis pedidos | `services/orders/order_observer.py`, `repositories/order_repo.py` | 4 |

La tabla mapea módulos a objetivos; el reparto fino de funciones dentro de cada archivo se decide al programarlo en las etapas 2 a 4.

## Rúbrica de evaluación

La meta es el nivel "Excelente" (9.5 a 10) en cada rubro. Los criterios son los de la rúbrica oficial del profesor.

| Rubro | Excelente (9.5 a 10) | Muy bien (8.5 a 9.4) | Bien (7.5 a 8.4) | Regular (5.5 a 7.4) |
| --- | --- | --- | --- | --- |
| Objetivo | Definición clara | Múltiples objetivos o ambiguos | Inviable o no factible | Sin objetivo |
| Definición de producto o servicio | Claridad en el producto y/o servicios | Demasiados productos y/o servicios | No es claro qué producto y/o servicio | No se define producto o servicio |
| Estrategia | Estrategia detallada, clara y precisa | Estrategia general | Estrategia ambigua o imprecisa | Sin estrategia |
| Arquitectura | Arquitectura diagramada y explicada | Arquitectura diagramada o explicada | Arquitectura mencionada | Sin arquitectura |
| Plan de trabajo (baseline vs. real) | Plan real, retador, explicado y justificado | Plan real vs. baseline | Plan baseline | Sin plan baseline ni real |
| Tecnología | Tecnología claramente documentada y detallada | Tecnología detallada | Tecnología definida | Sin tecnología |
| Framework | Framework seleccionado, instalado y demostrado | Framework seleccionado y mostrado | Framework mencionado | No usó framework |
| Prototipo / mockup | Demo funcional y presentada (pruebas como valor agregado) | Demo presentada | Demo en diapositivas | Sin demo |
| Fuentes | Documentación de fuentes y bibliografía en APA | Documentación de fuentes sin formato APA | Tabla final de bibliografía | Sin referencias |

### Cómo la cubre el proyecto

La columna "Estado" dice lo que existe hoy (1 de noviembre de 2026). Lo marcado como pendiente se cierra en la etapa indicada.

| Rubro | Cómo lo cubre el proyecto | Evidencia | Estado |
| --- | --- | --- | --- |
| Objetivo | Un objetivo general y seis específicos, cada uno ligado a reglas, vistas y módulos | Este documento, [trazabilidad](#trazabilidad-de-los-objetivos) | Listo |
| Definición de producto o servicio | Tres servicios separados: catálogo y vitrina, "Diseña tu pastel", bases con depósito | Este documento, [definición](#definición-del-producto-o-servicio); [`../reglas-de-negocio.md`](../reglas-de-negocio.md) | Listo |
| Estrategia | Cinco etapas iterativas con capas de software separadas; backend y frontend en paralelo desde la Etapa 2 | [`plan-de-trabajo.md`](plan-de-trabajo.md), [`decisiones.md`](decisiones.md) | Listo |
| Arquitectura | Diagramas Mermaid de contexto, capas, MVVM, patrones y estados; frontend en MVVM y backend en MVT con servicios y repositorios | [`arquitectura.md`](arquitectura.md) | Documentada; sin código todavía |
| Plan de trabajo (baseline vs. real) | Tabla del anteproyecto, plan real en 5 etapas, Gantt comparativo, justificación del desfase y registro de cambios | [`plan-de-trabajo.md`](plan-de-trabajo.md), [`../bitacora.md`](../bitacora.md) | Listo; se actualiza cada etapa |
| Tecnología | Rol, justificación y versión de cada tecnología; decisiones abiertas | [`tecnologias.md`](tecnologias.md) | Documentada; versiones por fijar en la Etapa 2 |
| Framework | Django (con ORM, admin y DRF) y React, instalados y demostrados | [`tecnologias.md`](tecnologias.md); código en `backend/` y `frontend/` | Seleccionados; instalación en la Etapa 2 |
| Prototipo / mockup | Mockup de alta fidelidad con 60 vistas en escritorio y móvil y 119 capturas; después, el sitio conectado al backend y una suite con pytest y Playwright | `mockup/fuente/`, `mockup/capturas/`, [`../mapa-de-vistas.md`](../mapa-de-vistas.md), [`pruebas.md`](pruebas.md) | Mockup listo; pruebas en las etapas 2 a 4 y demo en el cierre (Etapa 5) |
| Fuentes | Referencias en APA 7.ª edición de cada tecnología, de WCAG 2.1 y de los patrones de diseño | [`referencias.md`](referencias.md) | Lista inicial; se completa en el reporte final |

## Ver también

- [Arquitectura](arquitectura.md)
- [Plan de trabajo](plan-de-trabajo.md)
- [Tecnologías](tecnologias.md)
- [Pruebas](pruebas.md)
- [Reglas de negocio](../reglas-de-negocio.md)
- [Mapa de vistas](../mapa-de-vistas.md)
