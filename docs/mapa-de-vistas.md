# Mapa de vistas del mockup

Cada vista del mockup con su ruta sugerida, su archivo fuente (`../mockup/fuente/`) y sus capturas (`mockup/capturas/`). Las rutas son una propuesta: ajústalas si el router lo pide, pero conserva la jerarquía.

Los estados (cargando, error, vacío, agotado) no son rutas propias: son la misma ruta en otro estado. Las capturas muestran datos de ejemplo; los corchetes `[ ]` marcan datos reales que faltan.

## Portada

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Portada | `/` | `Main.dc.html` | [ver](../mockup/capturas/escritorio/001-Main.jpg) | [ver](../mockup/capturas/movil/002-Movil.jpg) |

## Catálogo

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Catálogo | `/catalogo` | `Catalogo.dc.html` | [ver](../mockup/capturas/escritorio/003-Catalogo.jpg) | [ver](../mockup/capturas/movil/004-CatalogoMovil.jpg) |

## Inicio de sesión y registro

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Inicio de sesión | `/entrar` | `Login.dc.html` | [ver](../mockup/capturas/escritorio/005-Login.jpg) | [ver](../mockup/capturas/movil/006-LoginMovil.jpg) |
| Registro | `/registro` | `Registro.dc.html` | [ver](../mockup/capturas/escritorio/007-Registro.jpg) | [ver](../mockup/capturas/movil/008-RegistroMovil.jpg) |
| Mis pedidos | `/cuenta` | `Cuenta.dc.html` | [ver](../mockup/capturas/escritorio/009-Cuenta.jpg) | [ver](../mockup/capturas/movil/010-CuentaMovil.jpg) |
| Bases en préstamo | `/cuenta/bases` | `CuentaBases.dc.html` | [ver](../mockup/capturas/escritorio/011-CuentaBases.jpg) | [ver](../mockup/capturas/movil/012-CuentaBasesMovil.jpg) |
| Datos y avisos | `/cuenta/datos` | `CuentaDatos.dc.html` | [ver](../mockup/capturas/escritorio/013-CuentaDatos.jpg) | [ver](../mockup/capturas/movil/014-CuentaDatosMovil.jpg) |
| Menú de mi cuenta (móvil) | `/cuenta (menú móvil abierto)` | `CuentaMenu.dc.html` | — | [ver](../mockup/capturas/movil/015-CuentaMenu.jpg) |

## Carrito y pago

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Carrito | `/carrito` | `Carrito.dc.html` | [ver](../mockup/capturas/escritorio/016-Carrito.jpg) | [ver](../mockup/capturas/movil/017-CarritoMovil.jpg) |
| Pago | `/pedido/pago` | `Pago.dc.html` | [ver](../mockup/capturas/escritorio/018-Pago.jpg) | [ver](../mockup/capturas/movil/019-PagoMovil.jpg) |

## Menú móvil

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Menú del sitio (móvil) | `(menú móvil abierto)` | `MenuSitio.dc.html` | — | [ver](../mockup/capturas/movil/020-MenuSitio.jpg) |

## Flujo de compra

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Entrega | `/pedido/entrega` | `Entrega.dc.html` | [ver](../mockup/capturas/escritorio/021-Entrega.jpg) | [ver](../mockup/capturas/movil/022-EntregaMovil.jpg) |
| Confirmación | `/pedido/confirmacion` | `Confirmacion.dc.html` | [ver](../mockup/capturas/escritorio/023-Confirmacion.jpg) | [ver](../mockup/capturas/movil/024-ConfirmacionMovil.jpg) |
| Pedido apartado, pago en efectivo | `/pedido/apartado` | `ConfirmacionEfectivo.dc.html` | [ver](../mockup/capturas/escritorio/025-ConfirmacionEfectivo.jpg) | [ver](../mockup/capturas/movil/026-ConfirmacionEfectivoMovil.jpg) |

