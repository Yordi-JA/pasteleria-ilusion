"""Las cinco gelatinas en vaso del catálogo (decisión del usuario del 20 de noviembre de 2026).

- «Mosaico con yogurt» era un solo producto, de fresa o de durazno. Pasa a «Mosaico con yogurt de fresa», con el `slug`
  `mosaico-con-yogurt-de-fresa`, y su precio a «Gelatina Mosaico con yogurt de fresa (vaso)». Los pedidos guardan la
  presentación por su id y el nombre como estaba al pedir, así que no cambian.
- Altas: «Mosaico normal» (`gelatina-mosaico`, la amarilla de gelatina firme) y «Mosaico con yogurt de durazno»
  (`mosaico-con-yogurt-de-durazno`), cada una con su precio de $20. Son postres, solo en vitrina, en vaso.
- La descripción corta de cada mosaico dice con qué va; la de «Mosaico con crema» deja de ser igual a la del normal.

Orden: el normal toma el 19 (el de la gelatina de molde) y el de durazno el 21 (el del de fresa); con el desempate por
nombre quedan antes del de crema y antes del de fresa. No se reordena ninguna fila que ya existía.

Cada cambio se hace solo si la fila sigue como la sembró la `0009`: no pisa lo que editó la pastelería. Correrla otra vez
no cambia nada; si la `0009` vuelve a sembrar el «Mosaico con yogurt» viejo (lo hace `tests/conftest.py` sobre una base
ya migrada), lo quita mientras siga intacto y sin pedidos ni inventario. La reversa deshace el renombre y quita las dos
altas, salvo lo que ya tenga pedidos o inventario, que se queda.
"""
from decimal import Decimal

from django.db import migrations

OLD_SLUG = "mosaico-con-yogurt"
OLD_NAME = "Mosaico con yogurt"
OLD_SUMMARY = "Gelatina en vaso, con yogurt de fresa o durazno."
OLD_PRICE = "Gelatina Mosaico con yogurt (vaso)"
SEED_AMOUNT = Decimal("20.00")

STRAWBERRY_SLUG = "mosaico-con-yogurt-de-fresa"
STRAWBERRY_NAME = "Mosaico con yogurt de fresa"
STRAWBERRY_SUMMARY = "Gelatina en vaso, cuadritos de sabores con yogurt de fresa."
STRAWBERRY_PRICE = "Gelatina Mosaico con yogurt de fresa (vaso)"

CREAM_SLUG = "mosaico-con-crema"
CREAM_SUMMARY_BEFORE = "Gelatina en vaso, cuadritos de sabores."
CREAM_SUMMARY = "Gelatina en vaso, cuadritos de sabores con crema."

# Los precios que nacen aquí: (nombre, orden). El de fresa solo nace si no existía el que se renombra.
NEW_PRICES = [
    ("Gelatina Mosaico normal (vaso)", 18),
    ("Gelatina Mosaico con yogurt de durazno (vaso)", 19),
]
# (slug, nombre, descripción corta, precio de su vaso, orden)
NEW_PRODUCTS = [
    ("gelatina-mosaico", "Mosaico normal", "Gelatina en vaso, cuadritos de sabores.", "Gelatina Mosaico normal (vaso)", 19),
    (
        "mosaico-con-yogurt-de-durazno", "Mosaico con yogurt de durazno",
        "Gelatina en vaso, cuadritos de sabores con yogurt de durazno.", "Gelatina Mosaico con yogurt de durazno (vaso)", 21,
    ),
]


def _models(apps):
    def model(name):
        return apps.get_model("core_pasteleria", name)

    return model("Product"), model("ProductOffering"), model("CatalogPrice"), model("OrderItem"), model("Inventory")


def _has_history(product, OrderItem, Inventory):
    """Si alguna presentación del producto ya se pidió o se cargó en el inventario: entonces no se borra."""
    return (
        OrderItem.objects.filter(offering__product=product).exists()
        or Inventory.objects.filter(offering__product=product).exists()
    )


