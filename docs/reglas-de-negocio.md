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
- El pastel de vitrina y el pastel mini de "Diseña tu pastel" (sección 3.4) son pedidos de diseño: llevan los mismos **2 días** de anticipación que cualquier diseño. Lo decidió el usuario el 17 de noviembre de 2026 (tanda 2 de correcciones, D78).
- Un lapso con 3 pedidos activos se muestra como "Lleno" y no se puede elegir. Un pedido en pausa por cotización no ocupa lapso: el cupo se revisa cuando la pastelería le pone precio (lo decidió el usuario el 14 de noviembre de 2026, D63).
- Primer horario disponible para un encargo de hoy: hora actual + 2 h, redondeado al siguiente lapso de 30 min.
- Se reserva hasta **60 días** adelante (`PolicySettings.max_days_ahead`, propuesto; la pastelería puede ajustarlo). Un cliente tiene como mucho **2 pedidos sin pagar** a la vez (`max_unpaid_orders_per_customer`, propuesto). Lo decidió el usuario el 14 de noviembre de 2026 (D63).
- Topes por cliente de la ronda 2 de D63 (lo decidió el usuario el 14 de noviembre de 2026; valores propuestos que la pastelería ajusta en el admin): **1 pedido en pausa por cotización** a la vez (`max_quote_orders_per_customer`), aparte de los 2 sin pagar, y **10 piezas de la vitrina de hoy** apartadas sin pagar, sumando sus pedidos (`max_unpaid_showcase_pieces`).
- Pausa de la vitrina: las piezas de los pedidos del cliente que se cancelaron por vencidos siguen contando para ese tope durante **24 horas** (`PolicySettings.expired_showcase_cooldown_hours`, propuesto por el equipo; la pastelería lo ajusta). No cuentan los que canceló el personal. Lo decidió el usuario el 14 de noviembre de 2026 (D63). Con varias cuentas todavía se puede apartar la vitrina; el personal lo atiende cancelando desde el admin y desactivando las cuentas.
- El primer lapso que se puede elegir deja completo el plazo para pagar: empieza por lo menos `payment_window_minutes` (30) después de la hora del pedido. Con la vitrina de hoy, a las 15:29 el primero es el de las 16:00, no el de las 15:30. Lo decidió el usuario el 14 de noviembre de 2026 (D63, ronda 2).

```python
STORE_OPEN, STORE_CLOSE = "10:00", "22:30"
SLOT_FIRST, SLOT_LAST, SLOT_MINUTES = "10:30", "22:00", 30
MAX_ORDERS_PER_SLOT = 3
CUSTOM_LEAD_DAYS = 2            # pedidos
SAME_DAY_SHOWCASE_LEAD_HOURS = 2
```

---

## 2. Catálogo (productos con precio fijo)

Todos los pasteles de vitrina son **tres leches**, excepto el **Choco-pingüino**, que sale **seco**. El catálogo muestra cada pastel como sale a vitrina; **no se listan todas las combinaciones**: la ficha ofrece "Personalizar este pastel", que abre "Diseña tu pastel" con ese sabor ya elegido (con los límites de la sección 3.4 para un pastel de vitrina).

| Producto | Precio completo | Rebanada / mini / individual | Notas |
|---|---|---|---|
| Pastel de sabor normal (tres leches) | $350 | Rebanada $35 | Sabores normales de la sección 4.4, incluido Blueberry (D78) |
| Pastel con queso o con flan (tres leches) | $420 | Rebanada $40 | |
| Choco-pingüino (seco) | $350 | Rebanada $35 | Relleno: crema de chocolate sabor helado |
| Red velvet (seco) | $450 | — | **Solo por encargo**, nunca en vitrina. Por pedido: $280/kg |
| Tres leches de nuez | PENDIENTE (se muestra "[Precio por confirmar]") | — | **Solo por encargo**. No se puede pedir hasta que la pastelería capture el precio en el admin (D78) |
| Pastel mini | $130 | — | Cualquier sabor normal; **no hay mini con queso ni con flan**. Rinde ~3 personas. La tarjeta del catálogo lleva "Diseña tu pastel mini", que abre el diseñador con el mini elegido (sección 3.4) |
| Imposible (flan con pan de chocolate) | $350 | Rebanada $35 | |
| Posible (flan con pan de vainilla) | $350 | Rebanada $35 | |
| Flan napolitano | $360 grande | $35 individual | |
| Tarta de frutas | $290 grande | $35 mini | |
| Gelatina de molde | $290 | — | El diseño varía; siempre vale lo mismo |
| Gelatina Mosaico con crema (vaso) | $20 | — | **Solo en vitrina**, no se hace por pedido |
| Gelatina Mosaico con yogurt, fresa o durazno (vaso) | $20 | — | **Solo en vitrina** |
| Gelatina de Duvalín, 3 secciones (vaso) | $25 | — | **Solo en vitrina** |