## Producto

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Nota de pedido en PDF (tamaño carta) | `PDF generado por el backend` | `NotaPDF.dc.html` | [ver](../mockup/capturas/escritorio/027-NotaPDF.jpg) | — |
| Verificación de la nota (lo que abre el QR) | `/nota/:token` | `NotaVerificada.dc.html` | [ver](../mockup/capturas/escritorio/028-NotaVerificada.jpg) | [ver](../mockup/capturas/movil/029-NotaVerificadaMovil.jpg) |
| Pago rechazado | `/pedido/pago · estado` | `PagoError.dc.html` | [ver](../mockup/capturas/escritorio/030-PagoError.jpg) | [ver](../mockup/capturas/movil/031-PagoErrorMovil.jpg) |
| Ficha de producto | `/pasteles/:slug` | `Ficha.dc.html` | [ver](../mockup/capturas/escritorio/032-Ficha.jpg) | [ver](../mockup/capturas/movil/033-FichaMovil.jpg) |
| Vitrina | `/vitrina` | `Vitrina.dc.html` | [ver](../mockup/capturas/escritorio/034-Vitrina.jpg) | [ver](../mockup/capturas/movil/035-VitrinaMovil.jpg) |
| Rebanadas de hoy | `/rebanadas` | `Rebanadas.dc.html` | [ver](../mockup/capturas/escritorio/036-Rebanadas.jpg) | [ver](../mockup/capturas/movil/037-RebanadasMovil.jpg) |

## Cuenta

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Detalle de pedido | `/cuenta/pedidos/:id` | `DetallePedido.dc.html` | [ver](../mockup/capturas/escritorio/038-DetallePedido.jpg) | [ver](../mockup/capturas/movil/039-DetallePedidoMovil.jpg) |
| Recuperar contraseña | `/recuperar` | `Recuperar.dc.html` | [ver](../mockup/capturas/escritorio/040-Recuperar.jpg) | [ver](../mockup/capturas/movil/041-RecuperarMovil.jpg) |
| Verificar correo | `/verificar` | `Verificar.dc.html` | [ver](../mockup/capturas/escritorio/042-Verificar.jpg) | [ver](../mockup/capturas/movil/043-VerificarMovil.jpg) |

## Información y estados

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Bases en préstamo | `/bases` | `BasesInfo.dc.html` | [ver](../mockup/capturas/escritorio/044-BasesInfo.jpg) | [ver](../mockup/capturas/movil/045-BasesInfoMovil.jpg) |
| Página no encontrada | `(404)` | `NoEncontrado.dc.html` | [ver](../mockup/capturas/escritorio/046-NoEncontrado.jpg) | [ver](../mockup/capturas/movil/047-NoEncontradoMovil.jpg) |
| Carrito vacío | `/carrito · estado` | `CarritoVacio.dc.html` | [ver](../mockup/capturas/escritorio/048-CarritoVacio.jpg) | [ver](../mockup/capturas/movil/049-CarritoVacioMovil.jpg) |
| Mis pedidos vacío | `—` | `PedidosVacio.dc.html` | [ver](../mockup/capturas/escritorio/050-PedidosVacio.jpg) | [ver](../mockup/capturas/movil/051-PedidosVacioMovil.jpg) |
| Bases vacío | `—` | `BasesVacio.dc.html` | [ver](../mockup/capturas/escritorio/052-BasesVacio.jpg) | [ver](../mockup/capturas/movil/053-BasesVacioMovil.jpg) |

