# Reglas de negocio — Pastelería Ilusión

Documento de referencia para programar el e-commerce (Django + DRF, React, react-three-fiber).
Todo lo que está aquí lo definió la pastelería, salvo lo marcado como **PROPUESTA** (diseñado por el equipo, falta que la pastelería lo valide) o **PENDIENTE** (dato que todavía no existe: no lo inventes, déjalo configurable).

Vocabulario obligatorio en la interfaz: se dice **"pan"**, nunca "bizcocho"; **"pedido"**, nunca "pastel personalizado"; **"base"**, nunca "base o stand". El flujo para armar el pastel se llama **"Diseña tu pastel"** (nunca "cotizador"); **"cotización"** solo se usa en el envío de referencia. El sitio pregunta **personas**, no kilos; los cálculos internos sí son por kilo.

---

## 1. Horarios, capacidad y anticipación

| Regla | Valor |
|---|---|
| Horario de la pastelería | Todos los días del año, 10:00 a 22:30 |
| Ventana para programar entregas | 10:30 a 22:00, en lapsos de 30 min |
| Capacidad por lapso | Máximo **3 pedidos activos** por lapso de 30 min (ej. 15:00–15:30) |
| Pedido | Mínimo **2 días** de anticipación |
| Pastel de vitrina, llevar hoy | Mismo día, si hay en vitrina |
| Pastel de vitrina, encargado tal cual | Para cualquier fecha; **para el mismo día, con 2 horas de anticipación** y sujeto a que haya pan |

- La disponibilidad de pan vive en la **base de datos de inventario** (`Inventory`): el sitio consulta ahí si se puede hacer un pastel para hoy. Solo los encargos de vitrina del mismo día consumen esa disponibilidad; un pedido de "Diseña tu pastel" con 2 días de anticipación se hornea aparte y no la descuenta (D30).
- Un lapso con 3 pedidos activos se muestra como "Lleno" y no se puede elegir.
- Primer horario disponible para un encargo de hoy: hora actual + 2 h, redondeado al siguiente lapso de 30 min.

```python
STORE_OPEN, STORE_CLOSE = "10:00", "22:30"
SLOT_FIRST, SLOT_LAST, SLOT_MINUTES = "10:30", "22:00", 30
MAX_ORDERS_PER_SLOT = 3
CUSTOM_LEAD_DAYS = 2            # pedidos
SAME_DAY_SHOWCASE_LEAD_HOURS = 2
```

---

## 2. Catálogo (productos con precio fijo)

Todos los pasteles de vitrina son **tres leches**, excepto el **Choco-pingüino**, que sale **seco**. El catálogo muestra cada pastel como sale a vitrina; **no se listan todas las combinaciones**: la ficha ofrece "Personalizar este pastel", que abre "Diseña tu pastel" con ese sabor ya elegido.

| Producto | Precio completo | Rebanada / mini / individual | Notas |
|---|---|---|---|
| Pastel de sabor normal (tres leches) | $350 | Rebanada $35 | Sabores normales de la sección 4.4 |
| Pastel con queso o con flan (tres leches) | $420 | Rebanada $40 | |
| Choco-pingüino (seco) | $350 | Rebanada $35 | Relleno: crema de chocolate sabor helado |
| Red velvet (seco) | $450 | — | **Solo por encargo**, nunca en vitrina. Por pedido: $280/kg |
| Pastel mini | $130 | — | Cualquier sabor normal; **no hay mini con queso ni con flan**. Rinde ~3 personas |
| Imposible (flan con pan de chocolate) | $350 | Rebanada $35 | |
| Posible (flan con pan de vainilla) | $350 | Rebanada $35 | |
| Flan napolitano | $360 grande | $35 individual | |
| Tarta de frutas | $290 grande | $35 mini | |
| Gelatina de molde | $290 | — | El diseño varía; siempre vale lo mismo |
| Gelatina Mosaico con crema (vaso) | $20 | — | **Solo en vitrina**, no se hace por pedido |
| Gelatina Mosaico con yogurt, fresa o durazno (vaso) | $20 | — | **Solo en vitrina** |
| Gelatina de Duvalín, 3 secciones (vaso) | $25 | — | **Solo en vitrina** |