- Un pastel de vitrina pesa ~2.7 kg (~19 personas).
- **Pan de cada pastel de vitrina** (lo dijo el usuario el 17 de noviembre de 2026, tanda 2 de correcciones, D78): vainilla en los de sabor normal, en Blueberry, Nuez, "con queso y zarzamora", "con flan y cajeta" y "con flan y zarzamora"; chocolate en "Tres leches de chocolate" y "Tres leches con queso y chocolate"; choco-vainilla en "Tres leches de choco vainilla"; el Choco-pingüino, el suyo. Se guarda en el producto (`Product.bread`). Con el pan registrado, un encargo de vitrina para hoy pide pan del día en el inventario (sección 1, D30).
- **Blueberry y nuez** (D78): "Tres leches de blueberry" se vende completo ($350), en rebanada ($35) y mini ($130), en la vitrina y por encargo. "Tres leches de nuez" es solo por encargo y su precio es PENDIENTE: un precio vacío en el admin (`CatalogPrice.amount`) se muestra como "[Precio por confirmar]" y esa presentación no se puede pedir. Una presentación de la vitrina o de las rebanadas con el precio vacío no se muestra.
- **"Personalizar este pastel"** en un pastel de vitrina vendido completo abre "Diseña tu pastel" como pastel de vitrina con su tipo, su pan y su relleno bloqueados (sección 3.4). Red velvet y nuez, que son solo por encargo, abren el pedido normal por kilos, prellenado y editable (D59).
- Las gelatinas en vaso aparecen en el catálogo con la etiqueta "Solo en vitrina"; no se pueden encargar.
- Fotos de producto: se resuelven en la etapa de frontend.
- **Pasteles de la casa (portada):** la pastelería elige en el admin qué productos salen, con "destacado en la portada" en la lista de productos (puede ser un pastel o un postre). Salen hasta 4 de los marcados, en el orden de la lista; si marca menos de 4, salen solo esos. Si no marca ninguno, salen los primeros 4 pasteles activos del catálogo, en el mismo orden. Al inicio no hay ninguno marcado: qué productos son "de la casa" lo decide la pastelería. Ver D45 en [`proyecto/decisiones.md`](proyecto/decisiones.md).
- **Encargo o vitrina de hoy en el carrito:** una rebanada nunca es un encargo (ver "Un pastel por sabor en la vitrina"). Cada línea dice si es un encargo (desde "Pasteles de la casa", el catálogo o la ficha, sin tope de existencias) o de la vitrina de hoy (desde la vitrina o las rebanadas, sin pasar de lo que queda hoy). La misma presentación puede estar dos veces, una de cada tipo, y la línea conserva su tipo. Un pedido tiene una sola fecha y un solo lapso, y sigue la anticipación de su línea más estricta (sección 1): con la vitrina de hoy y un encargo, hoy con 2 horas de anticipación y pan del día; la vitrina de hoy y un pedido de "Diseña tu pastel" no caben en el mismo pedido (se hacen dos). Ver D47 y D63 en [`proyecto/decisiones.md`](proyecto/decisiones.md).
- **"Hoy" en la vitrina y las rebanadas** es la fecha de la Ciudad de México. Un producto lleva "En vitrina hoy" si alguna de sus presentaciones que no es rebanada tiene piezas hoy. Una presentación cargada hoy con 0 piezas sale "Agotada por hoy"; la que no se cargó hoy no sale en la vitrina ni en las rebanadas.
- **Un pastel por sabor en la vitrina** (lo dijo la pastelería el 12 de noviembre de 2026, D60):
    - Nunca hay más de un pastel completo del mismo sabor. En la vitrina caben unos 8 pasteles, más el Posible y el Imposible, y unas 15 gelatinas de vaso entre sus sabores. Son cifras de referencia, no topes.
    - Casi siempre hay rebanadas de un solo pastel. Un pastel da unas 10 rebanadas (referencia, no tope).
    - **Las rebanadas solo se venden de la vitrina del día** (decisión del dueño, 13 de noviembre): no se encargan para una fecha. Quien quiera más encarga el pastel completo. La ficha ofrece "Rebanada" solo si ese día hay rebanadas cargadas del producto (en 0, desactivada con "Agotada por hoy"), y con "Rebanada" el encargo va desactivado con "Las rebanadas son solo de la vitrina".
    - **Rebanado** es el pastel que se está vendiendo en rebanadas. Se ve completo en la vitrina, con la palabra "Rebanado", pero no se compra completo: quien lo quiera completo lo encarga como pedido.
    - El rebanado no lleva un campo propio: es el producto que tiene rebanadas cargadas hoy. Como hay uno por sabor, no hay ambigüedad. Una rebanada cargada con 0 piezas quiere decir que el rebanado ya se acabó: en la vitrina sale como lo demás agotado ("Agotada por hoy", al final y sin acciones) y el catálogo ya no dice "Rebanado hoy".
    - El catálogo y la ficha dicen "Rebanado hoy" mientras le quedan rebanadas; con un mini del mismo sabor en la vitrina, llevan también "En vitrina hoy".
    - El admin lo valida en los productos que tienen presentación de rebanada (pasteles, Posible e Imposible; también si esa presentación está desactivada): el completo lleva como mucho 1 pieza por día, y un producto no tiene un completo en la vitrina y rebanadas el mismo día. Vale en el formulario y en la lista editable de "Vitrina de hoy".
    - **Dejar rebanarlo** (decisión de la dueña): si el completo de ese día ya se vendió (cargado en 0), se pueden cargar rebanadas de otro pastel del mismo sabor ese día. Al revés no: con rebanadas cargadas ese día, aunque estén en 0, el completo no vuelve (no se carga ni se sube de 0 a 1).
    - Si un dato saltara la validación y un producto trajera completo y rebanadas el mismo día, la vitrina muestra solo al rebanado.
    - Los minis quedan fuera: normalmente se sacan 2, y un mini puede ser del mismo sabor que un completo o que el rebanado (un pastel de cajeta y un mini de cajeta).
    - El mockup `Rebanadas.dc.html` dibuja rebanadas de siete sabores a la vez. Gana esta regla: la pantalla se arma para una sola, y también funciona con varias o con ninguna.

---

## 3. Tamaño y forma (paso 1 de "Diseña tu pastel")

"Diseña tu pastel" tiene tres tamaños: por kilos (desde 4 kg), pastel de vitrina y pastel mini. El paso 1 pregunta primero "¿Para cuántas personas?" y, según el número, muestra solo lo que rinde (sección 3.4). Lo decidió el usuario el 17 de noviembre de 2026 (tanda 2 de correcciones, D78).