## Pedido personalizado

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Realizar pedido | `/pedido` | `PedidoElegir.dc.html` | [ver](../mockup/capturas/escritorio/054-PedidoElegir.jpg) | [ver](../mockup/capturas/movil/055-PedidoElegirMovil.jpg) |
| Diseña tu pastel, paso 1 tamaño y forma | `/pedido/disena (paso 1)` | `CotizadorPersonas.dc.html` | [ver](../mockup/capturas/escritorio/056-CotizadorPersonas.jpg) | [ver](../mockup/capturas/movil/057-CotizadorPersonasMovil.jpg) |
| Diseña tu pastel, menos del mínimo | `/pedido/disena (paso 1) · estado` | `CotizadorPersonasMinimo.dc.html` | [ver](../mockup/capturas/escritorio/058-CotizadorPersonasMinimo.jpg) | [ver](../mockup/capturas/movil/059-CotizadorPersonasMinimoMovil.jpg) |
| Diseña tu pastel, pastel de pisos | `/pedido/disena (paso 2) · estado` | `CotizadorPisos.dc.html` | [ver](../mockup/capturas/escritorio/060-CotizadorPisos.jpg) | [ver](../mockup/capturas/movil/061-CotizadorPisosMovil.jpg) |
| Diseña tu pastel, pastel rectangular | `/pedido/disena (paso 2) · estado` | `CotizadorRectangular.dc.html` | [ver](../mockup/capturas/escritorio/062-CotizadorRectangular.jpg) | [ver](../mockup/capturas/movil/063-CotizadorRectangularMovil.jpg) |
| Diseña tu pastel, paso 2 tipo de pastel | `/pedido/disena (paso 2)` | `Cotizador.dc.html` | [ver](../mockup/capturas/escritorio/064-Cotizador.jpg) | [ver](../mockup/capturas/movil/065-CotizadorMovil.jpg) |
| Diseña tu pastel, paso 3 pan | `/pedido/disena (paso 3)` | `CotizadorPan.dc.html` | [ver](../mockup/capturas/escritorio/066-CotizadorPan.jpg) | [ver](../mockup/capturas/movil/067-CotizadorPanMovil.jpg) |
| Diseña tu pastel, pan con pastel envinado | `/pedido/disena (paso 3) · estado` | `CotizadorPanEnvinado.dc.html` | [ver](../mockup/capturas/escritorio/068-CotizadorPanEnvinado.jpg) | [ver](../mockup/capturas/movil/069-CotizadorPanEnvinadoMovil.jpg) |
| Diseña tu pastel, Choco-pingüino | `/pedido/disena (paso 2) · estado` | `CotizadorPinguino.dc.html` | [ver](../mockup/capturas/escritorio/070-CotizadorPinguino.jpg) | [ver](../mockup/capturas/movil/071-CotizadorPinguinoMovil.jpg) |
| Diseña tu pastel, cambio a envinado | `/pedido/disena (paso 2) · estado` | `CotizadorConflicto.dc.html` | [ver](../mockup/capturas/escritorio/072-CotizadorConflicto.jpg) | [ver](../mockup/capturas/movil/073-CotizadorConflictoMovil.jpg) |
| Diseña tu pastel, relleno con base | `/pedido/disena (paso 4)` | `CotizadorRelleno.dc.html` | [ver](../mockup/capturas/escritorio/074-CotizadorRelleno.jpg) | [ver](../mockup/capturas/movil/075-CotizadorRellenoMovil.jpg) |
| Diseña tu pastel, relleno combinado | `/pedido/disena (paso 4) · estado` | `CotizadorRellenoNormal.dc.html` | [ver](../mockup/capturas/escritorio/076-CotizadorRellenoNormal.jpg) | [ver](../mockup/capturas/movil/077-CotizadorRellenoNormalMovil.jpg) |
| Diseña tu pastel, relleno en pastel seco | `/pedido/disena (paso 4) · estado` | `CotizadorRellenoSeco.dc.html` | [ver](../mockup/capturas/escritorio/078-CotizadorRellenoSeco.jpg) | [ver](../mockup/capturas/movil/079-CotizadorRellenoSecoMovil.jpg) |
| Diseña tu pastel, cobertura y color | `/pedido/disena (paso 5)` | `CotizadorCobertura.dc.html` | [ver](../mockup/capturas/escritorio/080-CotizadorCobertura.jpg) | [ver](../mockup/capturas/movil/081-CotizadorCoberturaMovil.jpg) |
| Diseña tu pastel, paso 6 decoración | `/pedido/disena (paso 6)` | `CotizadorDecoracion.dc.html` | [ver](../mockup/capturas/escritorio/082-CotizadorDecoracion.jpg) | [ver](../mockup/capturas/movil/083-CotizadorDecoracionMovil.jpg) |
| Diseña tu pastel, decoración por imagen | `/pedido/disena (paso 6) · estado` | `CotizadorDecoracionOblea.dc.html` | [ver](../mockup/capturas/escritorio/084-CotizadorDecoracionOblea.jpg) | [ver](../mockup/capturas/movil/085-CotizadorDecoracionObleaMovil.jpg) |
| Diseña tu pastel, paso 7 mensaje y oblea | `/pedido/disena (paso 7)` | `CotizadorDecoracionEditor.dc.html` | [ver](../mockup/capturas/escritorio/086-CotizadorDecoracionEditor.jpg) | [ver](../mockup/capturas/movil/087-CotizadorDecoracionEditorMovil.jpg) |
| Diseña tu pastel, revisión | `/pedido/disena (paso 8)` | `CotizadorRevision.dc.html` | [ver](../mockup/capturas/escritorio/088-CotizadorRevision.jpg) | [ver](../mockup/capturas/movil/089-CotizadorRevisionMovil.jpg) |
| Enviar referencia | `/pedido/referencia` | `Referencia.dc.html` | [ver](../mockup/capturas/escritorio/090-Referencia.jpg) | [ver](../mockup/capturas/movil/091-ReferenciaMovil.jpg) |
| Solicitud enviada | `/pedido/referencia/enviada` | `SolicitudEnviada.dc.html` | [ver](../mockup/capturas/escritorio/092-SolicitudEnviada.jpg) | [ver](../mockup/capturas/movil/093-SolicitudEnviadaMovil.jpg) |
| Cotización lista | `/cuenta/cotizaciones/:id` | `Cotizacion.dc.html` | [ver](../mockup/capturas/escritorio/094-Cotizacion.jpg) | [ver](../mockup/capturas/movil/095-CotizacionMovil.jpg) |

