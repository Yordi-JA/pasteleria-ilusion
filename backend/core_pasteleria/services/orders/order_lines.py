"""Las líneas del pedido: cada tipo se revalida y se cobra con su estrategia (`LINE_HANDLERS`, sin `if/elif`).

- `order`: encargo de una presentación del catálogo, sin tope de existencias. Una rebanada no se encarga (D60) ni un
  producto "solo en vitrina". Para hoy exige pan del día (`Inventory` de pan, D30): una pieza de pan por pieza encargada.
- `showcase`: una pieza de la vitrina de hoy, sin pasar de lo que queda. Lo "solo por encargo" no está en la vitrina y el
  rebanado no se vende completo (D60).
- `design`: un pastel de "Diseña tu pastel". Todo se vuelve a calcular: los kilos por personas, el precio con
  `calculate_price` (que también revisa pisos, forma, oblea y mensaje), la base con `get_stand_deposit`, el mensaje con
  `check_message_layout`, la oblea contra la tapa real y el "parecido a" de los colores. Del cliente no se lee ningún
  monto, ni si requiere cotización, ni su id del diseño.

Cada estrategia solo revisa y calcula (`prepare`); lo que aparta (existencias, pan e imágenes) lo hace `order_service`
dentro de la transacción, en un orden fijo.
"""
from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from ...models import CustomerImagePurpose, OrderLineKind, Presentation, SalesChannel
from ...repositories.records import NewCakeDesign, NewOrderItem, OfferingRecord
from .. import cake_lid, color_names, pricing_service, warranty_service
from ..design_layout import MessageLayout, WaferLayout, check_message_layout, normalize_hex_color
from ..errors import DomainValidationError, attempt

ZERO = Decimal("0.00")
CENT = Decimal("0.01")

GONE_MESSAGE = "Ese producto ya no está a la venta."
SLICE_ORDER_MESSAGE = "Las rebanadas son solo de la vitrina de hoy: no se encargan."
SHOWCASE_ONLY_MESSAGE = "Solo en vitrina: no se encarga."
ORDER_ONLY_MESSAGE = "Solo por encargo: no está en la vitrina."
NO_BREAD_TODAY_MESSAGE = "Para hoy ya no tenemos pan para este pastel. Elige otra fecha."
SLICED_TODAY_MESSAGE = "Hoy este pastel se vende en rebanadas. Puedes encargarlo completo."
NOT_IN_SHOWCASE_MESSAGE = "Hoy no está en la vitrina."
HEX_MESSAGE = "Escribe el color como #RRGGBB, por ejemplo #F0CE8A."
WAFER_OUTSIDE_LID_MESSAGE = "La oblea se sale de la tapa del pastel. Acomódala otra vez."
IMAGE_MISSING = {
    CustomerImagePurpose.DECORATION: "Sube la imagen de tu decoración.",
    CustomerImagePurpose.WAFER: "Sube la imagen de tu oblea.",
}
IMAGE_NOT_EXPECTED = {
    CustomerImagePurpose.DECORATION: "Esta decoración no lleva imagen.",
    CustomerImagePurpose.WAFER: "Sin oblea no lleva imagen.",
}
IMAGE_UNAVAILABLE_MESSAGE = "Esa imagen no está disponible. Súbela otra vez."
WAFER_LAYOUT_MISSING = "Acomoda la oblea sobre la tapa."
NO_COLOR_MESSAGE = "Esta decoración no lleva color."


def too_many_pieces_message(limit: int) -> str:
    return f"Encarga hasta {limit} piezas por línea."


def stock_message(stock: int) -> str:
    """Lo que queda hoy, dicho como en la vitrina."""
    if stock <= 0:
        return "Se agotó por hoy."
    return "Solo queda 1." if stock == 1 else f"Solo quedan {stock}."


class LineError(Exception):
    """Errores de una línea, por campo; los del diseño van dentro de `design`."""

    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__(str(errors))


@dataclass(frozen=True)
class DesignRequest:
    """Lo que el cliente eligió en "Diseña tu pastel", ya con el formato validado por el serializador."""

    people: int
    form: str
    tiers: int
    cake_type: str
    bread: str
    filling_base: str | None
    filling_flavors: tuple[str, ...]
    coverage_color: str
    decoration: str
    decoration_color: str | None
    decoration_image_id: UUID | None
    message_layout: MessageLayout | None
    wafer: bool
    wafer_layout: WaferLayout | None
    wafer_image_id: UUID | None
    occasion: str


@dataclass(frozen=True)
class LineRequest:
    kind: str
    offering_id: int | None = None
    quantity: int = 1
    design: DesignRequest | None = None


@dataclass(frozen=True)
class LineContext:
    customer_id: int
    delivery_date: date
    today: date
    products: object
    cake_options: object
    settings: object
    images: object