### 3.1 Personas → kilos

- 1 kg rinde para **7 personas**.
- Redondeo: de .5 hacia arriba, de .4 hacia abajo (half-up).
- **Mínimo de un pedido por kilos: 4 kg (~28 personas).** Con menos personas, el paso 1 ofrece el pastel de vitrina o el mini, según cuál rinde (sección 3.4); ya no solo se avisa.
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

### 3.4 Pastel de vitrina y pastel mini

Lo decidió el usuario el 17 de noviembre de 2026 (tanda 2 de correcciones, D78). El pastel de vitrina y el mini son redondos, de 1 piso y sin base: no se eligen forma ni pisos.

| Tamaño | Molde | Peso | Personas |
|---|---|---|---|
| Por kilos | Redondo o rectangular, de 1 a 5 pisos (3.2 y 3.3) | Desde 4 kg | Desde ~28 |
| Pastel de vitrina | Redondo, 1 piso, 28 cm de diámetro × 6.7 cm de alto | 2.7 kg | ~19 |
| Pastel mini | Redondo, 1 piso, 14 cm de diámetro × 4.5 cm de alto | PENDIENTE | ~3 |

Las medidas del molde están en el admin ("Tamaños de vitrina y mini", `DesignSize`); el peso y las personas, en los precios de catálogo (`CatalogPrice`). El peso del mini queda PENDIENTE hasta que la pastelería lo capture.

**Qué muestra el paso 1 según las personas.** Los umbrales salen de las personas del admin, no del código:

| Personas | Se ofrece |
|---|---|
| Hasta 3 | Pastel mini |
| De 4 a 19 | Pastel de vitrina |
| De 20 a 27 | Pastel de vitrina o "Hacerlo de 4 kg" (28 personas) |
| Desde 28 | Por kilos, con forma y pisos, como antes (3.1 a 3.3) |

Si el tamaño chico que rinde para esas personas no está disponible (por ejemplo, la pastelería dejó su precio vacío), el paso 1 también ofrece "Hacerlo de 4 kg"; la tarjeta no disponible se ve desactivada con su motivo.

**Desde la ficha ("Personalizar este pastel").** El tipo, el pan y el relleno del producto quedan bloqueados: en la barra de pasos aparecen hechos y con candado, con un mensaje flotante, y el recorrido empieza en la cobertura. El precio es el del producto. Funciona en todo pastel de vitrina vendido completo. Red velvet y nuez, que son solo por encargo, abren el pedido normal por kilos, prellenado y editable (D59); se pueden pedir en tamaño de vitrina solo armándolos desde "Diseña tu pastel".

**Desde el catálogo.** La tarjeta del pastel mini lleva "Diseña tu pastel mini", que abre el diseñador con el mini elegido.

**Lo común a los tres.** La decoración y la oblea se cobran aparte en cualquier tamaño (sección 4.6), salvo lo que el mini no admite (secciones 4.7, 6.1 y 6.3). El mini y la vitrina llevan 2 días de anticipación y el anticipo de la sección 10, como cualquier diseño, y no llevan base ni depósito (sección 7). En la revisión, el carrito y los pedidos, el tamaño se dice "Pastel mini, ~3 personas" o "Pastel de vitrina, ~19 personas"; el admin y la nota en PDF dicen "Pastel de 4 kg, 30 personas" en los de por kilos.

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
| Normal | Durazno, Fresa, Zarzamora, Cajeta, Galleta, Chocolate, Choco vainilla, Capuchino, Blueberry, Fresa con yogurt*, Nuez* |
| Con queso | Chocolate, Zarzamora |
| Con flan | Cajeta, Zarzamora |

- Las tres bases existen en los tres tipos de pastel.
- **Fresa con yogurt**: solo en tres leches y seco (no en envinado). **No se combina.**
- **Nuez**: en los tres tipos; sí se combina.
- **Blueberry** (lo decidió el usuario el 17 de noviembre de 2026, tanda 2 de correcciones, D78): solo en la base Normal, en los tres tipos de pastel; sí se combina. Cuesta lo que la zarzamora, que es el precio general de la base Normal (sección 4.5). En la vista previa se dibuja como mermelada, con el color `#3E3A6E`, propuesto por el equipo y editable en el admin (sección 14).
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

**Pastel de vitrina y mini** (lo decidió el usuario el 17 de noviembre de 2026, tanda 2 de correcciones, D78). Cada tamaño se cobra con su propia estrategia; la decoración y la oblea se suman aparte en los tres.

- **Vitrina, desde la ficha:** el precio del producto.
- **Vitrina armada libre, que coincide con un pastel de vitrina:** si el tipo, el pan, la base y un sabor son los de un pastel de vitrina con precio, cuesta lo de ese pastel.
- **Vitrina armada libre, que no coincide:** el precio del grupo más la diferencia por kilo contra la referencia, por el peso de la vitrina. La referencia es el precio por kilo de tres leches con pan de vainilla y un sabor de esa base (sin precio propio).

| Grupo | Precio del grupo |
|---|---|
| Relleno Normal | $350 |
| Relleno con queso o con flan | $420 |
| Pan Choco-pingüino | $350 |
| Pan Red velvet | $450 |

```python
SHOWCASE_KG = 2.7   # peso de la vitrina, del admin

def showcase_price(group_price, price_per_kg, reference_per_kg):
    return group_price + max(0, price_per_kg - reference_per_kg) * SHOWCASE_KG
```