- Un pastel de vitrina pesa ~2.7 kg (~19 personas).
- Las gelatinas en vaso aparecen en el catálogo con la etiqueta "Solo en vitrina"; no se pueden encargar.
- Fotos de producto: se resuelven en la etapa de frontend.
- **Pasteles de la casa (portada):** la pastelería elige en el admin qué productos salen, con "destacado en la portada" en la lista de productos (puede ser un pastel o un postre). Salen hasta 4 de los marcados, en el orden de la lista; si marca menos de 4, salen solo esos. Si no marca ninguno, salen los primeros 4 pasteles activos del catálogo, en el mismo orden. Al inicio no hay ninguno marcado: qué productos son "de la casa" lo decide la pastelería. Ver D45 en [`proyecto/decisiones.md`](proyecto/decisiones.md).
- **Encargo o vitrina de hoy en el carrito:** cada línea dice si es un encargo (desde "Pasteles de la casa", el catálogo o la ficha, sin tope de existencias) o de la vitrina de hoy (desde la vitrina o las rebanadas, sin pasar de lo que queda hoy). La misma presentación puede estar dos veces, una de cada tipo, y la línea conserva su tipo. Qué pasa cuando un pedido junta los dos (fecha, entrega, anticipación) lo decide la entrega, en la Etapa 4. Ver D47 en [`proyecto/decisiones.md`](proyecto/decisiones.md).
- **"Hoy" en la vitrina y las rebanadas** es la fecha de la Ciudad de México. Un producto lleva "En vitrina hoy" si alguna de sus presentaciones que no es rebanada tiene piezas hoy. Una presentación cargada hoy con 0 piezas sale "Agotada por hoy"; la que no se cargó hoy no sale en la vitrina ni en las rebanadas.

---

## 3. Tamaño y forma (paso 1 de "Diseña tu pastel")

### 3.1 Personas → kilos

- 1 kg rinde para **7 personas**.
- Redondeo: de .5 hacia arriba, de .4 hacia abajo (half-up).
- **Mínimo de un pedido: 4 kg (~28 personas).** Si piden menos, se avisa y se ofrecen alternativas: pastel de vitrina (~2.7 kg, puede ser hoy) o pastel mini (~3 personas).
- **Cota en línea (PROPUESTA): 350 personas (50 kg)**, lo máximo que ha hecho la pastelería. Más que eso → "escríbenos por WhatsApp".

```python
from decimal import Decimal, ROUND_HALF_UP
PEOPLE_PER_KG = 7
MIN_CUSTOM_KG = 4
MAX_ONLINE_KG = 50          # PROPUESTA (350 personas)

def kg_for_people(people: int) -> int:
    kg = int((Decimal(people) / PEOPLE_PER_KG).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return max(kg, MIN_CUSTOM_KG)
```

### 3.2 Forma

- Moldes: **Redondo** y **Rectangular**. Otras formas se sacan cortando el pan de esos moldes y se piden por **envío de referencia** (sección 9).
- Todos los pisos llevan la misma forma (no se mezclan).
- Un piso puede pesar más de 12 kg: **no hay límite de kilos por piso** y el redondo no obliga a tener pisos.
- La vista previa de "Diseña tu pastel" toma el tamaño del pastel de los moldes de la pastelería según los kilos. Los moldes son datos que la pastelería edita en el admin (D52).

### 3.3 Pisos