@dataclass(frozen=True)
class PreparedLine:
    """Una línea revisada y cobrada, con lo que hay que apartar en la transacción."""

    item: NewOrderItem
    requires_quote: bool = False
    stand_deposit: Decimal = ZERO
    # Vitrina de hoy: la presentación que se descuenta.
    showcase_offering_id: int | None = None
    # Encargo para hoy: el pan del día que se consume.
    bread_id: int | None = None
    # Las imágenes que se ponen en el pedido, con su uso.
    images: tuple[tuple[UUID, str], ...] = ()


# --- Presentaciones del catálogo ---


class OfferingLine:
    """Lo común a las dos líneas del catálogo: la presentación activa, su precio y la cantidad."""

    kind: str

    def prepare(self, line: LineRequest, context: LineContext) -> PreparedLine:
        offering = context.products.get_offering(line.offering_id)
        if offering is None:
            raise LineError({"offering_id": [GONE_MESSAGE]})
        reservation = self.check(offering, line, context)
        item = NewOrderItem(
            kind=self.kind,
            offering_id=offering.id,
            product_name=offering.product_name,
            presentation=offering.presentation,
            quantity=line.quantity,
            unit_price=offering.price,
            line_total=(offering.price * line.quantity).quantize(CENT),
            design=None,
        )
        return PreparedLine(item=item, **reservation)

    def check(self, offering: OfferingRecord, line: LineRequest, context: LineContext) -> dict:
        raise NotImplementedError


def _refuse_when(rules: tuple[tuple[bool, str], ...]) -> None:
    """Lanza el primer motivo que aplica (las reglas van en orden, sin `if/elif`)."""
    message = next((message for applies, message in rules if applies), None)
    if message is not None:
        raise LineError({"offering_id": [message]})


class CatalogOrderLine(OfferingLine):
    kind = OrderLineKind.ORDER.value

    def check(self, offering, line, context):
        _refuse_when(
            (
                (offering.presentation == Presentation.SLICE, SLICE_ORDER_MESSAGE),
                (offering.sales_channel == SalesChannel.SHOWCASE_ONLY, SHOWCASE_ONLY_MESSAGE),
            )
        )
        # Tope de piezas de un encargo (`PolicySettings.max_pieces_per_line`); la vitrina la topan sus existencias.
        limit = context.settings.get_policy_settings().max_pieces_per_line
        if line.quantity > limit:
            raise LineError({"quantity": [too_many_pieces_message(limit)]})
        if context.delivery_date != context.today:
            return {}
        # Encargo para hoy (regla 1): sujeto a que haya pan del día. Sin pan definido para el producto, no hay.
        product = context.products.get_product_by_slug(offering.product_slug, context.today)
        bread_id = product.bread_id if product is not None else None
        available = context.products.get_bread_availability(bread_id, context.today) if bread_id else None
        if available is None or available < line.quantity:
            raise LineError({"offering_id": [NO_BREAD_TODAY_MESSAGE]})
        return {"bread_id": bread_id}


class ShowcaseLine(OfferingLine):
    kind = OrderLineKind.SHOWCASE.value

    def check(self, offering, line, context):
        whole_of_sliced = offering.presentation == Presentation.WHOLE and context.products.has_slices_loaded(
            offering.product_id, context.today
        )
        _refuse_when(
            (
                (offering.sales_channel == SalesChannel.ORDER_ONLY, ORDER_ONLY_MESSAGE),
                (whole_of_sliced, SLICED_TODAY_MESSAGE),
            )
        )
        stock = context.products.get_showcase_stock(offering.id, context.today)
        if stock is None:
            raise LineError({"offering_id": [NOT_IN_SHOWCASE_MESSAGE]})
        if stock < line.quantity:
            raise LineError({"quantity": [stock_message(stock)]})
        return {"showcase_offering_id": offering.id}


# --- "Diseña tu pastel" ---


def _remap_kg(errors: dict) -> dict:
    """El cliente manda personas: un error de los kilos se muestra en `people`."""
    return {("people" if field == "kg" else field): messages for field, messages in errors.items()}


def _normalized_color(value: str | None, field: str, errors: dict, required: bool) -> str | None:
    """El color en minúsculas; uno que no es `#rrggbb` (o falta si se pide) es error del campo."""
    color = normalize_hex_color(value)
    if color is None and (required or value is not None):
        errors[field] = [HEX_MESSAGE]
    return color


def _image_problem(image_id: UUID | None, expected: bool, purpose: str, context: LineContext) -> str | None:
    """Por qué no sirve la imagen de un uso, o `None` si está bien (también si no hace falta y no llegó)."""
    if image_id is None:
        return IMAGE_MISSING[purpose] if expected else None
    if not expected:
        return IMAGE_NOT_EXPECTED[purpose]
    if not context.images.is_attachable(image_id, context.customer_id, purpose):
        return IMAGE_UNAVAILABLE_MESSAGE
    return None