| Pastel de vitrina armado | Cálculo | Precio |
|---|---|---|
| Tres leches, durazno, pan de chocolate | $350 + ($185 − $180) × 2.7 | $363.50 |
| Envinado, durazno, pan de vainilla | $350 + ($200 − $180) × 2.7 | $404 |
| Tres leches, nuez y fresa combinados, pan de vainilla | $350 + ($195 − $180) × 2.7 | $390.50 |
| Tres leches, nuez sola, pan de vainilla | $350 + ($190 − $180) × 2.7 | $377 |
| Tres leches con queso y zarzamora, pan de vainilla | $420 + ($250 − $250) × 2.7 | $420 |
| Red velvet | Precio del grupo | $450 |
| Tres leches de chocolate, pan de chocolate | Coincide con el pastel de la vitrina | $350 |
| Con queso y chocolate, pan de chocolate | Coincide con el pastel de la vitrina | $420 |

- **Mini:** siempre **$130** (el precio de "Pastel mini"), sin recargos por tipo, pan ni combinado.

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
| Tamaño = pastel mini (D78) | Tipo y pan libres, salvo Choco-pingüino y Red velvet (desactivados: ya traen su relleno). Solo la base Normal: con queso y con flan desactivadas. El combinado sí se permite. Sin oblea. El mensaje lleva todo su editor |
| Tamaño = pastel de vitrina (D78) | Un pan de relleno incluido o una base sin precio de vitrina en el admin no se ofrece; con ese precio vacío sale "Precio por confirmar" |
| Cambiar de tamaño con algo ya elegido que el nuevo tamaño no admite | Avisar antes de continuar; lo que no se admite queda marcado para cambiarlo y lo demás se conserva |

Las opciones no disponibles **se muestran desactivadas con su motivo; nunca desaparecen**. Una opción que la pastelería retira en el admin no se lista (D39). Las filas de la tanda 2 (pastel mini y de vitrina) las decidió el usuario el 17 de noviembre de 2026 (D78).

---

## 5. Cobertura (paso 5)

- Solo **crema pastelera**; lo que se elige es el **color**, y puede ser cualquier color. El cliente lo elige con un selector libre (tono, intensidad y claridad). Elegir un color no cuesta extra (D57).
- **El código del color no se muestra** (lo decidió el usuario el 16 de noviembre de 2026, tanda 1 de correcciones, D77): ni el cliente lo escribe ni la pastelería lo recibe. El cliente, la revisión, el carrito y el admin ven el círculo del color y su "parecido a" cuando hay un nombre parecido. El color se sigue guardando como `#rrggbb` y la API no cambia.
- Al entrar al paso, la cobertura arranca en el primer color activo de la lista de nombres de referencia (abajo). Si esa lista está vacía, nada queda elegido hasta que el cliente elija un color.
- Se recomienda **un solo color**. Para varios colores o diseños específicos → envío de referencia.
- **Peinado lateral** (lo pidió el usuario el 18 de noviembre de 2026, tanda 4, D84): surcos horizontales y parejos en los costados de la cobertura, en todos los pisos y en las dos formas. Va **por omisión** y el cliente lo puede quitar en el paso 5 ("Peinado lateral", una casilla). No cuesta extra. Se guarda con el pedido (`CakeDesign.side_comb`) y lo ven la revisión, "Tu pastel", el carrito, el admin y la nota en PDF. Los pedidos de antes quedaron con peinado.

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

**En el pastel mini** (lo decidió el usuario el 17 de noviembre de 2026, tanda 2 de correcciones, D78) solo van: sin decoración, borde de conchas, festones colgantes, las tres chispas y rosas. Rosetones, olanes y "Otra decoración" no van en el mini y salen desactivados con su motivo. Las rosas del mini tienen precio propio, que es PENDIENTE: el campo `DecorationOption.mini_price` queda vacío y las rosas salen desactivadas con "Precio por confirmar" hasta que la pastelería lo capture; con el precio capturado, se muestran como "+$X" con lo que cobra el mini. En el pastel de vitrina van todas las decoraciones.

**Color (patrón con duya y rosas).** El cliente elige entre dos modos:

- **Automático** (por defecto): la decoración toma el color de la cobertura y usa otros tonos del mismo color, uno más oscuro y otro más claro, para que contraste y quede en armonía (con cobertura lila, flores en lila profundo y lila claro).
- **Elegir un color:** cualquier color, con el mismo selector libre que la cobertura (sección 5). No cuesta extra.

Las hojas de las rosas siempre van en verde. Las chispas no llevan selector: su estilo y sus colores salen del relleno que copian (sabor o pan), que la pastelería edita en el admin. El color elegido se guarda con el diseño y llega al pedido. Los tonos automáticos son colores de la vista previa, no de la interfaz; su criterio está en D53.

**Otra decoración.** El cliente elige una imagen (JPG, PNG o WebP). El pedido no sigue sin ella. Un pedido lleva una sola decoración por cotizar. La pastelería pone el precio en el registro del pedido en el admin y el pedido pasa a "Apartado, falta tu pago". Se paga hasta el cierre del día y nunca después del inicio de su lapso, porque el sitio todavía no le avisa al cliente y la pastelería le escribe por WhatsApp. Mientras espera su precio, el pedido no ocupa lapso: al ponerle precio se revisa el cupo, y si ya no hay lugar, la pastelería acuerda otro horario por WhatsApp. Una cotización con precio no revisa el tope de 2 pedidos sin pagar. Lo decidió el usuario el 14 de noviembre de 2026 (D63, ronda 2). El tamaño máximo en el navegador es de 5 MB, el mismo que fija el servidor al inicio para las imágenes de clientes; es una propuesta que la pastelería debe confirmar (`docs/pendientes.md`). La imagen se guarda cuando exista el pedido (Etapa 4), no antes.

### 6.2 Mensaje

