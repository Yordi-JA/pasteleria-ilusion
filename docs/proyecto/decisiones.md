# Registro de decisiones

Este registro guarda las decisiones del proyecto con su fecha, su contexto y lo que cambian. Las decisiones D1 a D23 se tomaron entre el 12 de octubre y el 1 de noviembre de 2026; D24 a D28, al inicializar los proyectos el 2 de noviembre; D29 a D35, el mismo 2 de noviembre: identificadores en inglés, catálogo, despliegue, límite de intentos y diagramas; D36 y D37, el 3 de noviembre: componentes base, página de muestra y FastAPI descartado; D38 a D40, el 4 de noviembre: primer despliegue en Heroku, precio de "Diseña tu pastel" y dominio propio; D41 y D42, el 5 de noviembre: datos del negocio y su endpoint; marco del sitio y rutas.

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
- **Reemplazada por D29.**

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
- **Reemplazada por D24 y D25.**

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

### D23. Calendario de cierre para la exposición

- **Fecha:** 1 de noviembre de 2026.
- **Decisión:** El plan real se ajusta para tener los entregables listos el lunes 23 de noviembre: Etapa 3 del 8 al 13, Etapa 4 del 14 al 19 (con congelamiento del código el jueves 19) y Etapa 5 de cierre del 20 al 23 (verificación, reporte, presentación y ensayo). Pruebas y accesibilidad se hacen dentro de las etapas 2 a 4 y el despliegue empieza en la Etapa 2. El código se entrega como un zip generado con `git archive` desde una etiqueta del commit final, para que solo entren archivos versionados y nunca `.env`, `secrets/`, `backend/media/`, `node_modules` ni el entorno virtual. Lo genera el equipo (D16).
- **Contexto:** Las exposiciones son el martes 24 y el jueves 26 de noviembre, y el equipo no sabe qué día le toca. La entrega es el jueves 26 e incluye el reporte, el código y la presentación. El plan anterior cerraba el 28 de noviembre.
- **Consecuencias:** Las etapas 3 y 4 pierden un día cada una. El mínimo para la exposición se define al iniciar la Etapa 3. La fecha real de cierre de cada etapa se anota en la ejecución real de [`plan-de-trabajo.md`](plan-de-trabajo.md#ejecución-real). El baseline del anteproyecto no cambia. La sección "Cómo correrlo" del README tiene que estar completa para el 19, porque quien reciba el zip no tiene GitHub. Como el zip sale sin `.env`, esa sección explica cómo crearlo a partir de `.env.example` y qué llaves sandbox se necesitan, y la demo de referencia es el sitio desplegado.

### D24. Versiones y herramientas del backend

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** Django 5.2 LTS (5.2.18) con Python 3.11, Django REST Framework 3.18.3, SimpleJWT 5.5.1, drf-spectacular 0.30.0, django-cors-headers 4.9.0 y PostgreSQL 18. El entorno se lee con django-environ y la base de datos solo con `DATABASE_URL`. El paquete del proyecto es `backend/config/`. Las dependencias van en un solo `backend/requirements.txt` con versiones exactas. En desarrollo, PostgreSQL corre en Docker (`backend/compose.yaml`, ligado a 127.0.0.1, puerto 5433 por defecto) y Django en un venv local.
- **Contexto:** Reemplaza a D12 en lo que toca al backend. Según sus notas de versión (consultadas el 2 de noviembre de 2026; ver [`referencias.md`](referencias.md)), Django 6.1 soporta Python 3.12 a 3.14, y la máquina de desarrollo tiene 3.11. La 5.2 es LTS, con soporte hasta abril de 2028, y las dependencias del proyecto la soportan desde hace tiempo. Según el changelog de Heroku, las bases nuevas usan PostgreSQL 18 por defecto desde agosto de 2026. django-environ lee `.env`, entiende el `DATABASE_URL` de Heroku y no pisa las variables que ya existen en el entorno. Se descartó `os.environ` con dj-database-url porque obligaba a parsear listas y booleanos a mano. El puerto 5432 local ya lo ocupaba otro proyecto.
- **Consecuencias:** Los comandos están en [`../../backend/AGENTS.md`](../../backend/AGENTS.md#comandos). Las pruebas corren contra PostgreSQL, no contra SQLite. Separar las dependencias de pruebas en `requirements-dev.txt` queda para el despliegue.

### D25. Versiones y herramientas del frontend

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** Vite 8 con React 19 y TypeScript 7, Node 22 LTS y npm con versiones exactas. El linter es oxlint, que es el que trae la plantilla de Vite. Tailwind CSS v3 (3.4) usa el preset `design/tailwind.preset.js` tal cual. El enrutamiento es React Router 8 en modo declarativo (`BrowserRouter`). Las fuentes se declaran con `@font-face` apuntando a `assets/fuentes/`, sin copiarlas. Las pruebas E2E usan Playwright con Chromium. El servidor de desarrollo escucha en 127.0.0.1, solo sirve `frontend/` y `assets/fuentes/`, y reenvía `/api` a Django en `127.0.0.1:8000`.
- **Contexto:** Reemplaza a D12 en lo que toca al frontend. Según su guía de migración, Vite 7 en adelante pide Node 20.19 o más (ver [`referencias.md`](referencias.md)). Con v3, el preset ya existente funciona sin traducción; v4 pedía pasar los tokens a `@theme`. Al inicializar el 2 de noviembre, la plantilla de `create-vite` para React y TypeScript traía TypeScript 7.0.2 y oxlint, y typescript-eslint 8.72.1 declaraba el rango `typescript >=4.8.4 <6.1.0`. Usar ESLint obligaba a bajar TypeScript, y el equipo prefirió la plantilla. En la máquina de desarrollo, el loopback IPv6 no responde.
- **Consecuencias:** Los comandos están en [`../../frontend/AGENTS.md`](../../frontend/AGENTS.md#comandos). react-three-fiber, Phosphor Icons y el cliente HTTP se instalan cuando se usen. Una herramienta que dependa de la API de TypeScript podría no funcionar todavía con la versión 7.

### D26. Despliegue en Heroku como un solo servicio

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** El sitio se despliega en Heroku con los créditos del GitHub Student Developer Pack. Un solo servicio: Django sirve el build de React y la API bajo `/api`, en el mismo origen. La base es Heroku Postgres y las tareas periódicas usan Heroku Scheduler.
- **Contexto:** D15 exige que el frontend y la API compartan sitio. Con un solo origen eso se cumple sin dominio propio. El equipo ya tiene el Pack.
- **Consecuencias:** El despliegue agrega el Procfile, servir el build, `SECURE_PROXY_SSL_HEADER`, `NUM_PROXIES` y una caché compartida para el throttling. En producción, la lista de orígenes CORS va vacía. `cancelar_apartados_vencidos` se programa con Heroku Scheduler. Los precios del plan se confirman al activarlo.

### D27. Modelo de usuario propio con correo

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** `core_pasteleria.Usuario` es el modelo de usuario (`AUTH_USER_MODEL`) desde la primera migración. El correo es único y sirve para entrar; no hay username. El correo se guarda en minúsculas y la base de datos rechaza duplicados que solo difieren en mayúsculas. Las cuentas creadas con Google pueden no tener contraseña usable. En el admin, solo un superusuario puede: ver y editar al personal, dar permisos de personal o de superusuario, administrar grupos, crear cuentas, cambiar el correo de un cliente y fijarle una contraseña. El resto del personal con permiso sobre usuarios solo puede ver y editar los demás datos de los clientes, como activar o desactivar una cuenta.
- **Contexto:** El acceso es con Google o con correo y contraseña. Cambiar el modelo de usuario después de la primera migración obliga a rehacer migraciones. La auditoría de seguridad encontró dos vías de escalada: un empleado con permiso de editar usuarios podía hacerse superusuario, y uno con permiso de editar grupos podía darse todos los permisos. Con permiso de editar usuarios, además, podía cambiar el correo o la contraseña de un cliente y entrar a su cuenta. El equipo decidió que eso solo lo haga un superusuario. El cliente que olvida su contraseña usa la recuperación.
- **Consecuencias:** El modelo solo trae los campos de acceso y permisos. Nombre, teléfono y demás se deciden con los modelos de dominio. Del esquema del catálogo (D32): el grupo "Precios" puede editar `store_closes_at`, que es también la hora límite del pago en efectivo, y el permiso `change_productoffering` es solo de "Precios", porque cambiar a qué precio apunta una presentación cambia lo que paga el cliente.

### D28. Seguridad de la sesión y de las credenciales

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** El access dura 10 minutos y el refresh 7 días, con rotación, lista negra y `CHECK_REVOKE_TOKEN`, para que un cambio de contraseña invalide los tokens anteriores. Las contraseñas se guardan con Argon2, con PBKDF2 de respaldo. Swagger UI en `/api/v1/docs/` es solo para el personal y se sirve desde el propio sitio con drf-spectacular-sidecar. HSTS dura un año; `includeSubDomains` y `preload` están apagados por defecto y se encienden por variable de entorno. Con `DEBUG=False`, la app no arranca si algún origen permitido no es `https://`. El throttling identifica al cliente con `NUM_PROXIES` leído del entorno (0 en desarrollo, 1 en Heroku), así que un `X-Forwarded-For` falsificado no da un contador nuevo.
- **Contexto:** Completa D15, que no fijaba la duración del refresh. Lo pidió la auditoría de seguridad de la inicialización: sin sidecar, Swagger cargaba JavaScript de un CDN sin versión fija en una página con sesión de personal. La auditoría propuso separar `CSRF_TRUSTED_ORIGINS` de la lista de CORS, pero backend/AGENTS.md exige la misma lista, así que se conserva y se rechazan los orígenes `http://` en producción.
- **Consecuencias:** La huella de `CHECK_REVOKE_TOKEN` sale del hash de la contraseña. Cuando Django migra un hash PBKDF2 a Argon2 en el primer inicio de sesión, los tokens anteriores se invalidan una vez; hoy no hay usuarios previos, así que solo importa al importar cuentas o cambiar de algoritmo. SimpleJWT renueva un refresh anterior al cambio de contraseña, aunque el access que entrega recibe 401. La vista de refresh con cookie de la Etapa 3 decide si lo rechaza de forma explícita (ver [decisiones abiertas](#decisiones-abiertas)). Quedan pendientes una CSP, una llave de firma de JWT separada de `SECRET_KEY`, una sesión más corta en el admin y programar `flushexpiredtokens`.

### D29. Identificadores del dominio en inglés

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** Clases, modelos, campos, funciones, constantes, códigos de estado, permisos, comandos de gestión, rutas de la API y nombres de pruebas van en inglés (PEP 8 y convenciones de Django; en el frontend, convenciones de React y TypeScript). Siguen en español los comentarios y docstrings, toda la documentación, el reporte y todo texto visible para personas (interfaz, admin, mensajes y `verbose_name`). Las rutas del sitio siguen en español y las de la API pasan a inglés. El vocabulario de la interfaz de D6 no cambia. Los nombres de las entidades están en [Entidades previstas](arquitectura.md#entidades-previstas).

    Nombres fijados (el código los usa tal cual):

    | Concepto | Nombre |
    | --- | --- |
    | Observers | `CustomerNotificationObserver`, `InventoryObserver`, `StandLoanObserver`; interfaz `OrderObserver` con `update(event)` |
    | Sujeto de eventos | `OrderSubject` con `subscribe(observer)` y `notify(event)` |
    | Pagos | `BasePayment.charge(amount, payload)`, `CashPayment`, `PaymentResult`, `create_charge(amount, payload)` en los adaptadores, `create_payment_processor(payment_type)` |
    | Registro de pasarelas | `PAYMENT_GATEWAY_REGISTRY`, con las claves `mercadopago`, `stripe` y `cash` |
    | Repositorio de prueba | `MemoryRepo` |
    | Servicio de garantías | `warranty_service.register_stand_return(token, actor)` |
    | Decorador | `@audit_operation` |
    | Ruta de diseños | `/api/v1/cake-designs/` |
    | Campos de serializador de cliente | `status`, `refunded`, `customer_id` |
    | Permisos | `core_pasteleria.register_cash_payment` (antes `registrar_pago_efectivo`), `core_pasteleria.register_stand_return` (antes `registrar_devolucion_base`) |
    | Comando de gestión | `cancel_unpaid_cash_orders` (antes `cancelar_apartados_vencidos`; D18 y D26 lo citan con el nombre anterior) |

    Excepciones explícitas: los códigos de tipo de pastel se quedan en español (`tres_leches`, `seco`, `envinado`) porque son nombres propios de la pastelería. La app de Django conserva su nombre, `core_pasteleria`. Los tokens de diseño de `design/` (`nata`, `mermelada`, `titulo-1` y demás) conservan sus nombres porque son el vocabulario de la marca. Ninguna excepción se extiende a otros valores: sabores, panes y productos se modelan como datos editables en la base (filas), no como identificadores de código.
- **Contexto:** El equipo lo pidió para no forzar nombres sin ñ, como "Diseno". Se aplica antes del primer commit del código, así que solo cambian `Usuario` y los nombres de las pruebas. Resuelve el nombre del modelo `Cotizaciones3D`, que pasa a `CakeDesign`, y deja "cotización" solo para el envío de referencia (`Quote`).
- **Consecuencias:** Reemplaza a D7. El modelo `core_pasteleria.Usuario` pasa a `core_pasteleria.User`. Los códigos de estado están en la [sección 12 de las reglas](../reglas-de-negocio.md#12-estados-del-pedido); los permisos y el comando, en la tabla de arriba y en [`../../backend/AGENTS.md`](../../backend/AGENTS.md). Las decisiones anteriores (D1 a D28) conservan los nombres que tenían al tomarse.

### D30. Los pedidos de "Diseña tu pastel" no descuentan el inventario de pan

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** El inventario de pan (`Inventory`) solo controla los encargos de vitrina del mismo día. Un pedido de "Diseña tu pastel" con 2 días de anticipación se hornea aparte y no descuenta ese inventario.
- **Contexto:** El equipo resolvió la pregunta abierta "Pedido personalizado y pan del inventario".
- **Consecuencias:** Coincide con D14: los pedidos personalizados no descuentan vitrina. Las reglas de inventario están en las secciones 1 y 2 de [`../reglas-de-negocio.md`](../reglas-de-negocio.md).

### D31. Tamaño máximo de las subidas: 5 MB por imagen al inicio

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** El tamaño máximo de cada imagen subida es de 5 MB al inicio. El admin lo edita. El admin no puede superar el tope duro de 10 MB que aplica el código ([`../../backend/AGENTS.md`](../../backend/AGENTS.md#subidas)).
- **Contexto:** El equipo resolvió la pregunta abierta "Tamaño máximo de las subidas".
- **Consecuencias:** El valor vive en la base de datos, no en el código. Cambiarlo no requiere un despliegue, pero nunca pasa de 10 MB.

### D32. Esquema del catálogo, el inventario y la configuración editable

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** Se aprueba el esquema propuesto para `core_pasteleria`, con las recomendaciones del diseño en las preguntas que son del equipo:
    - Cuatro configuraciones de una sola fila, separadas por tema: `StoreSettings`, `CakeDesignSettings`, `PolicySettings` y `UploadSettings`.
    - Tablas editables para las opciones de "Diseña tu pastel": `Bread`, `FillingBase`, `FillingFlavor`, `FillingPrice`, `TierRecommendation`, `CoverageColor` y `DecorationOption`.
    - Tablas editables para bases y envío: `CakeStand` y `DeliveryFeeBand`.
    - Catálogo en tres tablas: `Product` (un producto por sabor), `CatalogPrice` (precio por grupo) y `ProductOffering` (presentación a la venta).
    - `Inventory` por día, para la vitrina y para el pan de los encargos del mismo día, con descuento atómico.
    - Las restricciones de combinación son datos (tipos de pastel permitidos, si un sabor se combina, máximo de sabores por base) que el backend valida.
    - Los datos reales de las reglas se siembran con migraciones de datos que no pisan lo que ya editó la pastelería. El inventario no se siembra.
    - Lo pendiente queda vacío y el admin lo muestra como "PENDIENTE".
    - Recomendaciones adoptadas:
        - Lo que no se cargó para hoy no aparece en vitrina.
        - Las fotos de producto son archivos estáticos del frontend, referidos por nombre.
        - Las decoraciones sin precio se muestran desactivadas con "Precio por confirmar".
        - Fresa con yogurt aparece desactivada en envinado con su motivo, no oculta.
        - El último lapso de entrega empieza a las 22:00.
        - El color de cada opción en la vista previa se guarda en la base.
        - Se crean los grupos de permisos "Mostrador" (inventario) y "Precios" (precios y configuración), que crea un superusuario (D27).
- **Contexto:** El diseño se hizo antes de escribir código para no suponer nombres ni tablas. Resuelve "Nombres finales de modelos y campos" en lo que toca al catálogo. La regla 4.7 decía a la vez que Fresa con yogurt "no aparece" en envinado y que las opciones "nunca desaparecen". Se corrige a favor de la segunda.
- **Consecuencias:** El esquema se implementa el martes 3 de noviembre en este orden: configuración, opciones, bases y envío, catálogo, inventario y repositorios (`product_repo`, `cake_option_repo` y `settings_repo`). Lo que depende de la pastelería (unidad del pan, pan de cada pastel de vitrina, sabores y minis en vitrina, Mosaico, vitrina frente a rebanadas, peso para el envío gratis, base de 26 a 50 kg) queda configurable y marcado como PENDIENTE. El detalle de modelos, campos, restricciones, datos iniciales y pruebas está en [`esquema-catalogo.md`](esquema-catalogo.md). La tabla de entidades de [`arquitectura.md`](arquitectura.md#entidades-previstas) se actualiza con la implementación.

### D33. Despliegue en Heroku: build, archivos y estáticos

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:**
    - La raíz del repositorio lleva los archivos que leen los buildpacks: `Procfile`, `package.json`, `requirements.txt` (que remite a `backend/requirements.txt`), `.python-version` y `.slugignore` (excluye `mockup/` y `docs/`).
    - Se usan los buildpacks `heroku/nodejs` primero y `heroku/python` después. Node construye `frontend/` sin scripts de instalación y luego borra `frontend/node_modules`. Python instala solo las dependencias de producción y corre `collectstatic` automáticamente.
    - WhiteNoise sirve los estáticos y el build con `X-Frame-Options: DENY`. Django devuelve el `index.html` para las rutas del sitio y un 404 en JSON bajo `/api`.
    - La caché del throttling es `DatabaseCache` sobre la misma PostgreSQL.
    - `NUM_PROXIES` es obligatorio con `DEBUG=False`, y `SECURE_PROXY_SSL_HEADER` solo se activa cuando `NUM_PROXIES` es 1 o más.
    - Las dependencias de pruebas van en `backend/requirements-dev.txt`.
- **Contexto:** Implementa D26. Un gancho propio (`bin/post_compile`) se descartó porque el buildpack nuevo de Heroku no soporta esos ganchos y el automático ya encuentra `backend/manage.py` (hasta tres niveles de profundidad). `.slugignore` se aplica antes del build, así que `design/` y `assets/`, que el build lee, no pueden ir ahí. Revisión y auditoría en tres rondas.
- **Consecuencias:** Las variables de producción y los comandos `heroku` están en [`../../backend/AGENTS.md`](../../backend/AGENTS.md). Las variables tienen que existir antes del primer push, porque `collectstatic` corre en el build. La compresión de los assets del build queda para la Etapa 3 (ver decisiones abiertas).

### D34. Límite de intentos en el inicio de sesión con django-axes

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:** django-axes se adelanta al primer despliegue:
    - 5 intentos fallidos y 1 hora de bloqueo, configurables con `AXES_FAILURE_LIMIT` y `AXES_COOLOFF_MINUTES`.
    - Se bloquea la combinación de IP y correo, y también la IP sola. No hay bloqueo por correo desde cualquier IP.
    - Un fallo durante el bloqueo no lo alarga.
    - Un acceso correcto no borra los fallos previos; vencen solos con el enfriamiento (`AXES_RESET_ON_SUCCESS = False`). Con el bloqueo por IP, el reinicio borraba todos los fallos de esa IP y alguien con cuenta de personal podía adivinar la contraseña de la dueña sin bloquearse (lo encontró la auditoría final).
    - La IP se obtiene con el mismo `NUM_PROXIES` que el throttling.
    - El correo se normaliza.
    - El bloqueo responde 429 con `Retry-After`.
    - `AXES_FAILURE_LIMIT`, `AXES_COOLOFF_MINUTES` y `NUM_PROXIES` deben ser enteros; si no, la app no arranca (`ImproperlyConfigured`).
- **Contexto:** La auditoría del despliegue encontró que el login del admin quedaba público y sin límite. Argon2 hace caro cada intento, así que unos pocos intentos simultáneos podían saturar el dyno. El equipo descartó el bloqueo por correo desde cualquier IP porque permitía a un tercero bloquear a propósito la cuenta de la dueña. Agregó el bloqueo por IP para frenar el rociado de contraseñas y acotar los registros a 5 por IP y hora.
- **Consecuencias:** Si alguien del personal falla 5 veces desde el wifi de la pastelería, esa red espera una hora o un superusuario la desbloquea; los comandos de desbloqueo están en [`../../backend/AGENTS.md`](../../backend/AGENTS.md). axes aplica a toda llamada a `authenticate()`, así que el login JWT de la Etapa 3 hereda la política y debe responder 429. Un segundo factor para el personal queda como mejora posible.

### D35. Diagramas de arquitectura en Excalidraw con la paleta de la marca

- **Fecha:** 2 de noviembre de 2026.
- **Decisión:**
    - Los seis diagramas de [`arquitectura.md`](arquitectura.md) (contexto, capas de una petición, fábrica de pagos, Observer, estados del pedido y estados de la base) dejan de ser bloques Mermaid. Pasan a ser dibujos a mano alzada hechos en Excalidraw. En [`diagramas/`](diagramas/) se versionan la fuente `.excalidraw` y el `.svg` que muestra el documento, sin el PNG. Cada imagen lleva un texto alternativo que describe el diagrama completo.
    - Usan los tokens de la paleta Fresa y mermelada:
        - Fondo `nata`, trazo y texto en `mermelada` y notas en `mermelada-suave`.
        - Un solo nodo en `fresa` por diagrama, el que articula a los demás.
        - Servicios externos en `fresa-claro` y regiones en `harina` con borde punteado.
        - Lo que está por definir lleva borde punteado en `cajeta`.
        - Todas las combinaciones de texto pasan WCAG AA: 5.7:1 o más.
    - Las etiquetas van en Excalifont y los identificadores de código en Cascadia, las dos incrustadas en el SVG. Virgil, la fuente clásica de Excalidraw, dibuja mal la ñ y el ¿.
    - El Gantt de [`plan-de-trabajo.md`](plan-de-trabajo.md) sigue en Mermaid con la paleta aplicada por `themeVariables`, porque cambia con cada ajuste del plan.
- **Contexto:** El equipo pidió diagramas con la identidad de la pastelería y una revisión con antislop. Se consideró mantener Mermaid con la paleta, que se ve en el diff y no requiere exportar, pero el equipo prefirió el trazo a mano. Para evitar dos versiones que se desfasen, se quitó el Mermaid. También se consideró usar Fraunces e Instrument Sans, que Excalidraw no admite: habría que cambiar la fuente del SVG con un script en cada exportación. El equipo prefirió Excalifont, que es parte del estilo dibujado; las fuentes de la marca son del sitio.
- **Consecuencias:** Un cambio de arquitectura obliga a editar el `.excalidraw`, exportar otra vez el SVG con fondo y actualizar su texto alternativo; el diff ya no muestra el cambio en texto. El PNG para el reporte académico se exporta desde la fuente cuando haga falta.

### D36. Componentes base, página `/muestra` solo en desarrollo e íconos Phosphor

- **Fecha:** 3 de noviembre de 2026.
- **Decisión:**
    - Los componentes base (`Button`, `TextField`, `Card`, `ChoiceOption`, `Notice`) viven en `frontend/src/components/` y se muestran en todos sus estados en `/muestra`.
    - `/muestra` solo existe en desarrollo: la ruta y su importación dinámica están detrás de `import.meta.env.DEV`, que Vite reemplaza por `false` y por eso no entran al build. Se verifica buscando textos de la página en `dist/`.
    - Se instala `@phosphor-icons/react` en la versión exacta 2.1.10 (acepta React 16.8 o superior), en peso Regular, para los íconos de los avisos.
    - Se agregan el botón secundario y el aviso de información, y se documentan en [`../libro-de-marca.md`](../libro-de-marca.md), sección "Componentes". El chip elegido de "Diseña tu pastel" pasa a `mermelada` con texto `betun`, como el resto de los chips.
- **Contexto:** Se consideró una página de muestra siempre disponible, pero expone una vista que no es del sitio. También se consideró dibujar los íconos como SVG en línea; el libro de marca nombra Phosphor y la versión de React se verificó antes de instalar.
- **Consecuencias:** Cada componente nuevo se agrega a `/muestra` y a `e2e/muestra.spec.ts`. El botón secundario y el aviso de información ya no necesitan consulta al equipo.

### D37. FastAPI no se usa en el proyecto

- **Fecha:** 3 de noviembre de 2026.
- **Decisión:** El backend se queda solo con Django y Django REST Framework. FastAPI no se agrega ni como API principal ni como servicio aparte.
- **Contexto:** El equipo vio FastAPI en la materia y revisó si alguna parte del proyecto lo aprovecharía. Los endpoints, los webhooks de pago, el cálculo del precio, la nota en PDF y la tarea `cancel_unpaid_cash_orders` usan los modelos, los repositorios y la sesión de Django, así que en ellos FastAPI duplicaría lo que DRF ya hace: validación, OpenAPI y JWT. El único candidato a servicio aparte era la tarifa de envío con la API de distancias, pero separarlo agregaría un despliegue y autenticación entre servicios para pocas líneas. Un segundo servicio también rompería el mismo origen de D26, que necesita la cookie del refresh (D15). El material de la materia marca la sobreingeniería como antipatrón.
- **Consecuencias:** Ninguna en el código. La comparación queda en [`tecnologias.md`](tecnologias.md#framework-por-qué-django-y-react) para el reporte. Si más adelante una parte necesita un servicio asíncrono independiente, sin base ni sesión compartidas, se reconsidera con una decisión nueva.

### D38. Primer despliegue en Heroku: app, plan y dyno

- **Fecha:** 4 de noviembre de 2026.
- **Decisión:** La app se llama `pasteleria-ilusion`, está en la región `us` y usa Heroku Postgres `essential-0` en la versión 18 y un dyno `web` Basic.
- **Contexto:** D26 dejó los precios para confirmarse al activar el Pack. Heroku creó el dyno como Basic y se mantiene así, en lugar de Eco, porque Eco se duerme tras 30 minutos sin visitas y la primera petición tarda segundos en despertarlo, lo que estorbaría en la exposición. Postgres 18 coincide con el de desarrollo. El plan `essential-0` mostró alrededor de $0.007 por hora, con máximo de $5 al mes, 1 GB y 20 conexiones; Heroku lo instaló en la versión 18.4. El precio de los dynos no se verificó.
- **Consecuencias:** Heroku asignó el dominio `pasteleria-ilusion-0994ca356cbc.herokuapp.com`, con sufijo al azar, y ese es el valor de `ALLOWED_HOSTS` mientras no haya dominio propio. El dominio propio se decide antes de la Etapa 3, porque Google y los pagos se registran con la dirección del sitio. Al seguir la guía se corrigió la sección "Despliegue en Heroku" de `backend/AGENTS.md`: las opciones del add-on van después de `--`, `ALLOWED_HOSTS` sale de `heroku info` y `git push heroku main` se corre desde la raíz. La guía fija el tipo de dyno con `heroku ps:type web=basic`. D38 completa D26.

### D39. Precio de "Diseña tu pastel" y endpoints públicos

- **Fecha:** 4 de noviembre de 2026.
- **Decisión:**
    - `GET /api/v1/cake-designs/options/` y `POST /api/v1/cake-designs/price/` (rutas de D29) son públicos: no piden sesión, no guardan nada y solo tienen el throttle de anónimos. La sesión se pide al hacer el pedido, en la Etapa 4. El precio devuelve el desglose y el depósito de la base aparte del total, ignora cualquier monto que mande el cliente y junta en un solo 400 todos los errores de las reglas, con un mensaje por campo (los de formato, como un tipo de dato equivocado, salen antes en su propio 400).
    - Una decoración de precio fijo sin precio (PENDIENTE) no se puede elegir: las opciones la marcan no disponible con "Precio por confirmar" y el precio la rechaza. "Otra decoración" marca que requiere cotización y no suma.
    - El "Desde $X por kg" de cada pan es el precio general del relleno más barato disponible en el tipo elegido más el incremento del pan. Con los precios de hoy coincide con el relleno Normal: con pan de chocolate, $185 en tres leches y en seco y $205 en envinado.
    - Un sabor con precio propio nunca vale menos que el precio general de su base para el mismo tipo de pastel. El admin lo impide en los dos sentidos: al bajar el sabor y al subir la base por encima de él.
    - Las bases (`CakeStand`) no se borran en el admin, solo se desactivan. Al guardar un tamaño de base, el `min_kg` más chico de la tabla (activas o no) no puede quedar por encima del mínimo de pedido; cambiar `min_custom_kg` no lo revisa. `max_online_kg` no puede pasar de la base activa más grande al cambiarse. Las opciones anuncian el máximo efectivo, que es 0 si no hay bases activas.
    - Las opciones que la pastelería desactiva en el admin (`is_active`) no se listan: se retiraron de la oferta. "Nunca desaparecen" (regla 4.7) aplica a las que un conflicto de tipo o un precio PENDIENTE vuelve no elegibles.
    - El `clean()` de un modelo puede consultar otros modelos para validar en el admin (excepción a la capa de repositorios, como `admin.py` en D18): `CakeDesignSettings.clean()` lee `CakeStand`, `CakeStand.clean()` lee `CakeDesignSettings` y `FillingPrice.clean()` lee los otros precios de su base.
    - La API acepta solo JSON de hasta 16 KB: responde 413 si es más grande y 415 si no es JSON. Las subidas futuras (Etapa 4, D31) usarán su propio parser con su tope.
    - `@audit_operation` vive en `services/audit.py` y registra nombre, duración y resultado, nunca argumentos ni datos personales. Las validaciones esperadas van en INFO (`rejected:<Clase>`) y lo inesperado en ERROR. `LOGGING` manda `core_pasteleria` (INFO), `django.request` (ERROR) y `django.security` (WARNING) a la salida estándar, que Heroku recoge.
- **Contexto:** La regla 1 prohíbe inventar datos, así que un precio PENDIENTE nunca se cobra como $0 ni se oculta: la opción se muestra desactivada con su motivo, porque las opciones desactivadas no desaparecen. Las opciones y el precio salen de las mismas estrategias, para que lo que la interfaz desactiva sea lo que el servidor rechaza. La regla de que un sabor no baja del precio general de su base la fijó el equipo el 4 de noviembre: un precio propio de sabor es un sobreprecio, nunca un descuento (la pastelería no ha definido descuentos, D17). El precio no tiene id de pedido; ese dato llega con `BasePayment.charge`.
- **Consecuencias:** El frontend puede armar "Diseña tu pastel" y mostrar el precio sin cuenta. Cuando la pastelería defina el precio de una decoración fija, se captura en el admin y la opción se activa sin cambiar código. Los pedidos con cobro llegan en la Etapa 4. El código está verificado en local y no está desplegado.

### D40. Dominio propio: pasteleriailusion.me

- **Fecha:** 4 de noviembre de 2026.
- **Decisión:** La dirección del sitio es `https://pasteleriailusion.me`, sin `www`. `www.pasteleriailusion.me` redirige con 301 a ella, con el middleware `WwwRedirectMiddleware` (`backend/config/canonical.py`) y la variable `CANONICAL_HOST=pasteleriailusion.me`. El host de `herokuapp.com` sigue sirviendo el sitio como respaldo. Los dos dominios se agregan a Heroku y a `ALLOWED_HOSTS`.
- **Contexto:** Google y los pagos se registran con la dirección del sitio, así que el dominio se resolvió antes de la Etapa 3. El dominio se registró en Namecheap con la oferta del GitHub Student Developer Pack: el primer año es gratis y la renovación se paga. Se descartó `.com` porque el Pack solo regala el `.me`, y `pasteleriailusion.com.mx` ya lo tiene registrado otra persona. Namecheap obligó a elegir GitHub Pages como opción gratuita del registro; sus registros DNS se reemplazaron por los de Heroku y no se publicó nada en GitHub Pages. El registro `.me` tardó unos 28 minutos en publicar el dominio. Mientras tanto, el certificado automático quedó en "Failed" y dejó de reintentar, y se resolvió con `heroku certs:auto:refresh` cuando el DNS ya apuntaba a Heroku. El certificado es de Let's Encrypt, cubre los dos dominios, vence el 2 de febrero de 2027 y Heroku lo renueva solo.
- **Consecuencias:** `ALLOWED_HOSTS` en Heroku lista el host de `herokuapp.com`, `pasteleriailusion.me` y `www.pasteleriailusion.me`. Los pasos están en "Dominio propio" de la sección "Despliegue en Heroku" de `backend/AGENTS.md`. La redirección de `www` se activa al desplegar la rama que trae el middleware. `SECURE_HSTS_INCLUDE_SUBDOMAINS` sigue apagado y se reconsidera al cierre del proyecto, cuando el dominio ya no cambie. La renovación del dominio después del primer año se paga. D40 resuelve la decisión abierta "Dominio propio" que dejó D38.

### D41. Datos del negocio y `GET /api/v1/store/info/`

- **Fecha:** 5 de noviembre de 2026.
- **Decisión:**
    - La dirección y el WhatsApp viven en `StoreSettings` como `address` (`CharField` de 255, `blank=True`) y `whatsapp` (`CharField` de 15, `blank=True`). La migración `0011_store_contact` los agrega vacíos y su `help_text` dice PENDIENTE. En el admin salen en la sección "Datos del negocio (pie del sitio)" de `StoreSettingsAdmin`, que ahora declara `fieldsets`; una prueba revisa que todo campo nuevo del modelo se agregue ahí.
    - El WhatsApp va en formato E.164 sin "+": de 8 a 15 dígitos ASCII y sin 0 inicial (`^[1-9][0-9]{7,14}\Z`). En México es 52 y los 10 dígitos; 521 y los 10 dígitos también se acepta. El valor sirve tal cual en `https://wa.me/<número>`. Se valida en el modelo y con la `CheckConstraint` `storesettings_whatsapp_digits` en la base. Un "+", un espacio o un guion dan error y no se limpian en silencio.
    - La dirección rechaza los caracteres de las categorías Unicode Cc, Cf, Zl y Zp: controles, marcas bidi, ancho cero, separadores de línea y BOM. Acentos, ñ y puntuación pasan. No lleva `CheckConstraint`.
    - `GET /api/v1/store/info/` es público: hereda de `PublicReadOnlyView`, así que no tiene autenticación y no lee sesión ni token. Responde `{"address": str|null, "whatsapp": str|null, "opens_at": "HH:MM", "closes_at": "HH:MM", "custom_lead_days": int}`, con las horas en 24 h y sin segundos. Solo `address` y `whatsapp` pueden ser `null`, y `null` significa PENDIENTE: la interfaz muestra un marcador visible y no un valor supuesto. Una cadena vacía o de solo espacios sale como `null`.
    - Si falta la fila de `StoreSettings`, el endpoint responde 500 como los demás que leen configuración, y el cuerpo no expone el mensaje. No lleva `Cache-Control`: un cambio en el admin se ve en la siguiente petición. Los métodos distintos de `GET` dan 405.
    - Las capas son la vista, `store_info_service.get_store_info` y `settings_repo.get_store_settings()`.
    - El endpoint tiene throttle propio: `ScopedRateThrottle` con el scope `store_info`, a `120/min` en `DEFAULT_THROTTLE_RATES`. `PublicReadOnlyView` sigue usando `AnonRateThrottle` por omisión.
- **Contexto:** La regla 1 pide que la dirección y el WhatsApp sigan configurables con un marcador visible mientras la pastelería no los defina (sección 13 de [`../reglas-de-negocio.md`](../reglas-de-negocio.md)). El pie del sitio y la franja superior necesitan esos datos y el horario, así que un solo endpoint los entrega. El pie se pide en cada carga; con el cupo `anon` (60/min por IP, compartido con la calculadora de precio), cada visita gastaría peticiones de "Diseña tu pastel". La dirección no lleva restricción en SQL porque React la muestra como texto: los caracteres invisibles son un problema de presentación y no de seguridad, y la regla no se duplica en la base. El WhatsApp sí la lleva porque alimenta un enlace. Los ejemplos de OpenAPI usan `520000000000`, un número que no se puede marcar.
- **Alternativas descartadas:**
    - Un modelo aparte para los datos del negocio. Se usó `StoreSettings`, que ya tiene el horario y una sola fila.
    - Normalizar el "+" y los espacios. Se rechaza lo que no cumple el formato, para que el admin muestre el error en lugar de guardar algo distinto de lo que se escribió.
    - Responder 200 con todo `null` si falta la fila. El pie habría dicho "por confirmar" de un horario que sí existe, y era código para un caso que no ocurre.
    - Aceptar solo 52 y 10 dígitos. Se aceptan los números de otros países y el formato 521 de México.
    - `Cache-Control`. Los datos cambian desde el admin y la pastelería debe verlos de inmediato.
- **Consecuencias:** El frontend puede armar el pie y la franja superior sin cuenta. Cuando la pastelería defina la dirección y el WhatsApp, los captura en el admin y el sitio los muestra sin cambiar código. La dirección y el WhatsApp siguen PENDIENTE en [`../reglas-de-negocio.md`](../reglas-de-negocio.md). El código está verificado en local y no está desplegado.

### D42. Marco del sitio, rutas y datos del negocio en el frontend

- **Fecha:** 5 de noviembre de 2026.
- **Decisión:**
    - Todas las rutas comparten un marco (`frontend/src/views/SiteLayout.tsx`): enlace "Saltar al contenido", franja `mermelada` con los días de anticipación y el WhatsApp, toldo de CSS sin imágenes, barra superior fija con `aria-current` en el enlace activo, guirnalda de duya y pie. Las 26 rutas del mapa de vistas existen con una vista vacía que lleva su `h1` y su `document.title` ("Vista · Pastelería Ilusión"). Si el `h1` del mockup es un dato, el `h1` lleva un marcador: "Hola, [nombre por confirmar]" en `/cuenta`, `/cuenta/bases` y `/cuenta/datos`, "Pedido #[número por confirmar]", "Solicitud #[número por confirmar]" y "[Nombre del pastel por confirmar]". La pestaña lleva el nombre de la vista, sin corchetes.
    - Todo dato PENDIENTE usa el formato `[… por confirmar]` (regla 1): "[Dirección por confirmar]", "[Horario por confirmar]" y "Pedidos con [días por confirmar] de anticipación". Sin número de WhatsApp, el pie y el menú muestran "Escribir por WhatsApp [número por confirmar]" como texto, sin enlace.
    - Los legales son una sola página, `/legal`, con las anclas `#privacidad` y `#terminos`. Cualquier `/legal/<algo>` da 404. El texto sigue PENDIENTE y se muestra con un marcador.
    - La barra de navegación es fija al hacer scroll. El menú móvil es un `<dialog>` que aparece por debajo de 768 px; los demás ajustes móviles siguen en 600 px. El menú atrapa el foco, se cierra con Escape y al navegar, bloquea el scroll y devuelve el foco solo cuando el usuario lo cierra.
    - `src/models/apiClient.ts` es el primer cliente HTTP. `getJson(segments)` arma la ruta con `apiPath(...segments)`, que aplica `encodeURIComponent` a cada segmento y rechaza `''`, `.` y `..`. Así un `:slug`, un `:id` o un `:token` de las vistas futuras no puede desviar la petición.
    - `src/models/storeInfo.ts` lee `GET /api/v1/store/info/` (D41), valida la respuesta de forma defensiva y guarda en la caché del módulo la promesa de éxito. Esa caché solo sirve para recursos públicos. Un error no se guarda, y un corte de 10 s (`AbortSignal.timeout`) evita esperas sin fin.
    - `useStoreInfo` hace una sola petición por carga. Si falla, reintenta como máximo cada 60 s al navegar o al volver a la pestaña, y al recuperar la conexión con un mínimo de 5 s. Antes de armar `https://wa.me/<dígitos>` vuelve a validar que el número tenga de 8 a 15 dígitos; el enlace se abre en otra pestaña con `rel="noopener noreferrer"`. Mientras carga se ve un esqueleto provisional (`StoreSkeleton`, `aria-hidden`) con un solo texto "Cargando datos de la pastelería" por región `aria-busy`.
    - `useRouteFocus` sube al inicio y enfoca `<main>` en cada cambio de ruta. Con hash va al ancla, también si se repite la misma. Al usar atrás o adelante no mueve el scroll.
    - El componente `Duya` pinta concha, perlas y guirnalda sin márgenes negativos. Su prop `below` pinta el campo de abajo.
- **Contexto:** La barra fija la pide el libro de marca y el mockup no la muestra; ganó el libro de marca. El mapa de vistas decía `/legal/:documento`, y el libro de marca y el mockup piden una sola página con anclas; ganó el libro de marca, que tiene más autoridad que el mapa. El mockup corta el móvil en 600 px, pero entre 601 y 767 px los enlaces de la barra se partían en dos líneas, y por eso el menú aparece desde 768 px. El formato de los corchetes viene de la convención del mockup, y "por confirmar", del "Precio por confirmar" de D39. La caché de `storeInfo` evita pedir los datos en cada ruta, y es segura porque la respuesta es pública y la misma para todos; no debe usarse con datos de una cuenta. `apiPath` existe desde el primer cliente para que ninguna vista futura arme rutas a mano.
- **Alternativas descartadas:**
    - Un Context provider para los datos del negocio: el layout es el único consumidor, y un provider agregaría un estado compartido que nada necesita (Estado Global, sobreingeniería).
    - Un `setInterval` de reintento: reintentaría aunque nadie mire la pestaña y no respeta el máximo de una petición cada 60 s. Se reintenta solo al navegar, al volver a la pestaña o al recuperar la conexión.
    - El margen negativo del mockup en el pie: el libro de marca prohíbe márgenes negativos en el borde de duya (`frontend/AGENTS.md`). La prop `below` pinta el campo de abajo.
    - `/legal/:documento`: ver el contexto.
    - Quitar la frase de la franja cuando faltan los días: ocultaría un dato PENDIENTE en lugar de mostrar el marcador, y la regla 1 pide el marcador visible.
- **Consecuencias:** Las vistas futuras se agregan dentro del marco y usan `getJson` con segmentos, nunca con rutas armadas con texto. Siguen pendientes las perlas de avance, el componente de esqueleto completo (el de `StoreSkeleton` es provisional), el contador del carrito, el estado de sesión, el contenido real de las vistas, el 3D y los textos legales. La contradicción del libro de marca sobre el símbolo del pie queda en las decisiones abiertas. D42 usa los datos de D41 y sigue las reglas de duya del libro de marca.

### D43. Perlas de avance y esqueleto de carga

- **Fecha:** 6 de noviembre de 2026.
- **Decisión:**
    - `ProgressPearls` recibe `steps` y `current`, y limita `current` al rango de los pasos. Las perlas son decorativas (`aria-hidden`); el lector de pantalla oye "Paso n de m:" y el estado se ve escrito al lado. La perla llena va en `mermelada`. La vacía es un anillo hueco con borde `mermelada-suave`: la diferencia entre llena y vacía es el relleno, no el color.
    - `Skeleton` es un bloque decorativo con un brillo de 1.4 s `ease-in-out` que se mueve con `transform` en un `::after` (el bloque lleva `overflow-hidden`), y que con `prefers-reduced-motion` no se muestra ni se anima. Tiene dos tonos: `harina` sobre `nata` y `fresa-claro` sobre `fresa`. El keyframe vive en `frontend/tailwind.config.cjs`, que extiende el preset de forma local; `design/tailwind.preset.js` no cambia.
    - El brillo se mueve con `transform` en un `::after` y no con `background-position`. Es una segunda diferencia con `design/referencia/esqueleto.css`. Conserva la duración y la curva del libro de marca.
    - Sobre el fondo `mermelada` (franja y pie), el esqueleto es liso en `mermelada-suave`, sin brillo ni pulso. Antes pulsaba con `animate-pulse` (D42). `StoreSkeleton` ahora usa `Skeleton`.
    - `LoadingRegion` es un envoltorio siempre montado. Lleva un `<p role="status" class="sr-only">` hermano del contenedor con `aria-busy`, nunca dentro de él. El párrafo dice qué se carga mientras carga y queda vacío al terminar; no hay texto de "cargado".
    - El marco del sitio (franja, menú, pie) no usa `role="status"`, para no anunciar en cada página. Las pantallas con datos usan `LoadingRegion`.
- **Contexto:** D42 dejó pendientes las perlas y el esqueleto completo. El libro de marca pedía la perla vacía con borde `relieve`, pero `relieve` (#ecd2d2) da 1.39:1 contra `betun` y 1.33:1 contra `nata`, por debajo del 3:1 que pide WCAG 2.1 1.4.11 (contraste de elementos no textuales). `mermelada-suave` (#664243) lo supera con holgura. El libro de marca no define brillo para el campo `mermelada`, y cualquier realce era un color fuera de la paleta o se confundía con el fondo. `design/referencia/esqueleto.css` pone el `role="status"` dentro del elemento `aria-busy` y lo monta con su texto, pero una live region que se monta con el texto ya puesto no se anuncia de forma fiable, y algunos lectores ignoran los cambios dentro de un `aria-busy`. El brillo de `esqueleto.css` anima `background-position`, que repinta cada bloque en cada cuadro; `transform` se compone en la GPU y no repinta, y con varios bloques en pantalla la diferencia se nota.
- **Alternativas descartadas:**
    - Dejar el borde `relieve` y apoyarse en el texto del estado: la perla vacía casi no se veía.
    - Un brillo o un pulso sobre `mermelada`: ver el contexto.
    - Seguir `esqueleto.css` tal cual para el `role="status"`: ver el contexto.
- **Consecuencias:** Cierra los componentes base que D42 dejó pendientes (perlas y esqueleto). Las pantallas con datos usan `LoadingRegion`. Qué estado del pedido va con qué perla se decide al construir "Mis pedidos" (Etapa 4). El libro de marca se actualiza con el borde `mermelada-suave`, el esqueleto liso sobre `mermelada` y la excepción al "sin brillos". Esta decisión se aparta de `design/referencia/esqueleto.css` en la ubicación del `role="status"` y en cómo se mueve el brillo.

### D44. Mínimo para la exposición y orden de la Etapa 3

- **Fecha:** 6 de noviembre de 2026.
- **Decisión:** La tomó el usuario.
    - Obligatorio para el 13 de noviembre: la portada, el catálogo, la ficha, la vitrina y las rebanadas conectadas a la API (objetivo 1); "Diseña tu pastel" con sus 8 pasos, el precio calculado en el backend y la vista previa 3D (objetivo 3); y el inicio de sesión y el registro con correo.
    - Solo si sobra tiempo: el inicio de sesión con Google, la recuperación de contraseña y la verificación del correo.
    - Orden de trabajo: la API del catálogo y un carrito mínimo, la portada, el pastel 3D del hero (el mismo modelo que usará "Diseña tu pastel"), "Diseña tu pastel", el catálogo, la ficha, la vitrina y las rebanadas, y el inicio de sesión.
- **Contexto:** `plan-de-trabajo.md` pide definir el mínimo para la exposición al iniciar la Etapa 3.
- **Consecuencias:** Resuelve la decisión abierta "Mínimo para la exposición". Lo que queda fuera del mínimo no se empieza hasta cerrar lo obligatorio.

### D45. API pública del catálogo y pasteles de la casa

- **Fecha:** 6 de noviembre de 2026.
- **Decisión:**
    - Cinco endpoints públicos de solo lectura bajo `/api/v1/`, todos `GET`: `products/` (catálogo, con `category` = `cake` o `dessert` y `search` de hasta 80 caracteres en el nombre y la descripción corta), `products/<slug>/` (ficha, con sus presentaciones, las existencias de hoy y hasta 3 productos de la misma categoría), `featured-products/` ("Pasteles de la casa"), `showcase/` (vitrina de hoy, con `category`) y `slices/` (rebanadas de hoy). Un parámetro inválido responde 400 por campo; un `category` vacío equivale a "Todo". Un producto que no existe o está inactivo responde 404 con `{"detail": "No encontrado."}`, igual que las rutas inexistentes de la API.
    - Heredan de `PublicReadOnlyView`: sin autenticación ni sesión. Comparten un throttle propio, scope `catalog` a `360/min` por IP. La portada pide tres a la vez (pasteles de la casa, vitrina y rebanadas) por cada petición del pie, así que la tasa es el triple de `store_info` (120/min). No gastan el cupo `anon` de la calculadora de precio ni el del pie.
    - Capas: las vistas validan los parámetros con un serializador y llaman a `services/catalog_service.py`; el servicio llama a `product_repo`, que es lo único que toca el ORM. El servicio decide qué es "hoy" (`timezone.localdate()`, la fecha de la Ciudad de México por `TIME_ZONE`), convierte en `null` la foto, la conservación y el transporte vacíos (PENDIENTE) y calcula "En vitrina hoy": alguna presentación que no es rebanada tiene piezas hoy.
    - Vitrina y rebanadas responden `{"date": "AAAA-MM-DD", "items": [...]}`, con la fecha de la pastelería para "[Fecha de hoy]". Cada partida trae `offering_id`, el producto, la presentación, el precio, la foto, `stock` y `sold_out`. Lo cargado hoy con 0 piezas sale con `sold_out: true`; lo que no se cargó hoy no sale. En la ficha, `stock` es `null` si no se cargó hoy y `0` si se agotó. Red velvet nunca tiene existencias (la guardia de `product_repo`).
    - Dinero como texto con dos decimales (`"350.00"`) y el peso como texto con uno (`"2.7"`), nunca como `float`. Las tarjetas exponen solo lo que la pantalla usa: el id, la presentación y el precio de cada presentación, más el tipo de pastel y la base de relleno para la etiqueta ("Tres leches con queso") y el pan, que da el "Personalizado: $280 por kilo" del Red velvet desde `cake-designs/options`. La ficha agrega el sabor, y con el tipo, el pan y la base prepara "Personalizar este pastel".
    - Sin paginar: el catálogo tiene 22 productos, la pantalla los muestra todos con el número de pasteles y de postres, y la paginación por omisión de DRF (20) lo partiría en dos. Sin `Cache-Control`, como `store/info`: las existencias cambian durante el día.
    - `Product.featured_on_home` ("destacado en la portada"), un `BooleanField` en `False` (migración `0012_product_featured_on_home`), editable desde la lista de productos del admin, con su filtro. La semilla no marca ninguno. El servicio da hasta 4 de los marcados y activos en el orden del admin (`sort_order`, luego el nombre), sin completar con otros si hay menos. Si no hay ninguno marcado, da los primeros 4 pasteles (`cake`) activos del catálogo. El 4 es la constante `HOME_FEATURED_LIMIT` del servicio. El admin avisa (`WARNING`) en la lista de productos si hay más de 4 activos marcados, porque la portada muestra solo los primeros 4.
    - La búsqueda no distingue mayúsculas ni acentos: `unaccent` de PostgreSQL (migración `0013_unaccent_extension`) se aplica a la columna y al término, así "pinguino" y "pingüino" encuentran "Choco-pingüino". El repositorio en memoria hace lo mismo con NFKD sin marcas combinantes. La migración es un `CREATE EXTENSION IF NOT EXISTS "unaccent"`, idempotente y sin tocar tablas, así que puede correr en la fase `release`; si fallara, Heroku no publica la versión nueva y sigue la anterior. `unaccent` es una extensión estándar de `contrib`; falta comprobarla en la base de Heroku (`essential-0`) al desplegar.
    - `is_active` no se edita desde la lista de productos del admin, solo en el formulario de cada uno: una lista cargada antes de desactivar un producto lo volvería a publicar al guardarla, y con `featured_on_home` guardar esa lista se vuelve algo de todos los días. Personal que solo puede ver productos recibe 403 al guardarla.
    - Si el pan, la base o el sabor de un producto está desactivado, su slug sale `null`, para que "Personalizar este pastel" no preelija algo que `cake-designs/options` ya no ofrece. Un producto inactivo no da relacionados.
- **Contexto:** D44 pone el catálogo conectado a la API en el mínimo de la exposición. El mockup de la portada muestra 4 "Pasteles de la casa" (uno grande y tres chicos), y uno es un postre (Imposible), así que el campo admite pasteles y postres. La regla 1 prohíbe inventar cuáles son los de la casa, por eso la semilla no marca ninguno y el respaldo es una regla explícita y documentada en la sección 2 de [`../reglas-de-negocio.md`](../reglas-de-negocio.md). La fecha local importa de noche: a las 21:30 de la Ciudad de México ya es el día siguiente en UTC, y la vitrina mostraría la carga de mañana.
- **Alternativas descartadas:**
    - Los primeros 4 del catálogo sin campo: la pastelería no podría elegirlos sin reordenar todo el catálogo.
    - El límite de 4 en el admin: es el tamaño de la maqueta de la portada, no una regla del negocio, y cambiarlo pide otro diseño.
    - `products/featured/`: chocaría con la ficha de un producto cuyo slug fuera `featured`.
    - Un throttle por endpoint: la portada gasta los tres juntos, y un solo cupo es más fácil de razonar.
    - Paginar el catálogo: ver la decisión. Si el catálogo pasara de unos 100 productos, se revisa.
    - `name__unaccent__icontains` con el término sin tratar: quita los acentos solo de la columna, y una búsqueda escrita con acento ("pingüino") dejaría de encontrar nada.
    - Quitar los acentos del término en Python antes de la consulta: las reglas de Python y de `unaccent` podrían diferir; con `unaccent` en los dos lados, PostgreSQL decide igual para ambos.
- **Aceptado sin cambiar el código (revisión del 6 de noviembre):**
    - Las tarjetas (`products/`, `featured-products/` y `related`) son listas sin `date`. Cerca de la medianoche, `in_showcase_today` puede no coincidir con la vitrina hasta recargar.
    - `description` vacía sale como `""`: no es PENDIENTE (la ficha puede no llevarla). La conservación y el transporte sí lo son y salen `null`.
    - El respaldo de "Pasteles de la casa" carga todos los pasteles y toma 4 en Python; con 14 pasteles el costo no se nota.
    - El "4" del `help_text` de `featured_on_home` es una constante del diseño; una prueba lo ata a `HOME_FEATURED_LIMIT`.
    - Los ids de las presentaciones son consecutivos y las existencias exactas son públicas: "Quedan [n]" es un requisito del negocio.
- **Consecuencias:** El frontend puede construir la portada, el catálogo, la ficha, la vitrina, "Vitrina agotada" y las rebanadas sin cuenta. El carrito agrega por el id de la presentación (`offerings[].id` o `offering_id`). Quedan para el frontend las etiquetas de las presentaciones ("Pastel mini de cajeta") y cruzar el pan del Red velvet con `GET /api/v1/cake-designs/options/` para su precio por kilo. "Encargarlo para hoy, con 2 horas de anticipación" necesita el pan del día y llega con el pedido. Pendiente para la pantalla del catálogo: esperar al menos 300 ms después de la última tecla antes de buscar. Pendiente para el PR del inicio de sesión: un alias de caché propio para los throttles de seguridad, que hoy comparten `django_cache` con los contadores públicos (ver `backend/AGENTS.md`). El código está verificado en local y no está desplegado.

### D46. Carrito mínimo en el navegador

- **Fecha:** 6 de noviembre de 2026.
- **Decisión:**
    - El equipo decidió hacer ahora un carrito mínimo, solo en el navegador, para que los botones "Agregar al pedido" de la portada, la vitrina, las rebanadas y la ficha funcionen desde la Etapa 3. La pantalla del carrito, la revisión de existencias, la entrega y el pago quedan en la Etapa 4.
    - Cada línea lleva `kind: 'offering'` y apunta a una presentación del catálogo (`ProductOffering`) con `offeringId` y `quantity`, más lo que se muestra: nombre, presentación, precio por pieza en texto decimal y el slug del producto para el enlace. `presentation` es el código de la API (`whole`, `large`, `mini`, `slice`, `individual`, `cup`, como en `Presentation` de `models.py`); la interfaz lo muestra con `PRESENTATION_LABELS` (`src/models/presentation.ts`), que copia los nombres de esas `choices`. El precio es solo para mostrar; el backend lo vuelve a calcular al pagar. Los pedidos de "Diseña tu pastel" entrarán después como otra clase de línea, con su propio `kind`, sin cambiar la clave ni vaciar los carritos guardados; hoy no hay nada construido para ellos. Los adaptadores de la API al carrito (`toCartOffering`, `stockItemToCartOffering`) llegan con la portada, junto a los tipos del catálogo.
    - `src/models/cart.ts` guarda el carrito en `localStorage` bajo la clave versionada `ilusion.cart.v1`, con la forma `{ items }`. Cada lectura y escritura va en `try/catch`, y lo leído se valida línea por línea como en `storeInfo.ts`, con los valores recortados: una línea dañada se descarta y una presentación repetida conserva la primera. Con datos dañados el carrito empieza vacío. Si el navegador bloquea o llena el almacenamiento, el carrito sigue en memoria durante la visita. Las operaciones (`addItem`, `removeItem`, `cartCount`) son funciones puras. `addItem` valida la presentación con el mismo validador que la lectura y lanza `TypeError` si no tiene la forma esperada.
    - Límites técnicos contra datos alterados, no de negocio: `MAX_LINES = 100` (no se leen más líneas ni se agrega la 101), `MAX_LINE_QUANTITY = 999` piezas por línea (`RangeError` al pasarlo), `MAX_TEXT_LENGTH = 80` para el nombre y el slug (el `max_length` de `Product.name` y `Product.slug`) y `MAX_PRICE_LENGTH = 11` para el precio (`money()` de la API, 10 dígitos con 2 decimales). La regla 2 (precios y límites en la base de datos) no aplica: ningún cliente llega a ellos, y el límite real de cada presentación son las existencias del día. Lo decidió el equipo.
    - `SiteLayout` guarda el estado con `useCartState` y lo comparte con `CartContext`; las pantallas lo leen con `useCart` (`items`, `count`, `add`, `remove`, `clear`). Al encabezado le pasa solo el contador, por props, como hace con los datos del negocio. `setQuantity` llega con la pantalla del carrito (Etapa 4); hoy nada lo usa. Cada cambio parte de lo guardado (`readCart()`) para no pisar lo que otra pestaña escribió y cuyo evento aún no llega; si la última escritura falló, parte de la memoria. Las pestañas se sincronizan con el evento `storage` (también `localStorage.clear()`), y al suscribirse se vuelve a leer una vez lo guardado.
    - `add(offering, quantity, maxQuantity?)`: cuando la pantalla sabe cuántas quedan hoy ("Quedan n"), el total de esa presentación no pasa de `maxQuantity`. Si el carrito ya tiene más de las que quedan (bajaron las existencias), no agrega ni recorta: el aviso dice "Solo quedan 2" y "Rebanada de tres leches de cajeta: tienes 3 en tu pedido; revisa tu carrito." Sin `maxQuantity` no hay tope de negocio, porque las reglas no fijan un máximo por producto. Una cantidad que no es entera o está fuera de 1 a 999 es un error de quien llama (`RangeError`).
    - El enlace del carrito del encabezado lleva el contador del mockup (tablero Carrito): un círculo `mermelada` de 20 px con el número en `sobre-color`, `aria-hidden`, que desde 100 dice "99+". El nombre accesible lleva el número exacto, como en el mockup: "Carrito, vacío", "Carrito, 1 producto", "Carrito, 4 productos". El contador es la suma de las cantidades, como "Productos (4)" en el resumen del tablero. El menú móvil no enlaza al carrito, así que no lleva contador; el ícono del carrito sigue visible en la barra en móvil.
    - Después de "Agregar al pedido" aparece el aviso "Agregado al pedido" (libro de marca, "Voz y tono") con el producto y cuántos hay: "Tres leches de durazno. Tienes 2 en tu pedido." Si no entró nada porque ya están todos los que quedan, el aviso es de atención: "Ya tienes los 2 que quedan". `AddToCartNotice` es una región `role="status"` siempre montada y vacía hasta el primer clic (D43); el `Notice` de adentro va sin `role` (prop nueva `live={false}`) y se vuelve a montar en cada clic, para que se lea aunque repita el texto. El aviso no se quita con un temporizador; se quita si cambia la cantidad de la presentación de la que habla. Una pantalla lleva un solo `useAddToCart` y un solo `AddToCartNotice`, cerca del encabezado de la cuadrícula, nunca uno por tarjeta.
    - `/muestra` tiene una sección "Carrito" con dos presentaciones de ejemplo (una con tope de 2), la lista de lo agregado con "Quitar" y "Vaciar el carrito".
- **Contexto:** El carrito sí es estado compartido con varios consumidores: el contador del encabezado y cada pantalla con "Agregar al pedido". D42 descartó un Context para los datos del negocio porque el marco era su único consumidor; aquí hay varios, y el Context se acota al marco y al carrito. El mockup solo dibuja el contador en el tablero Carrito ("Carrito, 4 productos") y en los demás tableros el enlace dice solo "Carrito", aunque el libro de marca pide "el carrito con su contador" en la barra; ganó el libro de marca, con la forma del tablero Carrito. El mockup no muestra qué pasa después de agregar. El libro de marca dice que el botón produce el aviso "Agregado al pedido" y nombra un carrito lateral, que es de la Etapa 4. Los botones conservan su nombre en todo el flujo, así que el texto del botón no cambia. Una región viva que se monta con su texto no se anuncia de forma fiable (D43), y un aviso que se quita solo choca con WCAG 2.2.1.
- **Alternativas descartadas:**
    - Que "Agregar al pedido" abra la ficha del producto hasta la Etapa 4: el botón haría otra cosa de la que dice (libro de marca, "Voz y tono") y la vitrina y las rebanadas seguirían sin poder agregar.
    - Un store global (un módulo con el carrito o una biblioteca como Redux o Zustand): sería el antipatrón Estado Global y una dependencia que nada necesita. El Context vive en el marco del sitio y solo guarda el carrito.
    - Un componente `CartProvider` aparte: obligaba a poner JSX en `viewmodels/` o a que el encabezado leyera el Context; el marco ya guarda los demás estados y los pasa por props.
    - Cambiar el texto del botón a "Agregado" o un aviso flotante: el botón conserva su nombre, y el libro de marca solo da sombra flotante al carrito lateral, los menús y los modales.
    - Un tope general por producto: las reglas de negocio no lo fijan y no se inventa (regla 1).
    - Guardar el nombre de la presentación ("Completo") en lugar del código: la API manda y valida el código, y el carrito se validaría contra un texto de la interfaz en lugar del contrato.
    - Recortar el carrito en silencio cuando bajan las existencias: el cliente perdería piezas sin saberlo; el aviso lo dice y la pantalla del carrito lo resuelve.
- **Consecuencias:** D47 agrega a cada línea su tipo (`fulfillment`: encargo o vitrina de hoy) y la clave pasa a ser la presentación con su tipo. Las pantallas de la Etapa 3 usan `useAddToCart` y `AddToCartNotice`, pasan `maxQuantity` cuando conocen las existencias del día y convierten la respuesta de la API con los adaptadores que llegan con la portada. En la Etapa 4 la pantalla del carrito usa `useCart` y agrega `setQuantity`, el backend revisa las existencias y recalcula los precios, y el carrito lateral, si se hace, reemplaza o acompaña al aviso. "Diseña tu pastel" entra como una clase de línea nueva en `cart.ts` con su propio `kind`, en la misma clave `ilusion.cart.v1`; solo un cambio en la forma de las líneas de catálogo pediría `ilusion.cart.v2`. Si la API agrega una presentación, hay que sumarla a `OfferingPresentation` y a `PRESENTATION_LABELS`; mientras tanto, una línea con un código desconocido se descarta. El carrito no guarda datos personales ni tokens (D15). `playwright.config.ts` acepta `E2E_PORT` para correr la suite en otro puerto cuando el 5173 está ocupado.

### D47. Portada conectada

- **Fecha:** 6 de noviembre de 2026.
- **Decisión:**
    - La portada (`/`, `frontend/src/views/Home.tsx`) sigue `Main.dc.html`: hero en `fresa`, conchas, "Pasteles de la casa" en `nata`, perlas, Vitrina en `mermelada`, perlas y "Rebanadas de hoy" en `nata`. La guirnalda y el pie siguen en el marco. Cada sección de datos carga por separado (`GET /api/v1/featured-products/`, `showcase/` y `slices/`) con su propio `useRemoteData`, su reintento y su aviso: si una falla, las demás siguen.
    - Estados de cada sección: mientras carga, el encabezado completo y un esqueleto con la forma de la sección dentro de `LoadingRegion` ("Cargando la vitrina…"). Si falla, un aviso `error` con `role="alert"` ("No se pudo cargar la vitrina", "Vuelve a intentarlo en un momento.") y el botón "Volver a intentar". Al reintentar, el foco pasa al título de la sección. Una respuesta con otra forma también es un error, no una sección vacía. El corte es de 10 s y no hay caché, porque las existencias cambian durante el día.
    - Lo decidió el usuario: si la vitrina o las rebanadas no tienen nada cargado hoy, o no hay pasteles de la casa, la sección no aparece y se lleva sus bordes de duya. Entre dos campos `nata` no va borde. Si faltan las rebanadas, un campo `nata` de 48 px cierra la página después de la vitrina, porque la vitrina y el pie son `mermelada` y el libro de marca prohíbe dos campos oscuros seguidos. Con todo agotado, la vitrina muestra el texto de `VitrinaAgotada.dc.html` dentro de la sección: "Por hoy se vendió todo lo de la vitrina", "Puedes hacer un pedido con [n] días de anticipación, o ver si quedan rebanadas de hoy.", "Realizar pedido" y "Ver rebanadas de hoy". Los días salen de los datos del negocio, con su marcador si están PENDIENTE. Las rebanadas agotadas se muestran una por una con "Agotada por hoy" y el botón "Agotada" desactivado, como en `Rebanadas.dc.html`.
    - Un aviso de "Agregar al pedido" por sección: un `useAddToCart` y un `AddToCartNotice` en cada una, entre el encabezado y la cuadrícula. Nunca uno por tarjeta. `frontend/AGENTS.md` cambia la regla de "uno por pantalla" a "uno por sección con su propia cuadrícula".
    - Hero provisional: `HeroCake` (`src/components/HeroCake.tsx`) ocupa el lugar y la altura de la escena del mockup (600 px, 460 px hasta 960 px y 380 px en móvil). Muestra el dibujo de pisos de la marca con los colores del pastel 3D y su sombra de contacto. Es decorativo (`aria-hidden`) y no dice "Arrastra el pastel para girarlo", porque todavía no se puede arrastrar. El pastel 3D (`feat/pastel-3d`) reemplaza el contenido de esa caja.
    - Los chips Todo, Pasteles y Postres filtran en el navegador. La vitrina se pide completa una vez; cambiar de chip es inmediato, no muestra un esqueleto ni gasta el cupo del catálogo, y la fecha y lo agotado salen de la misma respuesta. Los chips son radios (`ChoiceOption` con `onColor`, nuevo): elegido, fondo `fresa-claro` con borde de 2 px `betun`, como el mockup, y anillo de foco `betun`. Un chip sin nada hoy dice "Hoy no hay postres en la vitrina." (o "pasteles"). La portada muestra hasta 8 partidas, primero las disponibles y al final las agotadas ("Agotada por hoy", sin botón, como las rebanadas y como dice la sección 2 de las reglas de negocio).
    - "[Fecha de hoy]" es la `date` de la respuesta, formateada en español de México con el día de la semana: "Viernes 6 de noviembre, hasta agotar existencias." Es la fecha de la pastelería, calculada sin la zona horaria del navegador. El día de la semana confirma de un vistazo que la lista es de hoy, sobre todo cerca de la medianoche.
    - Nombres de las presentaciones: el pastel completo lleva el nombre del producto y las demás, "[Presentación] de [producto]" (`offeringLabel` en `src/models/presentation.ts`): "Mini de tres leches de durazno", "Rebanada de tres leches de cajeta", "Vaso de gelatina de mosaico". El mockup dice "Pastel mini de cajeta", un nombre que no existe en el catálogo. Ese nombre es el que guarda el carrito (`CartOffering.name`), como ya hacía la muestra de D46, y por eso `MAX_NAME_LENGTH` es 94: los 80 del producto más "Individual de ". En "Pasteles de la casa", "Agregar al pedido" agrega el pastel completo; si el producto no lo tiene, la primera presentación en el orden del admin, y el precio lleva su nombre ("Vaso, $45.50").
    - Precios en pesos como en el mockup (`formatPrice`, `src/models/money.ts`): "$350", "$35.50", "$1,250", sin `.00` y a partir del texto de la API, sin pasar por un número. Las rebanadas dicen "$35 la rebanada" y "Quedan 3" o "Queda 1".
    - Fotos: sin foto, el hueco del mockup ("Foto del pastel", "Foto del postre" según la categoría, "Foto de la rebanada") es una imagen (`role="img"`) con el nombre "Foto del pastel pendiente". Con foto, un `<img>` con el nombre del producto como texto alternativo, servido desde `/fotos/<archivo>` (`frontend/public/fotos/`, que se crea cuando lleguen las fotos).
    - Favicon y robots: `frontend/public/` trae `favicon.svg` (el símbolo sin sus metadatos), `favicon.ico` (16, 32 y 48 px), `apple-touch-icon.png` (180 px sobre `betun`) y `robots.txt`, que permite el sitio y cierra `/admin/` y `/api/`. Vite los copia a la raíz del build y WhiteNoise los sirve antes que `spa_index`, así que responden 200 con su tipo y no con el HTML de la SPA. `index.html` gana `<meta name="description">` con el lema y la frase del hero. Una prueba de `tests/test_spa.py` revisa que el build los traiga.
    - Pendientes del carrito (revisión de D46): `parseCart` devuelve `{ items, unknown }`. Una línea con un `kind` o una presentación desconocidos, pero con forma de código de la API, se conserva sin leer y `writeCart` la vuelve a escribir después de las propias, sin pasar de 100 líneas en total. Así una pestaña vieja no borra lo que escribió una versión más nueva. Si la última escritura falló, `sync` ya no pisa la memoria con lo guardado, que es más viejo. Los topes técnicos (100 líneas, 999 piezas) ya no lanzan `RangeError`: `addItem` devuelve `limit: true` sin agregar nada, y el aviso dice "No se pudo agregar" y "Tu pedido ya tiene el máximo de piezas que se pueden pedir en línea. Para más, escríbenos por WhatsApp." (texto aprobado por el usuario). `RangeError` queda solo para argumentos inválidos.
    - Los datos del negocio llegan a las vistas por el `Outlet` del marco (`useStoreDetails`), sin otra petición.
    - Ronda de correcciones del 6 de noviembre (revisión de código y decisiones del usuario):
        - Rebanadas: la portada muestra como máximo 4, primero las que quedan (una agotada solo entra si no hay 4 disponibles), en escritorio y en móvil, con "Ver todas las rebanadas" hacia `/rebanadas`. La fila que se desliza en móvil es una región enfocable con nombre ("Tarjetas de las rebanadas de hoy") y anillo de foco, para moverla con el teclado.
        - Encargo y vitrina de hoy son líneas distintas del carrito: cada línea lleva `fulfillment`, `order` (desde "Pasteles de la casa", sin tope de existencias) o `showcase` (vitrina y rebanadas, con `maxQuantity` = lo que queda hoy). La línea se identifica por `offeringId` + `fulfillment`, así que la misma presentación puede estar dos veces. `toCartOffering` da `order` y `stockItemToCartOffering`, `showcase`. Una línea guardada sin `fulfillment` es de antes de esta decisión y se descarta: es de una versión más vieja, no de una más nueva, y conservarla sin leer la dejaría invisible, sin forma de quitarla y ocupando uno de los 100 lugares; todavía no hay pago, así que no se pierde nada que pudiera comprarse. Un `fulfillment` con forma de código que esta versión no conoce sí se conserva sin leer. El aviso no dice "por encargo" ni "de la vitrina de hoy": cada sección tiene su aviso junto a donde se tocó el botón, y la diferencia se mostrará en la pantalla del carrito (Etapa 4). La regla quedó en la sección 2 de [`../reglas-de-negocio.md`](../reglas-de-negocio.md).
        - Una lista de la API con entradas de las que ninguna sirve es un error (la sección muestra su aviso, no desaparece), y las entradas descartadas se avisan en la consola con su cuenta.
        - Si una sección falló y el reintento llega vacío, la sección sigue con una frase ("Por ahora no hay pasteles de la casa.", "Hoy no hay nada cargado en la vitrina.", "Hoy no hay rebanadas cargadas."), para que el foco, que pasó a su título, no se pierda. El título lleva el anillo de foco del libro de marca (en `betun` sobre la vitrina) en lugar de `outline-none`.
        - Una foto que no carga cae al hueco "Foto del … pendiente". `photoUrl` vuelve a validar el nombre de archivo. `PRICE_PATTERN` (`src/models/money.ts`) es el único patrón de precio del frontend. Los días de anticipación se aceptan solo como enteros de 0 a 365, y una lista no se lee como los datos del negocio. `useStoreDetails` revisa la forma del contexto del `Outlet`.
- **Contexto:** El mockup dibuja las secciones siempre llenas y no dice qué pasa sin existencias; lo decidió el usuario. El mockup pone las rebanadas sobre `betun` con tarjetas `nata`, pero la guirnalda del marco cuelga de `nata` y el libro de marca pide tarjetas `betun` sobre `nata`, así que la sección quedó en `nata` con tarjetas `Card`. El libro de marca pide `display` una sola vez por página, y el mockup usa 56 px en los tres `h2`. El usuario decidió seguir el libro de marca: las secciones van en `titulo-1` (40 px), y el lema también. El libro de marca pone "Ver la vitrina" como botón secundario junto a "Realizar pedido", y el mockup como enlace de texto. Ganó el libro de marca. El mockup pone el símbolo junto a "Rebanadas de hoy", y el pie ya lo lleva. El usuario decidió que el símbolo del pie es parte del marco y no cuenta para "uno por pantalla", así que la portada queda como el mockup; el libro de marca lo aclara y se cierra la decisión abierta de D42. En Vite, un `<link rel="icon">` que apunta a `../assets/` no se reescribe en desarrollo y el navegador recibe el HTML de la SPA; por eso el favicon es una copia en `public/`.
- **Alternativas descartadas:**
    - Pedir la vitrina con `?category=` en cada chip: tres peticiones, un esqueleto en cada cambio y respuestas que pueden llegar en desorden.
    - Un solo aviso para toda la portada: quedaría lejos de dos de las tres secciones, y quien agrega desde las rebanadas no vería la confirmación.
    - Mostrar las secciones vacías con su texto: lo descartó el usuario, porque deja dos perlas o dos campos oscuros juntos.
    - Guardar en el carrito solo el nombre del producto y armar la etiqueta al mostrarla: la muestra de D46 y el aviso ya usaban el nombre con la presentación, y cada pantalla tendría que repetir la regla.
    - Usar `design/referencia/pastel-css3d.js` para el hero provisional: lo prohibió el usuario. El 3D llega con react-three-fiber.
    - Ordenar la vitrina solo como la manda la API: con 8 lugares, lo agotado podía tapar lo que sí hay.
- **Consecuencias:** La portada y sus estados quedan cubiertos por `e2e/home.spec.ts`, `e2e/catalog-model.spec.ts` y las pruebas nuevas de `e2e/cart.spec.ts`. El catálogo, la ficha, la vitrina y las rebanadas reutilizan `catalog.ts`, `formatPrice`, `formatTodayDate`, `offeringLabel`, `ProductPhoto`, `LoadErrorNotice`, `ButtonLink`, `TextLink` y `useRemoteData`. El pastel 3D entra en `HeroCake` sin mover el diseño. Si todas las rebanadas están agotadas, cada tarjeta dice "Agotada por hoy": el equipo aprobó ese texto el 6 de noviembre y se cierra la decisión abierta. La clave del carrito sigue en `ilusion.cart.v1` al agregar `fulfillment`, porque las líneas viejas se descartan solas y ninguna pantalla de producción agregaba al carrito. Si la API agrega una presentación y la vitrina de hoy solo trae esa, la sección muestra su error hasta que el frontend la conozca; se acepta. Si la API agrega una presentación, el carrito la conserva sin borrarla hasta que esta versión la conozca. `/robots.txt` y `/favicon.ico` dejan de dar 404 en producción después del siguiente despliegue. El libro de marca ("Componentes") agrega el chip sobre `mermelada` y ("Presencia de marca") aclara el símbolo del pie.

## Decisiones abiertas

| Tema | Detalle | Se resuelve |
| --- | --- | --- |
| API de distancias | Para la tarifa de envío; las reglas sugieren una API de rutas como Google Distance Matrix | Antes de la Etapa 4 |
| Nombres finales de modelos y campos | Los de [`arquitectura.md`](arquitectura.md#entidades-previstas) son previstos | Etapa 2 |
| Salida de `awaiting_quote` | Las reglas no dicen a qué estado pasa el pedido cuando la pastelería da el precio de una decoración por imagen ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 14) | Cuando responda la pastelería |
| Datos de la pastelería | Precio de decoraciones fijas, repartidor propio o aplicación, vigencia de una cotización, políticas de cambios y cancelaciones, base dañada, dirección, WhatsApp, aviso de privacidad y términos ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 14) | Cuando responda la pastelería |
| Mensaje del registro con un correo ya usado | El mockup `RegistroError` dice "Ya hay una cuenta con este correo.", lo que revela qué correos son clientes. Opciones: mensaje genérico, o conservarlo con throttling | Etapa 3 |
| Cancelación de apartados vencidos | Comando `cancel_unpaid_cash_orders`, programado con Heroku Scheduler (D26); falta fijar la frecuencia | Con el despliegue |
| Endurecimiento de la sesión y de las credenciales | Pendientes de D28: una CSP (antes de las pantallas de acceso y pago), una llave de firma de JWT separada de `SECRET_KEY`, una sesión más corta en el admin y programar `flushexpiredtokens` y `axes_reset_logs`. La caché compartida, `NUM_PROXIES` obligatorio y django-axes ya quedaron (D33 y D34) | CSP antes de los endpoints de acceso de la Etapa 3; el resto con el despliegue |
| Bloqueo por IP en el login de clientes | django-axes aplica a todo `authenticate()`. Con el bloqueo por IP sola (D34), 5 fallos de cualquier cliente detrás de una IP compartida (los operadores móviles usan CGNAT) bloquearían una hora a todos los clientes de esa IP. Opción: bloqueo por IP sola solo en `/admin/` y por IP + correo en la API, con el límite por IP a cargo del throttling | Al diseñar el login de la Etapa 3 |
| Almacenamiento de las fotos de los clientes | Heroku borra el disco de la app en cada reinicio, así que las fotos de referencia, las imágenes de "otra decoración" y las obleas no pueden guardarse en `backend/media/` en producción. Opciones: un almacenamiento externo (por ejemplo, S3 o Cloudinary) o guardarlas en la base de datos | Antes de las subidas (Etapa 4) |
| Compresión de los assets del build | WhiteNoise no comprime lo que sirve desde el build de Vite. Opciones: un plugin de compresión en Vite o pasar el build por `collectstatic` | Etapa 3, cuando entre react-three-fiber |
| Preguntas del catálogo para la pastelería | Unidad del pan para encargos de hoy, pan de cada pastel de vitrina, sabores y minis en vitrina, Mosaico con yogurt, vitrina frente a rebanadas, peso que cuenta para el envío gratis y base de 26 a 50 kg (D32) | Cuando responda la pastelería |
| Refresh anterior a un cambio de contraseña | SimpleJWT lo renueva aunque el access que entrega recibe 401 (D28). La vista de refresh puede rechazarlo de forma explícita | Etapa 3, con el acceso |
| Envío gratis con 15 kg o más a más de 15 km | Pregunta para la pastelería ([`../reglas-de-negocio.md`](../reglas-de-negocio.md), sección 8) | Cuando responda la pastelería |
| HSTS con subdominios | `SECURE_HSTS_INCLUDE_SUBDOMAINS` sigue apagado (D40). Activarlo (y el preload) obliga a todo subdominio de `pasteleriailusion.me` a servir HTTPS, y es difícil de deshacer mientras el dominio pueda cambiar | Al cierre del proyecto |

## Ver también

- [Plan de trabajo](plan-de-trabajo.md)
- [Arquitectura](arquitectura.md)
- [Tecnologías](tecnologias.md)
- [Bitácora del proyecto](../bitacora.md)