Máximo **5 pisos**, en redondo o rectangular. Los kilos por número de pisos son **mínimos**: con menos kilos, ese número de pisos no se puede elegir (corrección de la dueña del 7 de noviembre de 2026, D50). Con 4 kg el pastel va de 1 piso; desde 15 kg puede ir de 1 o 2; desde 18 kg, de 1 a 3; desde 25 kg, de 1 a 4; desde 30 kg, de 1 a 5. Los pisos que no se pueden elegir se muestran desactivados con su mínimo ("Desde 15 kg"); nunca desaparecen. Si el cliente baja las personas y los pisos elegidos ya no caben, bajan solos al máximo que permiten los kilos y se avisa ("Con 10 kg el pastel va de 1 piso.").

| Pisos | Kilos mínimos |
|---|---|
| 1 | Cualquier peso |
| 2 | Desde 15 kg |
| 3 | Desde 18 kg |
| 4 | Desde 25 kg |
| 5 | Desde 30 kg |

```python
MIN_KG_BY_TIERS = {1: 0, 2: 15, 3: 18, 4: 25, 5: 30}
MAX_TIERS = 5
def allowed_tiers(kg: int) -> list[int]:
    return [t for t, k in MIN_KG_BY_TIERS.items() if kg >= k]
```

---

## 4. Tipo de pastel, pan y relleno (pasos 2 a 4)

### 4.1 Orden

Primero el **tipo de pastel**, después el **pan**, después el **relleno**.

### 4.2 Tipo de pastel

`tres_leches`, `seco`, `envinado`. Sin restricciones entre ellos.

### 4.3 Pan

| Pan | Precio | Restricción |
|---|---|---|
| Vainilla | +$0/kg (sabor base) | — |
| Chocolate | +$5/kg | — |
| Choco-vainilla | +$5/kg | — |
| Choco-pingüino | **$250/kg, precio completo** (relleno incluido) | **No se combina con envinado.** Salta el paso de relleno |
| Red velvet | **$280/kg, precio completo** (relleno incluido) | **Solo en pastel seco.** Salta el paso de relleno |

- Choco-pingüino trae un relleno fijo de **crema de chocolate sabor helado**; Red velvet, su **relleno típico de red velvet**. No se cambian ni se les agrega sabor.
- Confirmado: el Choco-pingüino cuesta $250/kg tanto en tres leches como en seco.

### 4.4 Relleno: base y sabores

| Base | Sabores |
|---|---|
| Normal | Durazno, Fresa, Zarzamora, Cajeta, Galleta, Chocolate, Choco vainilla, Capuchino, Fresa con yogurt*, Nuez* |
| Con queso | Chocolate, Zarzamora |
| Con flan | Cajeta, Zarzamora |

- Las tres bases existen en los tres tipos de pastel.
- **Fresa con yogurt**: solo en tres leches y seco (no en envinado). **No se combina.**
- **Nuez**: en los tres tipos; sí se combina.
- **Relleno combinado**: solo con la base Normal, **máximo 2 sabores** (mitad y mitad), **+$5/kg**. Si uno de los dos es Nuez, se cobra el precio de Nuez + $5.

### 4.5 Precio por kilo del relleno

| Base / sabor | Tres leches | Seco | Envinado |
|---|---|---|---|
| Normal | $180 | $180 | $200 |
| Fresa con yogurt | $190 | $190 | No disponible |
| Nuez | $190 | $190 | $200 |
| Con queso | $250 | $250 | $250 |
| Con flan | $250 | $250 | $250 |

El precio propio de un sabor no puede ser menor que el precio general de su base para el mismo tipo de pastel (D39).

### 4.6 Fórmula del precio del pastel