- Opcional, sin costo. La pastelería sugiere **máximo 4 palabras** (ej. "Feliz cumpleaños Ana"). La interfaz muestra un contador que sugiere ese máximo y **no bloquea**: con más palabras dice "Es más largo de lo que recomendamos; puedes dejarlo así.". El texto admite hasta 80 caracteres (límite técnico, `design_layout.py`).
- La letra es siempre cursiva a mano alzada (Dancing Script). Solo se usa para el texto sobre el pastel, nunca en la interfaz.
- **Letra mínima** (lo decidió el usuario el 17 de noviembre de 2026, tanda 2 de correcciones, D78): la letra del mensaje mide al menos **1.5 cm** de alto, en los tres tamaños (`CakeDesignSettings.message_min_letter_cm`, editable en el admin). Se mide con el radio real de la parte plana de la tapa de ese pastel. Si con ese alto el mensaje no cabe, el cliente tiene que acortarlo.
- **Color del texto:** con los mismos modos que la decoración (sección 6.1). "Automático" es negro y va por omisión; "Colores que combinan" son el tono más oscuro y el más claro de la cobertura; "Elegir un color" es cualquier color, con el selector libre de la sección 5. Si el contraste del texto con la cobertura baja de 2:1, la interfaz muestra un aviso informativo que no bloquea el pedido.
- El texto puede ir **recto o en arco**, con una curva ajustable. Se mueve, escala y gira sobre la tapa.
- **Renglones** (lo decidió el usuario el 18 de noviembre de 2026, D83): el mensaje puede llevar hasta **3 renglones**, con Enter. Van centrados. En arco, cada renglón sigue su propio arco paralelo a los demás. No se admiten renglones vacíos entre otros, y el salto de línea cuenta como 1 de los 80 caracteres. El bloque de renglones tiene que caber en la altura de la tapa; si no cabe, el cliente acorta el mensaje o achica la letra. La letra mínima de 1.5 cm aplica a cada renglón. Los saltos de línea no cuentan como palabras.

### 6.3 Oblea

- **$125** (precio en el admin, `CakeDesignSettings.wafer_price`). Mientras la pastelería no capture el precio (PENDIENTE), la oblea sale desactivada con "Precio por confirmar" y no se puede pedir. Se puede poner en cualquier pastel, salvo el mini, que no lleva oblea (D78).
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

- Aplica a pedidos de **4 kg o más**. Se cobra como **depósito**, aparte del pedido. El pastel de vitrina y el mini pesan menos de 4 kg: no llevan base ni depósito (D78).
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

PENDIENTE: qué pasa si la base regresa dañada. Vive en `PolicySettings.damaged_stand_policy`; vacío, la página "Bases en préstamo" (`/bases`) muestra el marcador de pendiente.

La página `/bases` muestra las bases físicas de la pastelería (origen "Pastelería", activas), con su depósito, de menos a más kilos, y un último renglón con lo que se cobra arriba de la más grande hasta el máximo en línea ("Más de 25 kg (hasta 50 kg)", "Depósito de $300 a $500"): esas filas "Aprobada" no son una base física, pero se cobran, y la página no las calla. No muestra los rangos "Aprobada" intermedios, que cubre la siguiente base de la pastelería. "Pedidos que llevan base: desde [n] kg" es el mismo umbral con que se cobra el depósito: el "desde" más chico de la tabla de bases, activas o no, de cualquier origen; sin ninguna base activa, la página no lo dice (D75).

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
- **Por ahora, en línea solo se recoge en la pastelería.** La entrega a domicilio se ve en la pantalla de entrega, desactivada, con "Por ahora la coordinamos por WhatsApp" y el enlace de WhatsApp de la pastelería; la dirección y el costo por distancia llegan con la API de rutas (solo si sobra tiempo, D61). Lo decidió el usuario el 14 de noviembre de 2026 (D66).
- **Quién recoge:** el pedido guarda el nombre y el teléfono (10 dígitos) de quien lo recoge; la pantalla los llena con los de la cuenta y se pueden cambiar. Lo decidió el usuario el 14 de noviembre de 2026 (D66).
- PENDIENTE: cuánto tiempo se conservan el nombre y el teléfono de quien recoge, que pueden ser de otra persona (no de la cuenta). Lo define la pastelería con su aviso de privacidad; mientras tanto se guardan con el pedido.

---

## 9. Envío de referencia (pedido que la pastelería cotiza)

- Para formas, diseños o colores que "Diseña tu pastel" no cubre.
- Máximo **3 imágenes**.
- La pastelería responde con la cotización en **máximo 1 hora** (confirmado).
- El pedido sigue la misma anticipación de 2 días.
- PENDIENTE: vigencia de la cotización (`PolicySettings.reference_quote_valid_hours`, vacío: mientras no tenga valor, no vence; la pantalla muestra el marcador).
- El cliente manda las fotos, qué quiere tomar de ellas, la ocasión (opcional), las personas, el sabor, la fecha del evento y un presupuesto opcional. No se cobra nada al enviar.
- **Personas y sabor** (lo decidió el usuario el 15 de noviembre de 2026, D70): la pastelería cotiza con base en eso. El sabor es el tipo de pastel, el pan y el relleno, con las mismas opciones y validaciones de la sección 4 (4.7). La **base se asigna sola** con las personas, con los kilos de 3.1 y la tabla de la sección 7, como en "Diseña tu pastel"; con más personas de las que se piden en línea, "escríbenos por WhatsApp". La cotización muestra el depósito de la base aparte del precio, y al aceptar se paga completo con el anticipo (sección 10). La base se presta al entregar el pedido, como cualquier otra.
- Quien cotiza (el personal con el permiso de cotizar) ve las fotos de la solicitud en el admin; las de "Otra decoración" y de la oblea, no (D70). Tiene como mucho 1 solicitud en revisión a la vez (el mismo tope que un pedido en pausa por cotización, propuesto por el equipo). Lo decidió el usuario el 15 de noviembre de 2026 (D70).
- La pastelería pone el precio y su nota en el admin, con permiso (D64). El cliente recibe un correo y la ve en su cuenta.
- "Aceptar y pagar": el cliente elige la hora del día del evento y quién recoge; en ese momento se revisa la agenda y nace un pedido normal "Apartado, falta tu pago" con el precio cotizado, que se paga con el anticipo de siempre. "Pedir un cambio" y "Escribir por WhatsApp" van a WhatsApp. Lo decidió el usuario el 15 de noviembre de 2026 (D70).