def _set_if(obj, field, before, after):
    if getattr(obj, field) == before:
        setattr(obj, field, after)
        return [field]
    return []


def seed(apps, schema_editor):
    Product, ProductOffering, CatalogPrice, OrderItem, Inventory = _models(apps)

    # El producto de antes, renombrado. Si ya existe el nuevo, el viejo solo puede ser la `0009` sembrada otra vez.
    old = Product.objects.filter(slug=OLD_SLUG).first()
    if old is not None:
        if Product.objects.filter(slug=STRAWBERRY_SLUG).exists():
            if (old.name, old.summary) == (OLD_NAME, OLD_SUMMARY) and not _has_history(old, OrderItem, Inventory):
                old.delete()
        else:
            old.slug = STRAWBERRY_SLUG
            changed = ["slug"]
            if not Product.objects.filter(name=STRAWBERRY_NAME).exists():
                changed += _set_if(old, "name", OLD_NAME, STRAWBERRY_NAME)
            changed += _set_if(old, "summary", OLD_SUMMARY, STRAWBERRY_SUMMARY)
            old.save(update_fields=changed)

    old_price = CatalogPrice.objects.filter(name=OLD_PRICE).first()
    if old_price is not None:
        if CatalogPrice.objects.filter(name=STRAWBERRY_PRICE).exists():
            if old_price.amount == SEED_AMOUNT and not ProductOffering.objects.filter(price=old_price).exists():
                old_price.delete()
        else:
            old_price.name = STRAWBERRY_PRICE
            old_price.save(update_fields=["name"])

    Product.objects.filter(slug=CREAM_SLUG, summary=CREAM_SUMMARY_BEFORE).update(summary=CREAM_SUMMARY)

    prices = {}
    for name, order in [*NEW_PRICES, (STRAWBERRY_PRICE, 19)]:
        prices[name], _ = CatalogPrice.objects.get_or_create(
            name=name, defaults={"amount": SEED_AMOUNT, "sort_order": order}
        )
    products = [
        *NEW_PRODUCTS,
        (STRAWBERRY_SLUG, STRAWBERRY_NAME, STRAWBERRY_SUMMARY, STRAWBERRY_PRICE, 21),
    ]
    for slug, name, summary, price_name, order in products:
        product, _ = Product.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "summary": summary,
                "category": "dessert",
                "sales_channel": "showcase_only",
                "sort_order": order,
            },
        )
        ProductOffering.objects.get_or_create(
            product=product, presentation="cup", defaults={"price": prices[price_name], "sort_order": 1}
        )


def unseed(apps, schema_editor):
    Product, ProductOffering, CatalogPrice, OrderItem, Inventory = _models(apps)

    for slug, name, summary, price_name, _order in NEW_PRODUCTS:
        product = Product.objects.filter(slug=slug).first()
        if product is not None and not _has_history(product, OrderItem, Inventory):
            product.delete()
        CatalogPrice.objects.filter(name=price_name, offerings__isnull=True).delete()

    strawberry = Product.objects.filter(slug=STRAWBERRY_SLUG).first()
    if strawberry is not None and not Product.objects.filter(slug=OLD_SLUG).exists():
        strawberry.slug = OLD_SLUG
        changed = ["slug"]
        if not Product.objects.filter(name=OLD_NAME).exists():
            changed += _set_if(strawberry, "name", STRAWBERRY_NAME, OLD_NAME)
        changed += _set_if(strawberry, "summary", STRAWBERRY_SUMMARY, OLD_SUMMARY)
        strawberry.save(update_fields=changed)

    if not CatalogPrice.objects.filter(name=OLD_PRICE).exists():
        CatalogPrice.objects.filter(name=STRAWBERRY_PRICE).update(name=OLD_PRICE)

    Product.objects.filter(slug=CREAM_SLUG, summary=CREAM_SUMMARY).update(summary=CREAM_SUMMARY_BEFORE)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0058_seed_fuller_fruit"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
