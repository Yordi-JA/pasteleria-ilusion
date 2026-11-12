"""Lo que se paga hoy y el día de la entrega (regla 10).

Se paga un anticipo (`PolicySettings.advance_percent`, 50% al inicio) del
pedido; el depósito de la base y el envío no entran en el anticipo: se pagan
completos, aparte, el mismo día. Los montos son `Decimal` con dos decimales.
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from ..repositories import settings_repo
from .pricing_service import PriceBreakdown
from .warranty_service import StandDeposit

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


@dataclass(frozen=True)
class PaymentSummary:
    advance_percent: int
    # La parte del pedido que se paga hoy.
    advance: Decimal
    base_deposit: Decimal
    delivery_fee: Decimal
    pay_today: Decimal
    pay_on_delivery: Decimal


def payment_summary(
    order_total: Decimal,
    base_deposit: Decimal = ZERO,
    delivery_fee: Decimal = ZERO,
    settings=settings_repo,
) -> PaymentSummary:
    """Anticipo, lo que se paga hoy y lo que queda para la entrega.

    `order_total` es el pedido sin la base ni el envío. El anticipo se redondea
    al centavo de .5 hacia arriba; el resto es lo que falta para el pedido.
    """
    percent = settings.get_policy_settings().advance_percent
    advance = (order_total * percent / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    return PaymentSummary(
        advance_percent=percent,
        advance=advance,
        base_deposit=base_deposit,
        delivery_fee=delivery_fee,
        pay_today=advance + base_deposit + delivery_fee,
        pay_on_delivery=order_total - advance,
    )


def payment_for_design(
    breakdown: PriceBreakdown, stand_deposit: StandDeposit, settings=settings_repo
) -> PaymentSummary | None:
    """Lo que se paga por un diseño de "Diseña tu pastel", o `None` si la pastelería aún no le pone precio.

    Con una decoración por cotizar el pedido queda en pausa y no se cobra nada hasta que la pastelería dé el
    precio (`docs/reglas-de-negocio.md`, sección 6.1): ni anticipo ni depósito. El envío se decide en el carrito.
    """
    if breakdown.requires_quote:
        return None
    return payment_summary(breakdown.total, stand_deposit.deposit, settings=settings)