Estados: `in_review` (En revisión) → `quote_ready` (Cotización lista) → (cliente acepta y paga) → pedido normal. Las etiquetas están en la sección 12. Además, `accepted` (Aceptada: ya es el pedido) y `cancelled` (Cancelada, sin cobro, por el cliente) cierran la solicitud (D70).

---

## 10. Pago

- Métodos: **Mercado Pago**, **tarjeta (Stripe)** y **efectivo en la pastelería**. Sandbox en desarrollo.
- Se paga un **anticipo** del pedido y el resto el día de la entrega. El porcentaje es `PolicySettings.advance_percent`, configurable en el admin entre 1 y 100; hoy vale **50%**. Aplica también a pasteles de vitrina encargados y a los pasteles de vitrina y mini de "Diseña tu pastel", que son diseños y no la vitrina de hoy (lo decidió el usuario el 17 de noviembre de 2026, D78). Los ejemplos de esta sección usan 50%.
- **Lo de la vitrina de hoy se paga completo** (anticipo del 100%); el anticipo de `PolicySettings.advance_percent` es para los encargos y los diseños. Lo decidió el usuario el 14 de noviembre de 2026 (D63).
- **Lo que dice el carrito y la entrega sobre el pago de hoy** (lo decidió el usuario el 16 de noviembre de 2026, tanda 1 de correcciones, D77). Lo decide el tipo de cada línea (encargo o vitrina de hoy), no la pantalla:
    - Solo vitrina o rebanadas: "Hoy pagas todo: lo de la vitrina de hoy se paga completo." Sin anticipo.
    - Solo encargos (diseños, encargos del catálogo y referencias): "Hoy pagas un anticipo del pedido; el resto, al entregar.", con "y el depósito de la base" si lleva base.
    - Los dos: "Hoy pagas el anticipo de los encargos y lo de la vitrina completo.", con "el depósito de la base" si lleva base.
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
- **Pedido sin pagar:** vence a los **30 minutos** (`PolicySettings.payment_window_minutes`, propuesto) y nunca después del inicio de su lapso; vencido, se cancela. Lo decidió el usuario el 14 de noviembre de 2026 (D63).
- **Cancelar:** el comando `cancel_expired_orders` cancela los pedidos vencidos y devuelve lo que apartaron (las piezas de la vitrina y el pan del día); las imágenes de sus diseños se borran. El personal también puede cancelar desde el admin, pero solo antes del pago (`awaiting_payment` o `awaiting_quote`), con el mismo reintegro. Un pedido pagado no se cancela ahí mientras no exista el reembolso. Lo decidió el usuario el 14 de noviembre de 2026 (D63, ronda 2).
- **Cobrar un apartado vencido:** si su lapso ya se llenó con otro pedido, no se puede registrar el cobro (D63, ronda 2).
- **Al hacer un pedido** se cancelan antes, con su reintegro, los apartados vencidos del mismo cliente: sus piezas vuelven a la vitrina antes de que aparte otras (revisión de la ronda 2 de D63). Esas piezas siguen contando para su tope de vitrina durante la pausa de la sección 1.
- **Efectivo**: el pedido queda **apartado**; el cliente debe llevar `pay_today` a la pastelería **el mismo día** (antes de las 22:30). **Si no lo lleva, el pedido se cancela.** Al elegir efectivo, el plazo se extiende al cierre del día, sin pasar del inicio del lapso (tanda 2).
- Los botones de pago muestran el monto exacto: "Pagar $X con tarjeta", "Pagar $X con Mercado Pago".
- **Registrar el efectivo:** lo hace el personal con el permiso de cobro en efectivo, cambiando el estado del pedido a "Recibido" en el admin (D64, D68).
- **Pago que llega tarde:** un pago en línea aprobado para un pedido ya cancelado, ya pagado o sin lugar en su horario, o con otro monto o moneda, no revive el pedido. Queda marcado para reembolso y el personal lo devuelve desde el panel de la pasarela (D68). Un apartado vencido que todavía no se cancela sí se recibe si su lapso tiene lugar, como el efectivo.
- **Cancelación por el cliente** (lo decidió el usuario el 15 de noviembre de 2026, D70): desde su cuenta, **en cualquier momento antes de la entrega** (también "En preparación" y "Listo para entregar"); un pedido entregado o cancelado ya no. Sin pagar (`awaiting_payment`, `awaiting_quote` o una solicitud de referencia) no cuesta nada y se reintegra lo apartado. Pagado, la pastelería **retiene el 50% del monto total del pedido** (sin el depósito de la base; `PolicySettings.customer_cancel_retention_percent`) y devuelve lo pagado menos lo retenido, nunca menos de 0. En un pedido normal, con el anticipo del 50%, se devuelve el depósito de la base; en la vitrina, pagada al 100%, la mitad. La devolución la hace el personal a mano (pago `refund_required`, motivo `customer_cancelled`).

```python
def customer_cancellation(paid, order_total, retention_percent=50):
    retained = min(round(order_total * retention_percent / 100, 2), paid)  # order_total sin base
    return {"retained": retained, "refund": max(paid - retained, 0)}
```