```python
PAN_EXTRA_PER_KG = {"vainilla": 0, "chocolate": 5, "choco_vainilla": 5}
PAN_FULL_PRICE_PER_KG = {"choco_pinguino": 250, "red_velvet": 280}   # relleno incluido
FILLING_PER_KG = {
    "tres_leches": {"normal": 180, "con_queso": 250, "con_flan": 250},
    "seco":        {"normal": 180, "con_queso": 250, "con_flan": 250},
    "envinado":    {"normal": 200, "con_queso": 250, "con_flan": 250},
}
SPECIAL_FLAVOR_PER_KG = {   # sabores normales con precio propio
    "tres_leches": {"fresa_con_yogurt": 190, "nuez": 190},
    "seco":        {"fresa_con_yogurt": 190, "nuez": 190},
    "envinado":    {"nuez": 200},
}
COMBINED_FILLING_EXTRA_PER_KG = 5

def price_per_kg(cake_type, bread, base=None, flavors=()):
    if bread in PAN_FULL_PRICE_PER_KG:
        return PAN_FULL_PRICE_PER_KG[bread]
    price = FILLING_PER_KG[cake_type][base]
    if base == "normal":
        specials = [SPECIAL_FLAVOR_PER_KG[cake_type][f] for f in flavors if f in SPECIAL_FLAVOR_PER_KG[cake_type]]
        if specials:
            price = max(specials)
        if len(flavors) == 2:
            price += COMBINED_FILLING_EXTRA_PER_KG
    return price + PAN_EXTRA_PER_KG[bread]

def cake_price(kg, **choice):
    return kg * price_per_kg(**choice)
```

Ejemplo: 15 kg, tres leches, pan de chocolate, con queso y zarzamora → 15 × ($250 + $5) = **$3,825**.

En la interfaz, todos los precios del paso de pan se muestran **en la misma unidad** (precio por kilo): los panes que combinan con relleno como "Desde $X por kg" (precio general del relleno más barato disponible en el tipo elegido + incremento del pan; con los precios de hoy es el relleno Normal, D39) y Choco-pingüino / Red velvet como precio completo, en un grupo aparte "Con relleno incluido".

### 4.7 Validaciones y conflictos

| Situación | Comportamiento |
|---|---|
| Tipo = envinado | Choco-pingüino desactivado: "No se combina con pastel envinado". Fresa con yogurt desactivada: "No disponible en pastel envinado" (D32) |
| Tipo ≠ seco | Red velvet desactivado: "Solo en pastel seco" |
| Pan = Choco-pingüino o Red velvet | El paso de relleno queda "Incluido" (bloqueado) y se salta a cobertura |
| Cambiar el tipo invalida el pan elegido | Avisar antes de continuar; el botón dice qué pasará ("Continuar y elegir otro pan"); el pan queda marcado "Hay que cambiarlo" |
| Base ≠ Normal | No hay combinado |
| Fresa con yogurt elegida | No se puede agregar un segundo sabor |

Las opciones no disponibles **se muestran desactivadas con su motivo; nunca desaparecen**. Una opción que la pastelería retira en el admin no se lista (D39).

---

## 5. Cobertura (paso 5)

- Solo **crema pastelera**; lo que se elige es el **color**, y puede ser cualquier color. El cliente lo elige con un selector libre (tono, intensidad y claridad, o el código `#RRGGBB`). Elegir un color no cuesta extra (D57).
- Al entrar al paso, la cobertura arranca en el primer color activo de la lista de nombres de referencia (abajo). Si esa lista está vacía, nada queda elegido hasta que el cliente elija un color.
- Se recomienda **un solo color**. Para varios colores o diseños específicos → envío de referencia.

La pastelería edita la lista de nombres de referencia en el admin ("nombres de color de referencia"). La lista no limita lo que se elige: sirve para decir "parecido a <nombre>" en la revisión y en el carrito. Los nombres desactivados no se usan. La semilla trae estos:

| Nombre | Color de referencia |
|---|---|
| Amarillo | `#FAE496` |
| Blanco | `#FFFBFB` |
| Azul fuerte | `#4A70BA` |
| Azul claro | `#B0D0EC` |
| Verde | `#A6CE98` |
| Naranja | `#F6B06C` |
| Café | `#9C6E50` |
| Turquesa | `#6ECAC6` |
| Rojo | `#D44C48` |
| Rosa | `#F6B8CA` |
| Lila | `#CCBAE4` |

