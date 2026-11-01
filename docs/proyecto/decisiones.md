# Registro de decisiones

Este registro guarda las decisiones del proyecto con su fecha, su contexto y lo que cambian. Las decisiones D1 a D22 se tomaron entre el 12 de octubre y el 1 de noviembre de 2026.

## Contenido

- [Cómo registrar una decisión](#cómo-registrar-una-decisión)
- [Decisiones tomadas](#decisiones-tomadas)
- [Decisiones abiertas](#decisiones-abiertas)
- [Ver también](#ver-también)

## Cómo registrar una decisión

1. Asigna el siguiente ID libre (`D13`, `D14`...). Los IDs no se reutilizan.
2. Agrega una entrada al final de [Decisiones tomadas](#decisiones-tomadas) con estos cuatro campos: fecha, decisión, contexto y consecuencias.
3. Si la decisión reemplaza a otra, deja la anterior en su lugar y escribe en ambas "Reemplazada por Dn" y "Reemplaza a Dn".
4. Si venía de la lista de abiertas, quítala de [Decisiones abiertas](#decisiones-abiertas).
5. Actualiza en el mismo cambio los documentos que la decisión afecta.
6. Anótala en [`../bitacora.md`](../bitacora.md) con la fecha del día.

## Decisiones tomadas

### D1. Paleta "Fresa y mermelada" como documento rector visual

- **Fecha:** 31 de octubre de 2026.
- **Decisión:** La paleta del sitio es "Fresa y mermelada" y el documento rector visual es [`../libro-de-marca.md`](../libro-de-marca.md).
- **Contexto:** El documento de contexto inicial hablaba de una paleta "Noche y Caramelo" y de un archivo `design.md`. Ninguno existe: es un error del documento. La paleta pasó de jamaica a durazno el 12 de octubre y a "Fresa y mermelada" el 31 de octubre ([`../bitacora.md`](../bitacora.md)).
- **Consecuencias:** Solo se usan los tokens de `design/tokens.css` y `design/tailwind.preset.js`. "Noche y Caramelo" no se usa en ningún otro documento.

### D2. El mockup es diseño; el frontend arranca en la Etapa 2

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** Se corrige la narrativa del mockup y el frontend se construye en la Etapa 2, junto con el backend.
- **Contexto:** El mockup son prototipos HTML de un lienzo de diseño (`mockup/fuente/*.dc.html`): 120 tableros que equivalen a 60 vistas en escritorio y móvil, con estados de carga, error, vacío y agotado, más 119 capturas en `mockup/capturas/`. No son React y no abren solos, porque dependen de archivos del lienzo que no vienen. El documento de contexto decía que el catálogo y el cotizador ya estaban maquetados en React y Tailwind, lo cual es falso.
- **Consecuencias:** La Etapa 1 adelantó el diseño, no el código. La Etapa 2 incluye un frontend base en paralelo. Mayor carga de trabajo en noviembre ([`plan-de-trabajo.md`](plan-de-trabajo.md#riesgos)).

### D3. Tres formas de pago, con fábrica y registro

- **Fecha:** 12 de octubre de 2026 (Mercado Pago y Stripe) y 29 de octubre de 2026 (efectivo como pedido apartado).
- **Decisión:** Los pagos son Mercado Pago, Stripe (tarjeta) y efectivo en la pastelería (pedido apartado), todos en sandbox durante el desarrollo.
- **Contexto:** Mercado Pago y Stripe se definieron el 12 de octubre ([`../bitacora.md`](../bitacora.md)). El documento de contexto solo mencionaba Mercado Pago.
- **Consecuencias:** El Factory Method con registro (`REGISTRO_PASARELAS`) admite `mercadopago`, `stripe` y `efectivo` sin `if/elif` ([`arquitectura.md`](arquitectura.md#fábrica-de-pagos)).

### D4. Estados del pedido de las reglas de negocio

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** Los estados son los de [`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 12: `apartado`, `recibido`, `en_preparacion`, `listo_para_entregar`, `entregado`, `cancelado` y `en_pausa_por_cotizacion`. La base va de `prestada` a `devuelta`, con fecha límite igual a la entrega más 15 días. El envío de referencia va de `en_revision` a `cotizacion_lista`.
- **Contexto:** El documento de contexto daba como ejemplos `PAGADO` y `BASE_DEVUELTA`, que eran ilustrativos.
- **Consecuencias:** Esos dos estados no se usan. Los diagramas están en [`arquitectura.md`](arquitectura.md#estados-del-pedido-y-de-la-base).

### D5. Cancelaciones y devoluciones con parámetros configurables

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** El objetivo 6 se cumple con un mecanismo cuyos parámetros viven en la base de datos o el admin y llevan un marcador PENDIENTE visible. No se inventa la política.
- **Contexto:** La política de cambios y cancelaciones, y qué pasa con una base dañada, los define la pastelería ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 14).
- **Consecuencias:** La única cancelación definida es la del efectivo no recibido el mismo día. Lo demás se completa cuando la pastelería responda.

### D6. Vocabulario: interfaz frente a documentación técnica

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** La interfaz sigue el libro de marca: "Diseña tu pastel", nunca "cotizador", y "cotización" solo para el envío de referencia. En el código, la documentación técnica y el reporte académico sí se puede decir "cotizador 3D".
- **Contexto:** El modelo previsto `Cotizaciones3D` choca con la "cotización" del envío de referencia.
- **Consecuencias:** El choque queda abierto y se resuelve en la Etapa 2 (ver [decisiones abiertas](#decisiones-abiertas)).

### D7. Idioma de los identificadores

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** La interfaz va en español de México. Los identificadores del dominio van en español (`PagoBase`, `cobrar`, `crear_procesador_pago`, `REGISTRO_PASARELAS`). Los nombres de archivo y los sufijos técnicos que exige la arquitectura van en inglés (`pricing_service.py`, `product_repo.py`).
- **Contexto:** La especificación de arquitectura mezclaba ambos idiomas.
- **Consecuencias:** Una convención fija para el código nuevo.

### D8. `AGENTS.md` como fuente única de instrucciones para agentes

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** `AGENTS.md` (raíz, `backend/` y `frontend/`) es la única fuente de instrucciones para agentes. Cada carpeta tiene un `CLAUDE.md` que importa su `AGENTS.md` con `@AGENTS.md`. El documento de contexto inicial y el prompt maestro se absorben en la documentación y se retiran.
- **Contexto:** Las instrucciones estaban repartidas en `CLAUDE.md`, `.claude/rules/`, el documento de contexto y el prompt maestro.
- **Consecuencias:** Los dos archivos retirados quedan en el primer commit del repositorio. Las reglas de carpeta pasaron a `backend/AGENTS.md` y `frontend/AGENTS.md`, y `BITACORA.md` a `docs/bitacora.md`.

### D9. Repositorio público sin secretos

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** El repositorio se publica como público. Ningún secreto entra al repositorio: `.env` está ignorado, `.env.example` solo trae nombres y las subidas de clientes nunca se versionan.
- **Contexto:** El repositorio se publicará en https://github.com/Yordi-JA/pasteleria-ilusion y el proyecto maneja claves de pasarelas de pago y datos de clientes de una pastelería real.
- **Consecuencias:** `.gitignore` cubre secretos y datos de clientes.

### D10. Lo académico vive solo en `README.md` y `docs/proyecto/`

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** La información de la materia, la rúbrica y el plan viven solo en `README.md` y en `docs/proyecto/`. El sitio nunca menciona que es un proyecto escolar.
- **Contexto:** La pastelería es real y el sitio es su sitio, no una entrega.
- **Consecuencias:** El texto de la interfaz y los documentos de negocio (`docs/reglas-de-negocio.md`, `docs/libro-de-marca.md`) no hablan de la materia.

### D11. Flujo de git

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** `main` más ramas `tipo/descripcion-corta` por cada PR, y Conventional Commits en español.
- **Contexto:** El repositorio se inicializó el 1 de noviembre.
- **Consecuencias:** Cada cambio llega por PR desde una rama con tipo en el nombre.

### D12. Versiones sin fijar hasta la Etapa 2

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** No se documentan versiones ni la herramienta de compilación del frontend hasta inicializar Django y React en la Etapa 2.
- **Contexto:** Citar versiones antes de instalar produciría datos inventados.
- **Consecuencias:** [`tecnologias.md`](tecnologias.md) dice "se fija en la Etapa 2" en cada versión y lista lo que sigue abierto.

### D13. Observer con eventos del pedido

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** `OrderSubject` notifica eventos, no solo estados: "estado cambiado" y "base devuelta". Los estados del pedido siguen siendo los de las reglas, sección 12. La eligió el usuario entre tres opciones.
- **Contexto:** El contexto académico pide que el Observer libere el reembolso de la base cuando se devuelve.
- **Consecuencias:** `warranty_service` emite "base devuelta" cuando el personal la registra, y `GarantiaBaseObserver` reacciona. Alternativas descartadas: un observer solo al entregar, con la devolución dentro de `warranty_service` (no cumple lo que pide el contexto académico), y un segundo sujeto para la base (más piezas para el mismo resultado).

### D14. Inventario de vitrina

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** `InventarioObserver` descuenta las existencias de vitrina cuando el pedido entra en `apartado` o `recibido` (lo que ocurra primero) y las reintegra al entrar en `cancelado`. Los pedidos personalizados no descuentan vitrina.
- **Contexto:** Un pedido apartado en efectivo no está pagado, y sin descuento podría venderse dos veces la misma pieza.
- **Consecuencias:** La cancelación de apartados vencidos reintegra las existencias.

### D15. Sesión

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** El access token JWT es corto (de 5 a 15 minutos) y vive solo en memoria del frontend. El refresh va en una cookie HttpOnly, Secure y SameSite=Lax, con rotación y lista negra, y exige CSRF. CORS usa orígenes explícitos tomados del entorno.
- **Contexto:** Guardar tokens en `localStorage` los expone a scripts de terceros.
- **Consecuencias:** El frontend renueva el access token con el refresh; ver [`arquitectura.md`](arquitectura.md#seguridad). Para que la cookie `SameSite=Lax` funcione, el frontend y la API comparten sitio: un mismo dominio propio (con `www.` y `api.`) o la API bajo `/api` en el mismo origen. Esa restricción condiciona la elección de la PaaS.

### D16. Los agentes no hacen operaciones de git

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** Los agentes no hacen commits ni push, no crean el repositorio y no se agregan como coautores. Preparan los cambios y el equipo ejecuta los comandos de git. Lo pidió el usuario.
- **Contexto:** El historial del repositorio es del equipo.
- **Consecuencias:** Se aplica junto con D11.

### D17. Strategy sin descuentos

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** No hay estrategia de descuentos.
- **Contexto:** El contexto académico mencionaba descuentos promocionales, pero la pastelería no ha definido ninguno y no se inventan.
- **Consecuencias:** El diseño de `pricing_service` admite agregar una estrategia si la pastelería los define.

### D18. Estructura mínima de `core_pasteleria`

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** Se agregan a mano `apps.py`, `admin.py`, `migrations/` y el paquete del proyecto Django. No se usa `startapp`, porque falla con los archivos existentes.
- **Contexto:** El esqueleto ya tiene archivos en `core_pasteleria`.
- **Consecuencias:** `admin.py` es la excepción a la regla de que solo `repositories/` toca el ORM.

### D19. Enlaces a los artefactos de claude.ai en la bitácora

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** Los enlaces a los tres artefactos privados de claude.ai se conservan en la bitácora.
- **Contexto:** El usuario confirmó que los artefactos no están compartidos.
- **Consecuencias:** Quien abra el repositorio público ve los enlaces, pero no puede abrir los artefactos.

### D20. Cobro en efectivo registrado por el personal

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** Un pedido en efectivo pasa de `apartado` a `recibido` cuando el personal con el permiso `core_pasteleria.registrar_pago_efectivo` registra el cobro en la pastelería. Los pagos en línea solo cambian de estado por webhook verificado.
- **Contexto:** El cliente no debe poder marcar su propio pago como recibido.
- **Consecuencias:** Un cliente que intenta registrar su pago en efectivo recibe 403 ([`pruebas.md`](pruebas.md)).

### D21. La carpeta de tokens se llama `design/`

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** `diseno/` pasa a `design/`. La subcarpeta `referencia/` conserva su nombre.
- **Contexto:** Lo pidió el equipo.
- **Consecuencias:** Las rutas en `AGENTS.md`, `README.md`, `frontend/AGENTS.md`, [`tecnologias.md`](tecnologias.md), esta misma página y el encabezado del preset ya apuntan a `design/`.

### D22. El 3D es un complemento

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** El pastel 3D (la vista previa de "Diseña tu pastel" y el gesto de marca de la sección "Presencia de marca" del libro de marca) es un complemento. No se agrega en otras vistas y la documentación no lo presenta como el centro del sitio. El objetivo específico 3 se reformula como diseño de pedidos a medida con precio exacto, con la vista previa como complemento.
- **Contexto:** El equipo no quiere abusar del recurso.
- **Consecuencias:** La descripción inicial, el objetivo 3 y "Qué ofrece el sitio" del README, [`objetivos.md`](objetivos.md), `AGENTS.md` y el libro de marca ya no lo anuncian. Su ubicación en el mockup y en [`../libro-de-marca.md`](../libro-de-marca.md) (sección "Presencia de marca") no cambia. El alcance técnico del objetivo 3 no se reduce: la vista previa sigue en WebGL con `react-three-fiber`. [`plan-de-trabajo.md`](plan-de-trabajo.md) conserva el nombre original del entregable. El nombre técnico "cotizador 3D" sigue permitido en código y documentación técnica (D6).

## Decisiones abiertas

| Tema | Detalle | Se resuelve |
| --- | --- | --- |
| Tailwind v3 o v4 | El preset `design/tailwind.preset.js` está en formato v3 | Etapa 2 |
| Versiones de Python y Django | Sin fijar | Etapa 2 |
| Herramienta de compilación del frontend | Sin elegir | Etapa 2 |
| PaaS de despliegue | Sin elegir. Debe permitir que el frontend y la API compartan sitio (D15) | Antes de la Etapa 5 |
| API de distancias | Para la tarifa de envío; las reglas sugieren una API de rutas como Google Distance Matrix | Antes de la Etapa 4 |
| Nombre del modelo `Cotizaciones3D` | Choca con la "cotización" del envío de referencia (D6) | Etapa 2 |
| Nombres finales de modelos y campos | Los de [`arquitectura.md`](arquitectura.md#entidades-previstas) son previstos | Etapa 2 |
| Salida de `en_pausa_por_cotizacion` | Las reglas no dicen a qué estado pasa el pedido | Etapa 2 |
| Datos de la pastelería | Precio de decoraciones fijas, repartidor propio o aplicación, vigencia de una cotización, políticas de cambios y cancelaciones, base dañada, dirección, WhatsApp, aviso de privacidad y términos ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 14) | Cuando responda la pastelería |
| Mensaje del registro con un correo ya usado | El mockup `RegistroError` dice "Ya hay una cuenta con este correo.", lo que revela qué correos son clientes. Opciones: mensaje genérico, o conservarlo con throttling | Etapa 3 |
| Cancelación de apartados vencidos | Comando `cancelar_apartados_vencidos`; su programación depende del PaaS | Con el PaaS |
| Pedido personalizado y pan del inventario | Si un pedido personalizado consume la disponibilidad de pan | Etapa 2 |
| Envío gratis con 15 kg o más a más de 15 km | Pregunta para la pastelería ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 8) | Cuando responda la pastelería |
| Tamaño máximo de las subidas | Configurable en el admin | Etapa 2 |

## Ver también

- [Plan de trabajo](plan-de-trabajo.md)
- [Arquitectura](arquitectura.md)
- [Tecnologías](tecnologias.md)
- [Bitácora del proyecto](../bitacora.md)