def _check_images(design: DesignRequest, requires_quote: bool, context: LineContext, errors: dict) -> list:
    """Las imágenes que exige el diseño: la de "Otra decoración" y la de la oblea, y solo ellas.

    Devuelve las que se ponen en el pedido, como `(id, uso)`; los problemas van a `errors` por campo.
    """
    wanted = (
        (CustomerImagePurpose.DECORATION, "decoration_image_id", design.decoration_image_id, requires_quote),
        (CustomerImagePurpose.WAFER, "wafer_image_id", design.wafer_image_id, design.wafer),
    )
    images = []
    for purpose, field, image_id, expected in wanted:
        problem = _image_problem(image_id, expected, purpose, context)
        if problem is not None:
            errors[field] = [problem]
        elif image_id is not None:
            images.append((image_id, purpose.value))
    return images


def _check_decoration_color(design: DesignRequest, context: LineContext, errors: dict) -> None:
    """Solo los diseños con duya y las rosas llevan color (regla 6.1, `DecorationOption.accepts_color`)."""
    if design.decoration_color is None:
        return
    decoration = next((d for d in context.cake_options.list_decorations() if d.slug == design.decoration), None)
    if decoration is not None and not decoration.accepts_color:
        errors.setdefault("decoration_color", [NO_COLOR_MESSAGE])


class DesignLine:
    kind = OrderLineKind.DESIGN.value

    def prepare(self, line: LineRequest, context: LineContext) -> PreparedLine:
        design = line.design
        size = pricing_service.size_for_people(design.people, context.settings, context.cake_options)
        choice = pricing_service.CakeDesignChoice(
            kg=size.kg,
            cake_type=design.cake_type,
            bread=design.bread,
            filling_base=design.filling_base,
            filling_flavors=design.filling_flavors,
            decoration=design.decoration,
            wafer=design.wafer,
            tiers=design.tiers,
            form=design.form,
            wafer_layout=design.wafer_layout,
            message_layout=design.message_layout,
        )
        failures: list[DomainValidationError] = []
        breakdown = attempt(failures, pricing_service.calculate_price, choice, context.cake_options, context.settings)
        stand = attempt(failures, warranty_service.get_stand_deposit, size.kg, context.settings)
        errors: dict = {}
        for failure in failures:
            for field, messages in _remap_kg(failure.errors).items():
                errors.setdefault(field, messages)
        coverage = _normalized_color(design.coverage_color, "coverage_color", errors, required=True)
        decoration_color = _normalized_color(design.decoration_color, "decoration_color", errors, required=False)
        _check_decoration_color(design, context, errors)
        if design.wafer and design.wafer_layout is None:
            errors.setdefault("wafer_layout", [WAFER_LAYOUT_MISSING])
        if breakdown is not None and design.wafer_layout is not None:
            lid = cake_lid.lid_for(context.cake_options.list_cake_molds(), design.form, size.kg, design.tiers)
            if not cake_lid.wafer_fits(design.wafer_layout, lid):
                errors.setdefault("wafer_layout", [WAFER_OUTSIDE_LID_MESSAGE])
        requires_quote = breakdown.requires_quote if breakdown is not None else False
        images = _check_images(design, requires_quote, context, errors)
        if errors:
            raise LineError({"design": errors})
        # Ya validado por el precio: aquí solo se toma el color en minúsculas (auditoría de D55, punto 9).
        message = check_message_layout(design.message_layout) if design.message_layout else None
        references = context.cake_options.list_coverage_colors()
        new_design = NewCakeDesign(
            people=design.people,
            kg=size.kg,
            form=design.form,
            tiers=design.tiers,
            cake_type=design.cake_type,
            bread=design.bread,
            filling_base=design.filling_base,
            filling_flavors=design.filling_flavors,
            coverage_color=coverage,
            coverage_color_name=color_names.nearest_color_name(coverage, references) or "",
            decoration=design.decoration,
            decoration_color=decoration_color,
            decoration_color_name=(
                (color_names.nearest_color_name(decoration_color, references) or "") if decoration_color else ""
            ),
            decoration_image_id=design.decoration_image_id,
            message=asdict(message) if message else None,
            wafer=design.wafer,
            wafer_layout=asdict(design.wafer_layout) if design.wafer_layout else None,
            wafer_image_id=design.wafer_image_id,
            occasion=design.occasion,
            price_per_kg=breakdown.price_per_kg,
            cake_subtotal=breakdown.cake_subtotal,
            wafer_price=breakdown.wafer,
            decoration_price=breakdown.decoration,
            total=breakdown.total,
            requires_quote=breakdown.requires_quote,
            stand_max_kg=stand.stand.max_kg if stand.stand else None,
            stand_deposit=stand.deposit,
        )
        item = NewOrderItem(
            kind=self.kind,
            offering_id=None,
            product_name="",
            presentation="",
            quantity=1,
            unit_price=breakdown.total,
            line_total=breakdown.total,
            design=new_design,
        )
        return PreparedLine(
            item=item, requires_quote=breakdown.requires_quote, stand_deposit=stand.deposit, images=tuple(images)
        )


LINE_HANDLERS = {
    OrderLineKind.ORDER.value: CatalogOrderLine(),
    OrderLineKind.SHOWCASE.value: ShowcaseLine(),
    OrderLineKind.DESIGN.value: DesignLine(),
}