El nombre es el del color de la lista más cercano al elegido, medido en OKLab, y solo se da si la distancia es de 0.25 o menos (`MAX_NAME_DISTANCE` en `frontend/src/viewmodels/colors.ts`). Si ningún nombre está tan cerca, la revisión muestra solo la muestra y el código. Con la semilla, el negro no tiene nombre, y un gris claro desde alrededor de `#ABABAB` se nombra "parecido a blanco" (ver D57).

---

## 6. Decoración (paso 6) y mensaje y oblea (paso 7)

### 6.1 Decoración

Se elige **una sola** opción por pedido. La dueña confirmó los precios el 10 de noviembre de 2026 (D54): Rosas cuesta $120 fijos y los demás diseños, que son sencillos, van incluidos y no suman al total. Lo complejo se pide por "Otra decoración", con una imagen de referencia. "Patrón con duya" y "Chispas" son grupos: sus diseños (los cuatro de duya, los tres tipos de chispas) se despliegan solo al elegir el grupo y queda elegido el primero.

| Opción | Diseño | Precio |
|---|---|---|
| Sin decoración | Solo la cobertura | Incluido |
| Patrón con duya | Borde de conchas: la concha clásica de duya estrella en el borde de arriba y en el de abajo de cada piso | Incluido |
| Patrón con duya | Rosetones: rosetas en espiral alrededor del borde de arriba | Incluido |
| Patrón con duya | Festones colgantes: guirnaldas curvas que cuelgan del borde de arriba por el costado, con perlitas en las uniones | Incluido |
| Patrón con duya | Olanes: ondas o volantes de crema por el costado, con duya de pétalo | Incluido |
| Rosas | Rosas de crema hechas con duya con la técnica de modelado en clavo: cada rosa tiene su botón central, pétalos que se abren en capas y un par de hojitas verdes. Van en una fila en la orilla del borde de arriba de cada piso, dando la vuelta completa y tocándose sin encimarse (en los pisos de abajo, en el escalón que deja libre el piso de encima); el centro de la cara de arriba del último piso queda libre, porque ahí puede ir una oblea o un texto | $120 (precio fijo) |
| Chispas | Tres tipos, solo en los costados del pastel (nada en la cara de arriba): chispas de capuchino (granillo café), chispas de chocolate (chispas redondas, como las del relleno de Choco-pingüino) y chispas choco-vainilla (granillo blanco y de chocolate). Son las mismas de los rellenos que ya maneja la pastelería | Incluido |
| Otra decoración (el cliente sube una imagen) | La pastelería la cotiza | Por cotizar: **el pedido queda en pausa** hasta que la pastelería dé el precio; se avisa por correo y en la cuenta |

Si la pastelería deja una decoración de precio fijo sin precio en el admin (PENDIENTE), se muestra desactivada con "Precio por confirmar" y no se puede elegir (D39). Se activa sola cuando la pastelería captura el precio en el admin. La pastelería puede desactivar cualquier opción (por ejemplo, un tipo de chispas) o cambiar su cobro y su precio en el admin; puede haber varias opciones "Incluido".

**Color (patrón con duya y rosas).** El cliente elige entre dos modos:

- **Automático** (por defecto): la decoración toma el color de la cobertura y usa otros tonos del mismo color, uno más oscuro y otro más claro, para que contraste y quede en armonía (con cobertura lila, flores en lila profundo y lila claro).
- **Elegir un color:** cualquier color, con el mismo selector libre que la cobertura (sección 5). No cuesta extra.

Las hojas de las rosas siempre van en verde. Las chispas no llevan selector: su estilo y sus colores salen del relleno que copian (sabor o pan), que la pastelería edita en el admin. El color elegido se guarda con el diseño y llega al pedido. Los tonos automáticos son colores de la vista previa, no de la interfaz; su criterio está en D53.

**Otra decoración.** El cliente elige una imagen (JPG, PNG o WebP). El pedido no sigue sin ella. El tamaño máximo en el navegador es de 5 MB, el mismo que fija el servidor al inicio para las imágenes de clientes; es una propuesta que la pastelería debe confirmar (`docs/pendientes.md`). La imagen se guarda cuando exista el pedido (Etapa 4), no antes.