## Estados de carga, error y legales

| Vista | Ruta sugerida | Fuente | Escritorio | Móvil |
| --- | --- | --- | --- | --- |
| Diseña tu pastel cargando | `/pedido/disena (paso 2) · estado` | `CotizadorCargando.dc.html` | [ver](../mockup/capturas/escritorio/096-CotizadorCargando.jpg) | [ver](../mockup/capturas/movil/097-CotizadorCargandoMovil.jpg) |
| Pago procesando | `/pedido/pago · estado` | `PagoProcesando.dc.html` | [ver](../mockup/capturas/escritorio/098-PagoProcesando.jpg) | [ver](../mockup/capturas/movil/099-PagoProcesandoMovil.jpg) |
| Error al iniciar sesión | `/entrar · estado` | `LoginError.dc.html` | [ver](../mockup/capturas/escritorio/100-LoginError.jpg) | [ver](../mockup/capturas/movil/101-LoginErrorMovil.jpg) |
| Errores en el registro | `/registro · estado` | `RegistroError.dc.html` | [ver](../mockup/capturas/escritorio/102-RegistroError.jpg) | [ver](../mockup/capturas/movil/103-RegistroErrorMovil.jpg) |
| Error al subir referencia | `/pedido/referencia · estado` | `ReferenciaError.dc.html` | [ver](../mockup/capturas/escritorio/104-ReferenciaError.jpg) | [ver](../mockup/capturas/movil/105-ReferenciaErrorMovil.jpg) |
| Vitrina agotada | `/vitrina · estado` | `VitrinaAgotada.dc.html` | [ver](../mockup/capturas/escritorio/106-VitrinaAgotada.jpg) | [ver](../mockup/capturas/movil/107-VitrinaAgotadaMovil.jpg) |
| Aviso de privacidad y términos | `/legal` (`#privacidad`, `#terminos`) | `Legal.dc.html` | [ver](../mockup/capturas/escritorio/108-Legal.jpg) | [ver](../mockup/capturas/movil/109-LegalMovil.jpg) |
| Catálogo cargando | `/catalogo · estado` | `CatalogoCargando.dc.html` | [ver](../mockup/capturas/escritorio/110-CatalogoCargando.jpg) | [ver](../mockup/capturas/movil/111-CatalogoCargandoMovil.jpg) |
| Vitrina cargando | `/vitrina · estado` | `VitrinaCargando.dc.html` | [ver](../mockup/capturas/escritorio/112-VitrinaCargando.jpg) | [ver](../mockup/capturas/movil/113-VitrinaCargandoMovil.jpg) |
| Ficha cargando | `/pasteles/:slug · estado` | `FichaCargando.dc.html` | [ver](../mockup/capturas/escritorio/114-FichaCargando.jpg) | [ver](../mockup/capturas/movil/115-FichaCargandoMovil.jpg) |
| Mis pedidos cargando | `/cuenta · estado` | `CuentaCargando.dc.html` | [ver](../mockup/capturas/escritorio/116-CuentaCargando.jpg) | [ver](../mockup/capturas/movil/117-CuentaCargandoMovil.jpg) |
| Detalle del pedido cargando | `/cuenta/pedidos/:id · estado` | `DetallePedidoCargando.dc.html` | [ver](../mockup/capturas/escritorio/118-DetallePedidoCargando.jpg) | [ver](../mockup/capturas/movil/119-DetallePedidoCargandoMovil.jpg) |