Ejemplo: pedido $1,000 + base $150, pagado hoy $650 → se retienen $500 y se devuelven $150.

- **Hasta cuándo** (lo decidió el usuario el 15 de noviembre de 2026, D70): hasta antes de la entrega, sin corte de horas. Si el pago ya se procesó, se retiene el 50% del pedido (arriba). Reemplaza la propuesta del equipo de no cancelar desde "En preparación".
- PENDIENTE: política de cambios, y el texto de la política de cancelaciones para el cliente.

---

## 11. Nota en PDF y su código QR

- Cada pedido genera una nota en PDF tamaño carta que sustituye la nota de papel; se descarga desde la confirmación y desde el detalle del pedido, y también va adjunta en el correo "Recibimos tu pago" (D82).
- El QR abre una página de verificación con un enlace firmado (token no adivinable): "Nota válida", número de pedido, fecha, cliente (nombre e inicial del apellido), entrega, estado de la base (prestada o devuelta, con su fecha límite) y depósito. No muestra teléfono, correo ni dirección.
- Si quien escanea es personal de la pastelería con sesión iniciada, ahí mismo puede registrar "Base devuelta", y el depósito queda marcado como reembolsado. En este proyecto, la devolución se registra desde el admin (D64); la página de verificación no lleva el botón.
- El texto de la nota siempre cabe en sus cajas: se parte en renglones y las cajas crecen con ellos (D85).

---

## 12. Estados del pedido

Los códigos son los identificadores del código (D29). Cada uno lleva su etiqueta en español para la interfaz:

| Código | Etiqueta | Cuándo |
|---|---|---|
| `awaiting_payment` | Apartado, falta tu pago | Mientras falta el pago: el pedido nace así (efectivo o en línea, D63); vence a los 30 minutos o al empezar su lapso, y con efectivo, al cierre del día |
| `received` | Recibido | El pago está registrado (en línea por webhook verificado, o en efectivo por el personal) |
| `in_preparation` | En preparación | La pastelería prepara el pedido |
| `ready_for_delivery` | Listo para entregar | Listo para la entrega |
| `delivered` | Entregado | Entregado al cliente |
| `cancelled` | Cancelado | Venció sin pagarse (o, si la pastelería fija cuánto espera una cotización, sin precio), o el personal lo canceló antes del pago (D63, ronda 2) |
| `awaiting_quote` | En pausa por cotización | Decoración por imagen pendiente de precio. No ocupa lapso. Cuando la pastelería pone el precio en el admin, pasa a `awaiting_payment` y se paga hasta el cierre del día, sin pasar del inicio del lapso (D63, ronda 2) |

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
| Dirección | En el admin (la dio la pastelería el 15 de noviembre de 2026) |
| WhatsApp | En el admin (lo dio la pastelería el 15 de noviembre de 2026) |
| Aviso de privacidad y términos | PENDIENTE (el equipo prepara un texto base y la pastelería lo completa; el agente nunca los inventa) |

La pastelería dio la dirección y el WhatsApp el 15 de noviembre de 2026. Viven en el admin, en "Datos del negocio (pie del sitio)" de "horarios y entregas", no en el código: el sitio, la nota y los correos los leen de ahí, y la pastelería los cambia sin un despliegue. Si alguno se vacía, vuelve el marcador visible en su lugar, nunca un valor supuesto. Con la dirección, el sitio y los correos llevan "Cómo llegar", que abre Google Maps con la dirección (D71). El WhatsApp se escribe solo con dígitos, con la lada del país y sin "+" (en México, 52 y los 10 dígitos). Ver D41 en [`proyecto/decisiones.md`](proyecto/decisiones.md).

---

## 14. Lista de pendientes

1. Los precios de las decoraciones quedaron resueltos (D54, regla 6.1). Falta el tamaño máximo de la imagen de "Otra decoración" (propuesta: 5 MB).
2. ¿Repartidor propio o aplicación para los envíos?
3. Vigencia de una cotización por referencia (la respuesta es en máximo 1 hora; falta cuánto tiempo es válida): `PolicySettings.reference_quote_valid_hours`, vacío; mientras no tenga valor, no vence (D70).
4. Políticas de cambios y qué pasa si la base regresa dañada: el equipo prepara un texto base y la pastelería lo completa. La cancelación por el cliente ya tiene su mecanismo (sección 10, D70): el usuario decidió el 50% retenido y que se cancele en cualquier momento antes de la entrega, sin corte de horas.
5. Dirección y WhatsApp: resueltos el 15 de noviembre de 2026 (los dio la pastelería y viven en el admin, sección 13). Siguen el aviso de privacidad y los términos: el equipo prepara el texto base y la pastelería lo completa.
6. Resuelto el 14 de noviembre de 2026 (lo decidió el usuario, D63 ronda 2): con el precio, un pedido `awaiting_quote` pasa a `awaiting_payment`. Sigue PENDIENTE cuánto espera un pedido sin precio antes de cancelarse (`PolicySettings.quote_expiry_hours`, vacío: mientras no tenga valor, no vence).
7. Peso del pastel mini (D78, sección 3.4): vacío en el precio de catálogo "Pastel mini" hasta que la pastelería lo capture en el admin.
8. Precio de las rosas en el pastel mini (D78, sección 6.1): `DecorationOption.mini_price`, vacío. En los demás pasteles cuestan $120.
9. Precio de "Tres leches de nuez" (D78, sección 2): `CatalogPrice.amount` vacío; mientras tanto no se puede pedir.
10. Color de Blueberry en la vista previa (D78, sección 4.4): `#3E3A6E` es una propuesta del equipo que la pastelería confirma o cambia en el admin.

---

## 15. Cuenta del cliente: datos, avisos y contraseña