### 6.2 Mensaje

- Opcional, sin costo. La pastelería sugiere **máximo 4 palabras** (ej. "Feliz cumpleaños Ana"). La interfaz muestra un contador que sugiere ese máximo y **no bloquea**: con más palabras dice "Es más largo de lo que recomendamos; puedes dejarlo así.". El texto admite hasta 80 caracteres (límite técnico, `design_layout.py`).
- La letra es siempre cursiva a mano alzada (Dancing Script). Solo se usa para el texto sobre el pastel, nunca en la interfaz.
- **Color del texto:** con los mismos modos que la decoración (sección 6.1). "Automático" es negro y va por omisión; "Colores que combinan" son el tono más oscuro y el más claro de la cobertura; "Elegir un color" es cualquier color, con el selector libre de la sección 5. Si el contraste del texto con la cobertura baja de 2:1, la interfaz muestra un aviso informativo que no bloquea el pedido.
- El texto puede ir **recto o en arco**, con una curva ajustable. Se mueve, escala y gira sobre la tapa.

### 6.3 Oblea

- **$125** (precio en el admin, `CakeDesignSettings.wafer_price`). Mientras la pastelería no capture el precio (PENDIENTE), la oblea sale desactivada con "Precio por confirmar" y no se puede pedir. Se puede poner en cualquier pastel.
- **Forma:** hoja o círculo. La hoja se estira con ancho y alto independientes.
- **Tamaño máximo:** ninguna forma pasa de **hoja carta (21.6 × 27.9 cm), en cualquier orientación**: el lado mayor no pasa de 27.9 cm y el menor no pasa de 21.6 cm. El círculo tiene un diámetro máximo de 21.6 cm. Ninguna forma sale de la tapa del último piso, contando el giro.
- Se puede combinar con el mensaje.
- El cliente elige la **forma**, el **tamaño**, el **giro** y la **posición** de la oblea y del mensaje en un editor de vista superior; el pastel 3D refleja lo mismo. La imagen se encuadra con zoom y desplazamiento. Todo se puede hacer con el teclado y con botones de posición. Las posiciones son relativas al radio de la parte plana de la tapa, sin el canto redondeado del piso. Guardar en el pedido: forma, medidas, giro, posición de cada elemento y encuadre de la imagen, más la imagen original en alta resolución para imprimir.

---

### 6.4 Ocasión (opcional)

- Se pregunta en la revisión del pedido y en el envío de referencia: Cumpleaños, Boda, XV años, Bautizo, Primera comunión, Baby shower, Graduación, Aniversario u Otra.
- Es opcional y no cambia el precio: le sirve a la pastelería para preparar el pastel. La portada no tiene sección de eventos.

---

## 7. Base del pastel (no es un paso: se asigna sola)

- Aplica a pedidos de **4 kg o más**. Se cobra como **depósito**, aparte del pedido.
- Se devuelve el importe si el cliente regresa la base **hasta 15 días después de la entrega** (el plazo es `PolicySettings.stand_return_days`, configurable en el admin; hoy vale 15), presentando la **nota en PDF** del pedido (sustituye la nota actual de la pastelería).
- La base de 20–25 kg es de madera forrada en aluminio.

| Kilos | Depósito | Origen |
|---|---|---|
| 4 a 5 | $70 | Pastelería |
| 6 a 8 | $90 | Pastelería |
| 9 | $150 | Aprobada (usa la base de 10–12) |
| 10 a 12 | $150 | Pastelería |
| 13 a 14 | $200 | Aprobada (usa la base de 15) |
| 15 | $200 | Pastelería |
| 16 a 19 | $250 | Aprobada (usa la base de 20–25) |
| 20 a 25 | $250 | Pastelería |
| 26 a 50 | +$50 por cada 5 kg ($300, $350, $400, $450, $500) | Aprobada |

