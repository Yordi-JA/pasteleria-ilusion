# Guion de la presentación

Guion para los tres expositores del Equipo 02 y para cualquier IA que deba explicar el proyecto a alguien que no programa. La presentación dura 15 minutos o menos, con una demostración en vivo de unos 4 minutos, y apunta al nivel "Excelente" de la rúbrica en cada rubro. El detalle técnico, para las preguntas del profesor, está en [`anexo-tecnico.md`](anexo-tecnico.md).

La exposición es el martes 24 de noviembre de 2026, o el jueves 26 si así lo asigna el profesor. Las diapositivas se arman en Canva.

## Contenido

- [Reparto y tiempos](#reparto-y-tiempos)
- [Reglas para hablar](#reglas-para-hablar)
- [Diapositivas](#diapositivas)
- [Demo en vivo](#demo-en-vivo)
- [Plan B si falla internet](#plan-b-si-falla-internet)
- [Trabajo a futuro](#trabajo-a-futuro)
- [Diapositivas de respaldo](#diapositivas-de-respaldo)
- [Rúbrica a diapositiva](#rúbrica-a-diapositiva)
- [Fuentes en APA](#fuentes-en-apa)
- [Datos por confirmar con el equipo](#datos-por-confirmar-con-el-equipo)

## Reparto y tiempos

| Diapositiva | Tema | Presenta | Tiempo |
| --- | --- | --- | --- |
| 1 | Portada | Leslie | 0:20 |
| 2 | Problema y objetivo | Leslie | 0:50 |
| 3 | Definición del producto | Leslie | 0:50 |
| 4 | Contexto de negocio y mercado | Leslie | 0:50 |
| 5 | Propuesta de negocio | Leslie | 0:50 |
| 6 | Estrategia | Camila | 0:50 |
| 7 | Plan de trabajo: baseline y real | Camila | 1:10 |
| 8 | Mockup | Camila | 0:40 |
| 9 | Arquitectura | Yordi | 1:00 |
| 10 | Tecnología y framework | Yordi | 0:45 |
| 11 | Patrones de diseño | Yordi | 0:45 |
| 12 | Calidad y pruebas | Yordi | 0:40 |
| Demo | Sitio en vivo | Yordi, con la voz del cliente de Leslie | 4:00 |
| 13 | Conclusiones | Camila | 0:45 |
| 14 | Fuentes | Leslie | 0:15 |
| Total | 14 diapositivas y la demo | | 14:30 |

Quedan 30 segundos de margen. Si el tiempo aprieta, se recorta de la diapositiva 11 y de la 12, nunca de la demo.

Nombres completos: Jaramillo Rodríguez Leslie Citlalli (Leslie), Salas Hernández Camila Alexandra (Camila) y Jiménez Ayala Yordi Josué (Yordi).

## Reglas para hablar

- Se dice "Diseña tu pastel", "pedido", "base" y "pan". Cuando se mencione la parte técnica, se puede decir "cotizador 3D", pero no al enseñar la pantalla.
- Cada cifra que se diga sale de este guion y tiene fecha. No se inventan cifras de mercado ni de ventas.
- Lo que la pastelería aún no define (aviso de privacidad, términos, política de cambios, base dañada) se dice tal cual: "queda configurable y marcado como pendiente".
- Los diagramas simplificados no llevan nombres de código. Los técnicos se enseñan solo si preguntan.

## Diapositivas

### Diapositiva 1. Portada

- Presenta: Leslie. Tiempo: 0:20.
- Se dice:
    - Somos el Equipo 02 y presentamos el sitio de Pastelería Ilusión, una pastelería familiar real de la Ciudad de México.
    - Es el proyecto final de Negocios Electrónicos y Desarrollo Web, con el maestro Gerardo Gabriel Carrasco Zúñiga.
- En la diapositiva:
    - Título: Pastelería Ilusión, comercio electrónico para una pastelería familiar.
    - Los tres nombres, la materia, UNAM, Facultad de Ingeniería, semestre 2027-1, grupo 3.
    - Imagen: el logo, `../../../assets/logos/ilusion-logo.svg`, o la captura de la portada, `../../../mockup/capturas/escritorio/001-Main.jpg`. Para la captura real del sitio, ver la demo.
- Rubro: apertura.

### Diapositiva 2. Problema y objetivo

- Presenta: Leslie. Tiempo: 0:50.
- Se dice:
    - La pastelería vende en su local. Sus pedidos grandes, las bases que presta con depósito y las entregas dependen de notas de papel y de acuerdos a mano.
    - Una nota de papel se pierde y no dice si la base ya regresó. Dos pedidos pueden caer en la misma hora.
    - Nuestro objetivo es uno: desarrollar un sitio de comercio electrónico que digitalice las ventas, el inventario y los pedidos de la pastelería.
    - De ahí salen seis metas concretas, que se ven en pantalla.
- En la diapositiva:
    - Título: El problema y el objetivo.
    - Objetivo general en una frase: aplicar lo visto en la materia para construir un sitio funcional que digitalice ventas, inventario y pedidos de una pastelería local.
    - Seis metas, una línea cada una: catálogo con disponibilidad; cotizar, comprar y pagar con carrito; "Diseña tu pastel" con precio exacto; garantía digital de las bases; agenda de entregas sin empalmes; cancelaciones y devoluciones claras.
    - Imagen sugerida: ninguna; usar íconos simples. Fuente de las metas: [`../objetivos.md`](../objetivos.md).
- Rubro: Objetivo (Excelente: definición clara). Un solo objetivo general, seis metas medibles.
- Nota para quien presente: la parte de "notas de papel" sale de las reglas de negocio, que dicen que la nota en PDF "sustituye la nota actual de la pastelería" ([`../../reglas-de-negocio.md`](../../reglas-de-negocio.md), sección 7). Cómo llegan hoy los pedidos (WhatsApp, local) queda por confirmar con el equipo.

### Diapositiva 3. Definición del producto

- Presenta: Leslie. Tiempo: 0:50.
- Se dice:
    - El producto es un sitio web con tres servicios, separados para que se entienda qué se compra.
    - Uno: catálogo y vitrina del día, con pasteles, rebanadas y postres de precio fijo.
    - Dos: "Diseña tu pastel". El cliente arma su pedido en 8 pasos, ve cómo queda en una vista previa 3D y el servidor calcula el precio exacto. Si quiere algo que el diseñador no cubre, manda hasta 3 fotos de referencia y la pastelería le cotiza.
    - Tres: préstamo de bases con depósito. Los pedidos de 4 kg o más llevan una base prestada, con una nota en PDF con código QR. El depósito se reembolsa al devolverla.
- En la diapositiva:
    - Título: Qué ofrece el sitio.
    - Tres columnas con el nombre de cada servicio y una línea.
    - Imágenes: `../../../mockup/capturas/escritorio/003-Catalogo.jpg` (catálogo), `../../../mockup/capturas/escritorio/056-CotizadorPersonas.jpg` (paso 1) y `../../../mockup/capturas/escritorio/027-NotaPDF.jpg` (nota). Si hay captura del sitio real, preferirla.
- Rubro: Definición de producto o servicio (Excelente: claridad). Tres servicios y no más.

### Diapositiva 4. Contexto de negocio y mercado

- Presenta: Leslie. Tiempo: 0:50.
- Se dice:
    - Es un negocio real, familiar, abierto todos los días de 10:00 a 22:30. No es un caso inventado: las reglas las definió la pastelería y las validó con nosotros.
    - Compra y pago en línea ya son normales para el cliente. En clase vimos el efecto de la pandemia en el consumo y los medios de pago electrónicos, como Mercado Pago y las tarjetas.
    - Un negocio pequeño tiene tres problemas para vender en línea: cobrar sin riesgo, no vender dos veces la misma pieza y cuidar sus datos.
    - Cumplimos con lo que ya podemos y dejamos visible lo que falta: el aviso de privacidad y los términos quedan pendientes de la pastelería y el sitio los marca así.
- En la diapositiva:
    - Título: El negocio y su entorno.
    - Cuatro puntos: negocio familiar real de la Ciudad de México; todos los días de 10:00 a 22:30; pagos en línea con Mercado Pago y Stripe, y efectivo en el local; marco legal mexicano (protección de datos, derechos del consumidor) con textos pendientes.
    - Imagen sugerida: `../../../mockup/capturas/escritorio/044-BasesInfo.jpg` o una foto de producto de `docs/fotografia.md`.
- Rubro: Contexto de negocio y mercado.
- Por confirmar con el equipo: cifras de mercado (tamaño del comercio electrónico en México, competidores, ventas de la pastelería). El repositorio no las trae y no se inventan. Si se quiere citar una, hay que sumarla a [`../referencias.md`](../referencias.md) en APA antes.

### Diapositiva 5. Propuesta de negocio (valor agregado)

- Presenta: Leslie. Tiempo: 0:50.
- Se dice:
    - Le proponemos a la pastelería vender las 24 horas con las mismas reglas que ya usa en el local, pero sin depender de que alguien conteste.
    - La pastelería cambia precios, límites y existencias desde su panel, sin pedirnos un cambio de código.
    - Cobra un anticipo, hoy el 50% configurable, y el resto al entregar. El depósito de la base va aparte y se devuelve.
    - La agenda no empalma pedidos: máximo 3 pedidos activos por lapso de 30 minutos.
    - El costo de operar es bajo: un servicio en Heroku con base de datos y un dominio propio. Los montos exactos están por confirmar con el equipo.
- En la diapositiva:
    - Título: Qué gana la pastelería.
    - Cuatro puntos: precios y límites editables sin programador; anticipo y depósito automáticos; agenda sin empalmes; garantía digital de las bases.
    - Un Canvas de modelo de negocio mínimo (propuesta del guion, por confirmar con el equipo): clientes que piden pasteles para eventos y antojo del día; propuesta de valor, pedir y pagar en línea sin errores; canales, el sitio; ingresos, venta directa con anticipo; actividades clave, hornear y entregar a tiempo.
- Rubro: Propuesta de negocio (valor agregado). Relaciona con el tema 1.2.2 de clase (modelos de negocio y Canvas).

### Diapositiva 6. Estrategia

- Presenta: Camila. Tiempo: 0:50.
- Se dice:
    - Trabajamos por etapas cortas y con revisión al final de cada una, no una entrega gigante al final.
    - Primero cerramos las reglas del negocio con la pastelería y la imagen del sitio, porque cambiar reglas después obliga a rehacer la base de datos.
    - Desde la segunda etapa, servidor y pantallas avanzan en paralelo, y desde el 4 de noviembre el sitio ya está en internet.
    - Al iniciar las etapas 3 y 4 definimos el "mínimo para la exposición": lo que sí debe funcionar y lo que entra solo si sobra tiempo.
    - Cada decisión queda anotada con su fecha y su razón.
- En la diapositiva:
    - Título: Cómo lo hicimos.
    - Cinco puntos: etapas iterativas; reglas primero; servidor y pantallas en paralelo; despliegue desde la etapa 2; mínimo para la exposición por etapa.
    - Imagen: ninguna o una línea de tiempo simple. Fuentes: [`../plan-de-trabajo.md`](../plan-de-trabajo.md) y [`../decisiones.md`](../decisiones.md) (D44 y D61).
- Rubro: Estrategia (Excelente: detallada, clara y precisa). Los tres riesgos principales, con su mitigación, están en la diapositiva de respaldo R10.

### Diapositiva 7. Plan de trabajo: baseline y real

- Presenta: Camila. Tiempo: 1:10.
- Se dice:
    - El anteproyecto del 1 de octubre planeó 8 semanas lineales: objetivos y mockup, framework y base de datos, catálogo, 3D, pagos, agenda, pruebas y reporte.
    - El plan real tiene 5 etapas y es más exigente: la primera se alargó hasta el 31 de octubre porque las reglas de la pastelería cambiaban con cada respuesta y porque tuvimos que crear su identidad visual.
    - Para compensar, juntamos el trabajo de servidor y pantallas desde el 1 de noviembre y desplegamos el 4 de noviembre.
    - Las etapas 2 y 3 cerraron a tiempo: el 6 y el 13 de noviembre. La 4 era del 14 al 19 de noviembre; el congelamiento del código se movió al 22 de noviembre porque seguimos corrigiendo la interfaz, y está justificado en una decisión (D101).
    - El baseline no se tocó. Todo cambio al plan real quedó en un registro.
- En la diapositiva:
    - Título: Plan baseline y plan real.
    - Tabla comparativa de dos columnas: baseline en 8 semanas (1 oct al 25 nov) y real en 5 etapas (8 oct al 23 nov), con las fechas de cierre real de las etapas 1 a 3.
    - Dos puntos de justificación: reglas cambiantes; identidad visual en la misma etapa.
    - Imagen: el Gantt de [`../plan-de-trabajo.md`](../plan-de-trabajo.md#gantt-baseline-y-plan-real) está en Mermaid; para Canva, rehacerlo como dos barras horizontales o capturarlo renderizado en GitHub.
- Rubro: Plan de trabajo baseline vs. real (Excelente: plan real, retador, explicado y justificado).
- Por confirmar con el equipo: la fecha real de cierre de la Etapa 4. La tabla "Ejecución real" del plan todavía dice "Por cerrar".

### Diapositiva 8. Mockup

- Presenta: Camila. Tiempo: 0:40.
- Se dice:
    - Antes de programar diseñamos 60 vistas, en escritorio y en celular, con sus estados de carga, error, vacío y agotado.
    - El mockup son prototipos de diseño, no código. Sirvió de guía para construir el sitio de verdad, que ya se parece a él y que veremos en vivo.
    - Donde el sitio cambió algo respecto al mockup, quedó anotado en el mapa de vistas.
- En la diapositiva:
    - Título: Del mockup al sitio.
    - Dos imágenes lado a lado: mockup `../../../mockup/capturas/escritorio/001-Main.jpg` y móvil `../../../mockup/capturas/movil/002-Movil.jpg`, y a la derecha la captura del sitio real (hacerla antes de exponer).
    - Dato: 60 vistas en escritorio y móvil; paleta "Fresa y mermelada".
    - Fuente: [`../../mapa-de-vistas.md`](../../mapa-de-vistas.md), [`../../libro-de-marca.md`](../../libro-de-marca.md).
- Rubro: Prototipo / mockup (Excelente: demo funcional y presentada; el sitio en vivo cierra este punto).

### Diapositiva 9. Arquitectura

- Presenta: Yordi. Tiempo: 1:00.
- Se dice:
    - Este es el diagrama de contexto: quién usa el sistema y con qué se conecta.
    - El cliente usa el sitio web. El personal de la pastelería usa un panel de administración para precios, pedidos, cobro en efectivo y devolución de bases.
    - El sitio habla con un servidor, y el servidor con la base de datos. Hacia afuera se conecta con Google para entrar, con Mercado Pago y Stripe para cobrar en modo de prueba, y con un servicio de correo para avisar al cliente.
    - Una revisión automática cancela los pedidos apartados que no se pagan a tiempo.
    - En línea punteada está lo que queda a futuro: vistas del personal dentro del sitio y la API de rutas para el envío a domicilio.
    - Por dentro, el sitio se organiza en capas para que cada pieza haga una sola cosa.
- En la diapositiva:
    - Título: Arquitectura del sitio.
    - Imagen principal: `diagramas/contexto.png`. Segunda imagen pequeña o animación: `diagramas/capas.png`.
    - Tres puntos: sitio y servidor separados, con una API versionada; reglas de negocio en una capa propia; acceso a datos en otra.
    - Versión técnica para respaldo: [`../diagramas/contexto.svg`](../diagramas/contexto.svg) y [`../diagramas/capas-peticion.svg`](../diagramas/capas-peticion.svg).
- Rubro: Arquitectura (Excelente: diagramada y explicada).

### Diapositiva 10. Tecnología y framework

- Presenta: Yordi. Tiempo: 0:45.
- Se dice:
    - Elegimos Django para el servidor porque trae el panel de administración, la base de datos y las migraciones. Eso le da a la pastelería un panel para editar precios sin código extra.
    - Usamos React para las pantallas y Tailwind CSS para los estilos con la paleta de la marca. La vista previa 3D usa react-three-fiber.
    - La base de datos es PostgreSQL, porque los cobros, la agenda y los depósitos necesitan transacciones.
    - Los frameworks no solo están elegidos: están instalados, con versiones fijas, y los vamos a ver funcionando en la demo.
    - Consideramos FastAPI y lo descartamos: no trae panel ni migraciones, y habría que duplicar la sesión y los permisos.
- En la diapositiva:
    - Título: Tecnología y framework.
    - Tabla corta: Servidor, Django 5.2 LTS y Django REST Framework; Pantallas, React y TypeScript con Vite; Estilos, Tailwind CSS 3; 3D, react-three-fiber; Datos, PostgreSQL 18; Pagos, Mercado Pago y Stripe en sandbox; Acceso, Google (OAuth 2.0) y correo con JWT; Despliegue, Heroku.
    - Imagen: logos de las tecnologías (los de Mercado Pago y Stripe están en `../../../assets/logos/mercado-pago.svg` y `../../../assets/logos/stripe.svg`).
    - Las versiones exactas están en `backend/requirements.txt` y `frontend/package.json`.
- Rubro: Tecnología (Excelente: documentada y detallada) y Framework (Excelente: seleccionado, instalado y demostrado).

### Diapositiva 11. Patrones de diseño

- Presenta: Yordi. Tiempo: 0:45.
- Se dice:
    - Usamos patrones del curso donde resuelven un problema real, no por decorar.
    - Pagos: una fábrica elige el procesador (Mercado Pago, tarjeta o efectivo) y un traductor aísla cada servicio externo. Agregar otra forma de pago es agregar una pieza, sin tocar la fábrica.
    - Precio: reglas intercambiables para calcular cada parte del pastel.
    - Avisos: cuando cambia un pedido, quien esté suscrito se entera solo: el correo, el inventario y las bases prestadas.
    - También evitamos los antipatrones que vimos en clase.
- En la diapositiva:
    - Título: Patrones de diseño.
    - Imágenes: `diagramas/pagos.png` y `diagramas/avisos-pedido.png`.
    - Lista: Factory Method y Adapter (pagos), Strategy (precio), Observer (avisos), Repository (datos), Decorator (auditoría).
    - Versiones técnicas: [`../diagramas/fabrica-pagos.svg`](../diagramas/fabrica-pagos.svg) y [`../diagramas/observer-pedido.svg`](../diagramas/observer-pedido.svg).
- Rubro: Arquitectura y Framework (profundidad técnica), tema 3 del curso.

### Diapositiva 12. Calidad y pruebas

- Presenta: Yordi. Tiempo: 0:40.
- Se dice:
    - Probamos la lógica del negocio con pytest y el recorrido de compra en un navegador real con Playwright.
    - Al 22 de noviembre, en la computadora del equipo, pasaron 2375 pruebas de servidor. En el navegador corrimos 29 archivos de pruebas: pasaron 509 de 514, y las cinco que fallaron se explican en el anexo.
    - Además cuidamos la accesibilidad (WCAG 2.1 AA) y la seguridad: la sesión, los pagos con firma verificada y la protección contra pedidos duplicados.
    - Después de esta diapositiva lo enseñamos en vivo.
- En la diapositiva:
    - Título: Calidad y pruebas.
    - Dos cifras con fecha y lugar: "22 nov 2026, local: 2375 pruebas de servidor" y "509 de 514 en el navegador (29 archivos)".
    - Imagen: captura de la terminal con `pytest` o con `npx playwright test`.
- Rubro: Demo con pruebas (valor agregado).
- Cuidado: las cifras son de la rama de trabajo en local ([`../pruebas.md`](../pruebas.md), "Estado al 22 de noviembre de 2026"). No se corrieron en Heroku ni en un teléfono real. Si se corren de nuevo antes de exponer, usar los números nuevos.

### Demo en vivo

Ver [Demo en vivo](#demo-en-vivo). Presenta: Yordi. Tiempo: 4:00.

### Diapositiva 13. Conclusiones

- Presenta: Camila. Tiempo: 0:45.
- Se dice:
    - Cumplimos el objetivo: hay un sitio en internet donde se consulta, se diseña, se paga, se agenda y se cancela un pedido, con las reglas de una pastelería real.
    - Lo aprendido: cerrar las reglas con el cliente antes de programar ahorra retrabajo, y los patrones de diseño sirven cuando hay un problema que resolver.
    - Lo que falta es de la pastelería y no se inventa: aviso de privacidad, términos, política de cambios y qué pasa si una base regresa dañada. Quedan configurables y marcados como pendientes.
    - Siguientes pasos, en una frase: vistas del personal dentro del sitio, un ida y vuelta de la cotización con aviso por correo, entrega a domicilio con cálculo de distancia y los textos legales con la pastelería. La lista completa está en [Trabajo a futuro](#trabajo-a-futuro).
- En la diapositiva:
    - Título: Conclusiones.
    - Tres bloques: lo logrado, lo aprendido, siguientes pasos.
    - Siguientes pasos, cuatro viñetas cortas: vistas del personal; cotización de ida y vuelta; entrega a domicilio con distancia; textos legales y políticas.
    - Imagen: captura del sitio o el logo.
- Rubro: cierre; refuerza Objetivo y Plan.

### Diapositiva 14. Fuentes

- Presenta: Leslie. Tiempo: 0:15.
- Se dice:
    - Las fuentes están en formato APA y en el reporte final.
- En la diapositiva:
    - Título: Fuentes.
    - La lista de [Fuentes en APA](#fuentes-en-apa), en letra pequeña, a dos columnas.
- Rubro: Fuentes (Excelente: documentación de fuentes y bibliografía en APA).

## Demo en vivo

Duración: 4 minutos. Sitio: https://pasteleriailusion.me. Basada en el mínimo para la exposición de D44 y D61 ([`../decisiones.md`](../decisiones.md)): catálogo y "Diseña tu pastel" con 3D y precio del servidor (D44), y acceso, carrito, agenda sin empalmes, pago en sandbox y efectivo, nota con QR y devolución de la base (D61).

### Antes de entrar

- Abrir el sitio una hora antes y confirmar que carga. El dyno es Basic, que no se duerme, pero un arranque en frío puede tardar (D38).
- Verificar en el sitio desplegado que las últimas correcciones estén. Los documentos del repositorio aún dicen que las migraciones `0063` a `0069` no están en Heroku, y el historial de git muestra que el PR #59 ya entró a `main`. Hay que confirmarlo con el equipo.
- Tener lista una cuenta de cliente ya registrada y confirmada, y el panel de administración abierto en otra pestaña con una cuenta de personal. Las credenciales no se escriben en este documento.
- Para Mercado Pago, tener lista la cuenta de comprador de prueba del sandbox (por confirmar con el equipo).
- Para Stripe, usar la tarjeta de prueba que da su documentación.
- Dejar abierta una terminal en `backend/` y otra en `frontend/` para el cierre con pruebas.
- Ventana a 1440 px de ancho; tener a la mano la vista móvil de 390 px por si piden verla.

### Guion paso a paso

| Tiempo | Qué se hace | Qué se dice | Qué demuestra |
| --- | --- | --- | --- |
| 0:00 a 0:30 | Portada: el pastel 3D gira, bajar a la vitrina del día | Esto está en internet, con dominio propio. La vitrina muestra lo que hay hoy y lo agotado se ve como agotado | Catálogo y vitrina, objetivo 1 |
| 0:30 a 1:30 | "Diseña tu pastel": 20 personas, tipo, pan, relleno, color, un mensaje; ir mostrando la vista previa y el total | Cada paso cambia el pastel de la derecha. El precio lo calcula el servidor, el navegador solo lo muestra | "Diseña tu pastel" con 3D y precio exacto, objetivo 3 |
| 1:30 a 2:00 | Agregar al pedido, abrir el carrito, iniciar sesión con la cuenta lista | El carrito funciona sin cuenta. Para pagar se necesita una | Acceso y carrito, objetivo 2 |
| 2:00 a 2:30 | Entrega: elegir una fecha, ver un lapso lleno y uno libre | Hay máximo 3 pedidos por lapso de 30 minutos y 2 días de anticipación | Agenda sin empalmes, objetivo 5 |
| 2:30 a 3:15 | Pago: mostrar "Pagar con tarjeta", "Pagar con Mercado Pago" y efectivo; pagar con la tarjeta de prueba, o elegir efectivo para ver "Apartado, falta tu pago" | Hoy se paga el anticipo y el depósito de la base. Con efectivo el pedido queda apartado y se cancela solo si no se paga el mismo día | Pagos en sandbox, objetivos 2 y 6 |
| 3:15 a 3:40 | Confirmación: descargar la nota en PDF, escanear o abrir el QR, entrar a "Bases en préstamo" en la cuenta | La nota sustituye al papel y el QR verifica que es válida sin mostrar datos personales | Garantía digital de las bases, objetivo 4 |
| 3:40 a 4:00 | Cambiar a la terminal: mostrar las pruebas (ver abajo) | La lógica y la compra se prueban de forma automática | Demo con pruebas |

Si queda tiempo, o si preguntan: en el panel de administración, cambiar el estado de un pedido apartado a "Recibido" y mostrar el correo o el cambio de estado; registrar "Base devuelta"; mostrar `Cancelar pedido` desde "Mis pedidos". Todo eso es parte del mínimo de D61.

### Cómo mostrar las pruebas

Las pruebas son valor agregado. Enseñarlas sin correr todo, porque una corrida completa de Playwright tarda varios minutos.

| Prueba | Comando | Qué mostrar |
| --- | --- | --- |
| Servidor (pytest) | Desde `backend/`, con la base arriba: `.venv/bin/pytest tests/test_pricing_service.py tests/test_payment_factory.py` | Sale rápido y en verde. Muestra el precio y la fábrica de pagos |
| Navegador (Playwright) | Desde `frontend/`: `npx playwright test e2e/checkout-cart.spec.ts` | Un recorrido de compra en un navegador real. Para verlo, agregar `--headed` |
| Cifras completas | Ninguno; leer la diapositiva 12 | Se dicen con fecha y lugar, nunca como si fueran de hoy en Heroku |

Los archivos existen: `backend/tests/test_pricing_service.py`, `backend/tests/test_payment_factory.py` y `frontend/e2e/checkout-cart.spec.ts`. El comando de pytest requiere el entorno y `backend/.env` creados ([`../../../README.md`](../../../README.md), "Cómo correrlo"). Se recomienda correrlos una vez antes de exponer para saber cuánto tardan; los tiempos de esta máquina no están en el repositorio.

## Plan B si falla internet

En el repositorio no existe un video de respaldo. El README y el plan de trabajo lo piden como tarea de la Etapa 5 ("video de respaldo de la demo"), pero no hay un archivo. Sugerencia: grabar la demo completa antes del martes, de 3 a 4 minutos, con el mismo guion, y llevarla en la computadora y en una memoria USB.

Orden de respaldo si algo falla:

1. Sin internet en el salón: usar el hotspot del celular. Si el sitio responde lento, seguir con el video.
2. El sitio en línea no responde: correr el proyecto local (`npm run dev` en `frontend/`, `runserver` en `backend/`, con PostgreSQL en Docker; ver [`../../../README.md`](../../../README.md)) y hacer la demo en `http://127.0.0.1:5173`. Requiere haberlo probado antes.
3. Falla un pago: pasar a efectivo, que no depende de un servicio externo, o contar el resultado con la captura.
4. Nada funciona: reproducir el video y contar encima. Si tampoco hay video, usar las capturas del mockup de `../../../mockup/capturas/escritorio/` y decirlo con claridad.

Los pagos en vivo dependen de los servicios de prueba de Mercado Pago y Stripe. Dejar una captura previa del pago aprobado en cada uno.

## Trabajo a futuro

Lo que no se construyó, dicho en lenguaje llano y con la razón cuando se conoce. Cada punto se verificó contra el repositorio el 22 de noviembre de 2026. El detalle técnico, con la decisión que lo registra y el tamaño del trabajo, está en [`anexo-tecnico.md`](anexo-tecnico.md#trabajo-a-futuro).

### Para el personal de la pastelería

- El personal trabaja solo en el panel de administración, no en pantallas del sitio. Se decidió así para llegar a la fecha (D64).
- Devolver dinero de un pago en línea se hace a mano en el panel de Mercado Pago o de Stripe. Un botón "Reembolsar" en el panel quedó como opción si sobraba tiempo y no se hizo.
- No hay un historial de estados del pedido: el detalle muestra la fecha del pago y del estado actual, no la de cada paso.
- Los permisos para cotizar y para cancelar desde el panel comparten uno solo, y el cobro en efectivo ya tiene el suyo.

### Para el cliente

- Cotización de ida y vuelta. Sí existe: el cliente manda fotos, la pastelería pone precio en el panel, el cliente recibe un correo, ve la cotización con su base y lo que paga hoy, y puede aceptar y pagar o cancelar. Falta que pedir un cambio ocurra dentro del sitio (hoy abre WhatsApp), que el pedido en pausa por una decoración con imagen avise por correo cuando recibe precio, y que una cotización venza o se cancele sola, porque la pastelería no ha dicho cuánto debe durar.
- "Volver a pedir" un pedido anterior no existe: hay que decidir qué pasa con los precios y la vitrina de hoy.
- El correo de la cuenta no se puede cambiar y las cuentas que nunca se confirman no se borran.
- No hay correo al cancelar un pedido ni al devolver una base, ni aviso cuando alguien cambia la contraseña o el teléfono de una cuenta.
- El sitio no manda mensajes de WhatsApp: el cliente solo marca que acepta que la pastelería le escriba.

### Entrega y logística

- Entrega a domicilio en línea: hoy se coordina por WhatsApp. Falta calcular la distancia con una API de rutas para cobrar la tarifa ya aprobada (D66).
- La pastelería no ha dicho si tendrá repartidor propio o usará una aplicación.
- Sin respuesta: si un pedido de 15 kg o más a más de 15 km manda gratis.
- Un mapa dentro del sitio junto a la dirección. Hoy "Cómo llegar" abre Google Maps.

### Negocio y legal

- Aviso de privacidad y términos: la página existe y muestra un marcador de pendiente, porque el texto lo redacta la pastelería.
- Política de cambios y qué pasa si una base regresa dañada o fuera de plazo. Hoy el depósito siempre se devuelve completo.
- Cuánto tiempo se guardan el nombre y el teléfono de quien recoge.
- Datos que solo la pastelería puede dar: precio de "Tres leches de nuez", peso y precio de las rosas del pastel mini, y confirmar los valores propuestos (30 minutos para pagar, 2 pedidos sin pagar por cliente, 60 días a futuro y otros).
- Tamaño máximo de la imagen de "Otra decoración": propuesta de 5 MB, sin confirmar.

### Operación y calidad

- La revisión que cancela los pedidos apartados sin pagar ya corre sola en Heroku cada 10 minutos (verificado en los registros de Heroku el 22 de noviembre de 2026). Lo que falta programar son dos limpiezas internas: borrar las sesiones vencidas y los registros viejos de intentos de acceso.
- No hay integración continua: las pruebas se corren a mano y el despliegue también.
- Las rutas del sitio cargan juntas en un solo archivo grande. Cargarlas por separado lo aligeraría.
- Pruebas pendientes: pagos con cuentas de prueba reales de punta a punta, accesibilidad con una herramienta automática, un teléfono real, y correos en Gmail y Outlook reales.
- Endurecimiento de seguridad que quedó abierto: sesión más corta y política de contenido para el panel, y activar HSTS con subdominios al cierre del proyecto.
- Limpieza de imágenes subidas que nunca entraron a un pedido.
- Una cola de tareas para los correos, que hoy salen en la misma petición con un corte de 5 segundos.

## Diapositivas de respaldo

No se exponen salvo que pregunten. Las imágenes técnicas están en [`../diagramas/`](../diagramas/).

| Respaldo | Tema | Contenido | Imagen |
| --- | --- | --- | --- |
| R1 | Capas de una petición | Recorrido: pantalla, lógica de la pantalla, conexión, internet, validación, reglas, datos, base | `diagramas/capas.png`; técnica: [`../diagramas/capas-peticion.svg`](../diagramas/capas-peticion.svg) |
| R2 | Pagos | Fábrica, traductores y efectivo apartado | `diagramas/pagos.png`; técnica: [`../diagramas/fabrica-pagos.svg`](../diagramas/fabrica-pagos.svg) |
| R3 | Avisos del pedido | Qué pasa cuando cambia un pedido o regresa una base | `diagramas/avisos-pedido.png`; técnica: [`../diagramas/observer-pedido.svg`](../diagramas/observer-pedido.svg) |
| R4 | Estados del pedido | De "Apartado, falta tu pago" a "Entregado" y "Cancelado" | `diagramas/estados-pedido.png`; técnica: [`../diagramas/estados-pedido.svg`](../diagramas/estados-pedido.svg) |
| R5 | Estados de la base | Prestada y Devuelta, con depósito retenido y reembolsado | `diagramas/estados-base.png`; técnica: [`../diagramas/estados-base.svg`](../diagramas/estados-base.svg) |
| R6 | Un precio de ejemplo | 15 kg, tres leches, pan de chocolate, base con queso y zarzamora: 15 x ($250 + $5) = $3,825; con oblea de $125, total $3,950; hoy se paga $2,175 (anticipo $1,975 y depósito de $200). Valores de [`../pruebas.md`](../pruebas.md), pendientes de confirmar contra el servidor | Tabla |
| R7 | Seguridad | Webhooks con firma, monto del servidor, cookie HttpOnly para renovar la sesión, bloqueo por intentos, datos de tarjeta solo en los componentes de Stripe y Mercado Pago | Lista |
| R8 | Cancelaciones y devoluciones | El cliente cancela antes de la entrega; si ya pagó, la pastelería retiene el 50% del pedido (sin el depósito de la base) y el personal devuelve el resto a mano. El efectivo apartado no pagado se cancela solo. La política de cambios está pendiente | Tabla |
| R9 | Pendientes y legales | Aviso de privacidad y términos (página `/legal` con marcador de pendiente), política de cambios, base dañada, repartidor propio o aplicación, vigencia de la cotización | Lista |
| R10 | Riesgos del plan | Carga del frontend, datos pendientes de la pastelería, tres formas de pago, fechas fijas, API de distancias; cada uno con su mitigación en [`../plan-de-trabajo.md`](../plan-de-trabajo.md#riesgos) | Tabla |
| R11 | Agentes de IA | El repositorio usa `AGENTS.md` para guiar a los agentes de código; los agentes no hacen commits ni push. Qué se hizo con ayuda de IA y cómo se revisó: por confirmar con el equipo | Texto |
| R12 | Pruebas por fecha | Qué dice cada documento y de cuándo es; ver el anexo | Tabla |
| R13 | Trabajo a futuro | Resumen de la sección [Trabajo a futuro](#trabajo-a-futuro) en cinco grupos: personal (vistas y reembolsos), cliente (cotización de ida y vuelta, volver a pedir), entrega (API de rutas, repartidor), negocio y legal (privacidad, términos, política de cambios, base dañada), operación (integración continua, limpiezas programadas) | Lista de cinco grupos |

## Rúbrica a diapositiva

| Rubro | Qué pide "Excelente" | Diapositiva | Cómo lo cubrimos |
| --- | --- | --- | --- |
| Objetivo | Definición clara | 2 y 13 | Un objetivo general y seis metas |
| Definición de producto o servicio | Claridad en el producto y los servicios | 3 | Tres servicios, separados |
| Contexto de negocio / mercado | Parte del anteproyecto y de la entrega final | 4 | Negocio real, entorno y marco legal; cifras de mercado por confirmar |
| Estrategia | Detallada, clara y precisa | 6 | Etapas, reglas primero, paralelo, mínimo de exposición |
| Plan de trabajo (baseline vs. real) | Plan real, retador, explicado y justificado | 7 y R10 | Dos planes, desfase justificado, cambios registrados |
| Arquitectura | Diagramada y explicada | 9, 11, R1 a R5 | Diagrama de contexto y capas, explicados en voz alta |
| Tecnología | Claramente documentada y detallada | 10 | Tabla de versiones y razones |
| Framework | Seleccionado, instalado y demostrado | 10 y demo | Django y React elegidos, instalados y vistos en vivo |
| Prototipo / mockup | Demo funcional y presentada | 8 y demo | Mockup y sitio en línea |
| Fuentes | Documentación y bibliografía en APA | 14 | Lista en APA |
| Propuesta de negocio (valor agregado) | Entrega final | 5 | Qué gana la pastelería |
| Demo con pruebas (valor agregado) | Entrega final | 12 y demo | Pruebas con fecha y una corrida en vivo |

## Fuentes en APA

Tomadas de [`../referencias.md`](../referencias.md), sin cambios. Los títulos y las URL de documentación en línea se consultaron el 1 de noviembre de 2026 (algunas el 2). Lo marcado "por verificar" sigue pendiente.

Django Software Foundation. (s. f.). *Django documentation*. Recuperado el 1 de noviembre de 2026, de https://docs.djangoproject.com/

*Django REST framework*. (s. f.). Recuperado el 1 de noviembre de 2026, de https://www.django-rest-framework.org/

*Quick start*. (s. f.). React. Recuperado el 1 de noviembre de 2026, de https://react.dev/learn

*Introduction*. (s. f.). React Three Fiber. Recuperado el 1 de noviembre de 2026, de https://r3f.docs.pmnd.rs/getting-started/introduction

*three.js docs*. (s. f.). Recuperado el 1 de noviembre de 2026, de https://threejs.org/docs/

Tailwind Labs. (s. f.). *Tailwind CSS documentation*. Recuperado el 1 de noviembre de 2026, de https://tailwindcss.com/docs (título por verificar)

PostgreSQL Global Development Group. (s. f.). *PostgreSQL documentation*. Recuperado el 1 de noviembre de 2026, de https://www.postgresql.org/docs/current/ (título por verificar)

*pytest: helps you write better programs*. (s. f.). Recuperado el 1 de noviembre de 2026, de https://docs.pytest.org/en/stable/

*Fast and reliable end-to-end testing for modern web apps*. (s. f.). Playwright. Recuperado el 1 de noviembre de 2026, de https://playwright.dev/

Mercado Pago. (s. f.). *Mercado Pago Developers*. Recuperado el 1 de noviembre de 2026, de https://www.mercadopago.com.mx/developers/es/docs

Stripe. (s. f.). *Documentación de Stripe*. Recuperado el 1 de noviembre de 2026, de https://docs.stripe.com/

Google. (s. f.). *Overview*. Google Identity Services, Web guides. Recuperado el 1 de noviembre de 2026, de https://developers.google.com/identity/gsi/web/guides/overview

Hardt, D. (Ed.). (2012). *The OAuth 2.0 authorization framework* (RFC 6749). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc6749

*OpenAPI Specification*. (s. f.). OpenAPI Initiative. Recuperado el 1 de noviembre de 2026, de https://spec.openapis.org/oas/latest.html

World Wide Web Consortium. (2018). *Web content accessibility guidelines (WCAG) 2.1*. https://www.w3.org/TR/WCAG21/

Gamma, E., Helm, R., Johnson, R., & Vlissides, J. (1994). *Design patterns: Elements of reusable object-oriented software*. Addison-Wesley.

Fowler, M. (2002). *Patterns of enterprise application architecture*. Addison-Wesley.

Heroku. (s. f.). *Heroku Postgres version support*. Heroku Dev Center. Recuperado el 2 de noviembre de 2026, de https://devcenter.heroku.com/articles/heroku-postgres-version-support

Carrasco Zúñiga, G. G. (s. f.). *Tema 3: Patrones de diseño* [Diapositivas]. Facultad de Ingeniería, Universidad Nacional Autónoma de México. (Título exacto y año por confirmar.)

Carrasco Zúñiga, G. G. (s. f.). *Tema 4: Herramientas de desarrollo, pruebas y APIs* [Diapositivas]. Facultad de Ingeniería, Universidad Nacional Autónoma de México. (Título exacto y año por confirmar.)

## Datos por confirmar con el equipo

- Cifras de mercado y competencia para la diapositiva 4. El repositorio no las trae.
- Costo mensual de operar el sitio (diapositiva 5). D38 da el plan de la base de datos (`essential-0`, máximo de $5 al mes) y dice que el precio del dyno no se verificó.
- Fecha real de cierre de la Etapa 4 en la tabla "Ejecución real" del plan.
- Si las migraciones `0063` a `0069` ya están en el sitio desplegado.
- Cuenta de comprador de prueba de Mercado Pago y credenciales de personal para la demo.
- Cómo llegan hoy los pedidos a la pastelería (diapositiva 2).
- Uso de agentes de IA en el proyecto: qué se hizo con ellos y cómo se revisó (respaldo R11).
- Título exacto y año del material de clase de los temas 3 y 4, y los autores institucionales que faltan en las referencias.
- Si se corrió la accesibilidad con una herramienta automática. [`../pruebas.md`](../pruebas.md) dice que no estaba elegida.
