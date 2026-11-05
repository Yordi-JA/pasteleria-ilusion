# Registro de decisiones

Este registro guarda las decisiones del proyecto con su fecha, su contexto y lo que cambian. Las decisiones D1 a D23 se tomaron entre el 12 de octubre y el 1 de noviembre de 2026; D24 a D28, al inicializar los proyectos el 2 de noviembre; D29 a D35, el mismo 2 de noviembre: identificadores en inglés, catálogo, despliegue, límite de intentos y diagramas; D36 y D37, el 3 de noviembre: componentes base, página de muestra y FastAPI descartado; D38 a D40, el 4 de noviembre: primer despliegue en Heroku, precio de "Diseña tu pastel" y dominio propio; D41, el 5 de noviembre: datos del negocio y su endpoint.

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

## Decisiones abiertas

| Tema | Detalle | Se resuelve |
| --- | --- | --- |
| Mínimo para la exposición | Qué se demuestra en vivo de cada uno de los 6 objetivos y qué entra solo si sobra tiempo | Al iniciar la Etapa 3 |
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