Criterio (aprobado por la pastelería el 31/10/2026): un pastel entre dos rangos usa **la siguiente base más grande** (nunca una más chica), así el depósito siempre equivale a una base real.

```python
def base_deposit(kg: int) -> int:
    if kg < 4: return 0
    for limit, price in ((5, 70), (8, 90), (12, 150), (15, 200), (25, 250)):
        if kg <= limit: return price
    return 250 + 50 * -(-(kg - 25) // 5)   # más de 25 kg, aprobado
```

PENDIENTE: qué pasa si la base regresa dañada.

---

## 8. Entrega

- **Recoger en la pastelería**: sin costo.
- **Entrega a domicilio**: para **cualquier peso**. **Gratis en pedidos de 15 kg o más.** Si pesan menos, el costo depende de la distancia (en auto, desde la pastelería).

**Tarifa por distancia (aprobada el 31/10/2026):** (7 + 9 × km) × 1.3, redondeado a decenas, mínimo $50. Base: UberX CDMX 2026 (~$9/km con tráfico) × 1.3 por hora pico y manejo.

| Distancia | Envío |
|---|---|
| Hasta 3 km | $50 |
| 3 a 6 km | $80 |
| 6 a 10 km | $130 |
| 10 a 15 km | $190 |
| Más de 15 km | Por WhatsApp |

```python
FREE_DELIVERY_FROM_KG = 15
DELIVERY_BANDS = ((3, 50), (6, 80), (10, 130), (15, 190))   # aprobada
def delivery_fee(total_kg: float, km: float):
    if total_kg >= FREE_DELIVERY_FROM_KG: return 0
    for limit, fee in DELIVERY_BANDS:
        if km <= limit: return fee
    return None   # fuera de cobertura: contactar por WhatsApp
```

- Distancia: calcularla con una API de rutas (p. ej. Google Distance Matrix) a partir de la dirección del cliente.
- PENDIENTE: ¿la pastelería tiene repartidor propio o usará una aplicación? (con repartidor propio cuenta el regreso y la tarifa debería subir).

---

## 9. Envío de referencia (pedido que la pastelería cotiza)

- Para formas, diseños o colores que "Diseña tu pastel" no cubre.
- Máximo **3 imágenes**.
- La pastelería responde con la cotización en **máximo 1 hora** (confirmado).
- El pedido sigue la misma anticipación de 2 días.
- PENDIENTE: vigencia de la cotización.

Estados: `in_review` (En revisión) → `quote_ready` (Cotización lista) → (cliente acepta y paga) → pedido normal. Las etiquetas están en la sección 12.

---

## 10. Pago

- Métodos: **Mercado Pago**, **tarjeta (Stripe)** y **efectivo en la pastelería**. Sandbox en desarrollo.
- Se paga un **anticipo** del pedido y el resto el día de la entrega. El porcentaje es `PolicySettings.advance_percent`, configurable en el admin entre 1 y 100; hoy vale **50%**. Aplica también a pasteles de vitrina encargados. Los ejemplos de esta sección usan 50%.
- El **depósito de la base y el envío no entran en el anticipo**: se pagan completos, aparte, el mismo día del anticipo.

```python
def payment_today(order_total, base_deposit, delivery_fee=0):
    advance = round(order_total * 0.5, 2)   # order_total sin base ni envío
    return {
        "advance": advance,                 # 50% del pedido
        "base_deposit": base_deposit,       # completo, aparte
        "delivery_fee": delivery_fee,       # completo, aparte
        "pay_today": advance + base_deposit + delivery_fee,
        "pay_on_delivery": order_total - advance,
    }
```

Ejemplo: pedido $1,000 + base $150 + envío $80 → hoy $730 (500 + 150 + 80); el día de la entrega $500.