Lo decidió el usuario el 15 de noviembre de 2026 (D72). Vive en `/cuenta/datos` ("Datos y avisos").

| Dato | Regla |
|---|---|
| Nombre completo | Obligatorio al guardar, hasta 150 caracteres, con las mismas reglas que el registro (sin caracteres de control ni de formato; los espacios se juntan) |
| Teléfono o WhatsApp | Opcional; si se escribe, exactamente 10 dígitos (los espacios, guiones, puntos y paréntesis se quitan) |
| Correo | No se cambia. Debajo dice "Vinculado a tu cuenta de Google." si la cuenta entró con Google, o "Es el correo con el que entras." |

**Avisos del pedido.** El correo siempre se envía: su casilla va marcada y no se puede quitar. WhatsApp es una preferencia de la cuenta (`User.notify_whatsapp`, apagada al inicio): el sitio no manda mensajes de WhatsApp; la preferencia le dice a la pastelería que puede escribirle a mano. El admin la muestra en el usuario y en el pedido, junto al teléfono del cliente, sin poder cambiarla. Marcar WhatsApp sin teléfono, o quitar el teléfono con WhatsApp marcado, es un error: "Para avisarte por WhatsApp, escribe tu teléfono en tus datos personales." La base de datos también lo rechaza.

**Cerrar sesión vacía el carrito** (lo decidió el usuario el 16 de noviembre de 2026, tanda 1 de correcciones, D77). El carrito funciona sin sesión, como siempre; al pulsar "Cerrar sesión", aquí o en otra pestaña, se vacía, con las imágenes de los diseños guardadas en el navegador, y el contador del encabezado queda en vacío. Una sesión que vence sola no lo vacía.

**Cambiar la contraseña.** Solo en una cuenta con contraseña; una cuenta que solo entra con Google no ve el formulario. Pide la contraseña actual y la nueva; la nueva sigue las reglas del registro (mínimo 8 caracteres, que no sea común, que no sea solo números y que no se parezca al correo ni al nombre). Una contraseña actual equivocada responde "Tu contraseña actual no coincide.", lo mismo que una cuenta sin contraseña, para no revelar cuál es cuál. Se aceptan 10 cambios o intentos por hora por cuenta y 30 por hora por conexión. Al cambiarla se cierran las sesiones abiertas en otros dispositivos y la sesión de quien la cambió sigue abierta.

---

## 16. Confirmar el correo y recuperar la contraseña

Lo decidió el usuario el 16 de noviembre de 2026 (D76). Viven en `/verificar` ("Revisa tu correo") y `/recuperar` ("Recupera tu contraseña").

**Confirmar el correo al registrarse.** Crear la cuenta con correo y contraseña no abre sesión. La cuenta nace sin confirmar y le llega el correo "Confirma tu cuenta" con un enlace. `/verificar` dice a qué correo se mandó y en cuántas horas vence ("Vence en 24 horas"); si se abre sin ese dato, dice "a tu correo".

| Regla | Valor |
|---|---|
| Vigencia del enlace para confirmar | 24 horas, un solo uso |
| Vigencia del enlace para recuperar la contraseña | 1 hora, un solo uso |
| Espera entre dos reenvíos en la pantalla | 60 segundos ("Podrás pedir otro en 0:59") |
| Pedir un enlace (reenviar o recuperar) | 5 por hora por correo y 10 por hora por conexión |
| Crear una cuenta | 10 por hora por conexión |
| Correos de la cuenta (confirmar, reenviar, recuperar y "Entra con Google") | 150 al día entre todos (configurable); al llegar, no sale ninguno ese día y la respuesta es la misma |
| Abrir un enlace para confirmar | 60 por hora por conexión |
| Crear la contraseña con el enlace | 30 intentos por hora por conexión |

- Al abrir el enlace, la cuenta queda confirmada y la persona llega a `/entrar` con "Tu cuenta quedó confirmada. Entra con tu contraseña." El enlace no abre sesión ni cambia la que ya esté abierta en ese navegador: así un enlace ajeno no deja a nadie dentro de otra cuenta. Un enlace vencido, ya usado o incompleto dice "Este enlace ya no sirve" y deja pedir otro.
- Una cuenta sin confirmar no entra con su contraseña. Con la contraseña correcta, `/entrar` dice "Confirma tu correo." y ofrece "Reenviar enlace"; con una contraseña equivocada responde lo mismo de siempre ("El correo o la contraseña no coinciden."), para no revelar qué cuentas existen ni su estado.
- Reenviar el enlace responde siempre lo mismo, exista o no la cuenta y esté o no confirmada. Solo una cuenta de cliente activa y sin confirmar recibe otro.
- Entrar con Google confirma la cuenta: las que se crean con Google nacen confirmadas, y una cuenta de contraseña sin confirmar que Google liga (D62) queda confirmada.
- Las cuentas que existían antes del 16 de noviembre de 2026 quedaron confirmadas.
- El correo con el que se entra sigue sin cambiarse desde `/cuenta/datos` (sección 15). "¿Escribiste mal tu correo? Cámbialo" lleva a crear la cuenta otra vez, en `/registro`.

**Recuperar la contraseña.** `/recuperar` pide el correo y, al enviar, dice siempre lo mismo: "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva."

- Una cuenta de cliente activa con contraseña recibe el enlace "Recupera tu contraseña".
- Una cuenta que solo entra con Google recibe un correo que le dice que use "Continuar con Google".
- Las cuentas del personal y los correos sin cuenta no reciben nada. El personal recupera su acceso desde el admin.
- Con el enlace, la persona escribe la contraseña nueva, con las reglas del registro (sección 15). Al guardarla, la cuenta queda confirmada, se cierran todas las sesiones abiertas y se abre una nueva en ese navegador.