- **Tarjeta / Mercado Pago**: se cobra solo `pay_today`.
- **Efectivo**: el pedido queda **apartado**; el cliente debe llevar `pay_today` a la pastelería **el mismo día** (antes de las 22:30). **Si no lo lleva, el pedido se cancela.**
- Los botones de pago muestran el monto exacto: "Pagar $X con tarjeta", "Pagar $X con Mercado Pago".
- PENDIENTE: política de cambios y cancelaciones.

---

## 11. Nota en PDF y su código QR

- Cada pedido genera una nota en PDF tamaño carta que sustituye la nota de papel; se descarga desde la confirmación y desde el detalle del pedido.
- El QR abre una página de verificación con un enlace firmado (token no adivinable): "Nota válida", número de pedido, fecha, cliente (nombre e inicial del apellido), entrega, estado de la base (prestada o devuelta, con su fecha límite) y depósito. No muestra teléfono, correo ni dirección.
- Si quien escanea es personal de la pastelería con sesión iniciada, ahí mismo puede registrar "Base devuelta", y el depósito queda marcado como reembolsado.

---

## 12. Estados del pedido

Los códigos son los identificadores del código (D29). Cada uno lleva su etiqueta en español para la interfaz:

| Código | Etiqueta | Cuándo |
|---|---|---|
| `awaiting_payment` | Apartado, falta tu pago | Solo efectivo, mientras falta el pago |
| `received` | Recibido | El pago está registrado (en línea por webhook verificado, o en efectivo por el personal) |
| `in_preparation` | En preparación | La pastelería prepara el pedido |
| `ready_for_delivery` | Listo para entregar | Listo para la entrega |
| `delivered` | Entregado | Entregado al cliente |
| `cancelled` | Cancelado | P. ej. efectivo no recibido el mismo día |
| `awaiting_quote` | En pausa por cotización | Decoración por imagen pendiente de precio |

La base tiene su propio seguimiento:

| Código | Etiqueta | Cuándo |
|---|---|---|
| `on_loan` | Prestada | Al entregar el pedido; fecha límite = entrega + 15 días |
| `returned` | Devuelta | El personal registra la devolución; el depósito queda reembolsado |

Las etiquetas salen del texto de estas reglas y del mockup.

---

## 13. Datos del negocio

| Dato | Valor |
|---|---|
| Nombre | Pastelería Ilusión |
| Lema | "Pide un deseo. Del pastel nos encargamos." |
| Horario | Todos los días, 10:00 a 22:30 |
| Dirección | PENDIENTE |
| WhatsApp | PENDIENTE |
| Aviso de privacidad y términos | PENDIENTE (el equipo prepara un texto base y la pastelería lo completa; el agente nunca los inventa) |

La dirección y el WhatsApp siguen PENDIENTE. La pastelería los captura en el admin, en "Datos del negocio (pie del sitio)" de "horarios y entregas". Mientras falten, el sitio muestra un marcador visible en su lugar y no un valor supuesto. El WhatsApp se escribe solo con dígitos, con la lada del país y sin "+" (en México, 52 y los 10 dígitos). Ver D41 en [`proyecto/decisiones.md`](proyecto/decisiones.md).

---

## 14. Lista de pendientes

1. Los precios de las decoraciones quedaron resueltos (D54, regla 6.1). Falta el tamaño máximo de la imagen de "Otra decoración" (propuesta: 5 MB).
2. ¿Repartidor propio o aplicación para los envíos?
3. Vigencia de una cotización por referencia (la respuesta es en máximo 1 hora; falta cuánto tiempo es válida).
4. Políticas de cambios y cancelaciones, y qué pasa si la base regresa dañada: el equipo prepara un texto base y la pastelería lo completa.
5. Dirección, WhatsApp, aviso de privacidad y términos: el equipo prepara el texto base de los avisos y la pastelería lo completa.
6. ¿A qué estado pasa un pedido `awaiting_quote` (decoración por imagen) cuando la pastelería da el precio? Las reglas no lo dicen. Pregunta para la pastelería; el equipo no supone la respuesta.
