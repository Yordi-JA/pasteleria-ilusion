"""Siembra los tamaños de vitrina y mini, sus límites y los datos nuevos de la tanda 2 de correcciones.

- Moldes (decisión del usuario del 17 de noviembre de 2026): vitrina, redondo de 28 cm de diámetro y 6.7 cm de alto;
  mini, redondo de 14 cm y 4.5 cm. El peso y las personas no se repiten: salen de los precios de catálogo que ya existen
  («Pastel de sabor normal, completo», 2.7 kg y 19 personas; «Pastel mini», peso PENDIENTE y 3 personas). La referencia
  de la vitrina es tres leches con pan de vainilla.
- Precio de vitrina por grupo: la base Normal, el de sabor normal; con queso y con flan, el suyo; Choco-pingüino y Red
  velvet, el de su pastel completo.
- Mini: solo la base Normal y las decoraciones sin decoración, borde de conchas, festones colgantes, rosas y las tres
  chispas. El precio de Rosas en el mini queda vacío (PENDIENTE).
- Sabor Blueberry, solo en la base Normal, en los tres tipos, sin precio propio y con relleno liso de mermelada como la
  zarzamora. Su color es una propuesta del equipo que la pastelería edita en el admin.
- «Tres leches de blueberry» (vitrina y por encargo, $350, rebanada $35 y mini $130, sin foto) y «Tres leches de nuez»
  (solo por encargo, con su precio PENDIENTE).
- El pan de cada pastel (respuesta del usuario del 17 de noviembre de 2026): vainilla en los de sabor normal, en los de
  queso o flan con zarzamora o cajeta, en blueberry y en nuez; chocolate en los de chocolate (también con queso);
  choco-vainilla en el de choco vainilla. Choco-pingüino y Red velvet ya traían el suyo. Solo se llena el pan vacío.

Cada fila se busca por su `slug`, su `code` o su nombre y solo se llena lo que sigue vacío: no pisa lo que ya editó la
pastelería. La reversa solo quita el precio PENDIENTE de la nuez (con él vacío no se podría volver a exigir el precio);
lo demás se queda, como en las otras semillas.
"""
from decimal import Decimal

from django.db import migrations

NORMAL_PRICE = "Pastel de sabor normal, completo"
NORMAL_SLICE = "Pastel de sabor normal, rebanada"
CHEESE_OR_FLAN_PRICE = "Pastel con queso o con flan, completo"
MINI_PRICE = "Pastel mini"
WALNUT_PRICE = "Pastel de nuez, completo"

# (code, precio de catálogo, diámetro, alto, tipo de referencia, pan de referencia)
DESIGN_SIZES = [
    ("showcase", NORMAL_PRICE, "28.0", "6.7", "tres_leches", "vainilla"),
    ("mini", MINI_PRICE, "14.0", "4.5", "", None),
]
BASE_SHOWCASE_PRICES = {"normal": NORMAL_PRICE, "queso": CHEESE_OR_FLAN_PRICE, "flan": CHEESE_OR_FLAN_PRICE}
BREAD_SHOWCASE_PRICES = {"choco_pinguino": "Choco-pingüino, completo", "red_velvet": "Red velvet, completo"}
MINI_BASES = ["normal"]
MINI_DECORATIONS = ["ninguna", "duya", "festones", "flores", "chispas", "chispas-chocolate", "chispas-choco-vainilla"]

BLUEBERRY = {
    "slug": "blueberry",
    "name": "Blueberry",
    "preview_style": "smooth",
    # Propuesto por el equipo: un azul morado oscuro de mermelada. La pastelería lo cambia en el admin.
    "preview_color": "#3E3A6E",
}
# (slug, nombre, descripción corta, cómo se vende, sabor, presentaciones con su precio de catálogo, orden)
# El orden 8 es el de capuchino: con el desempate por nombre, quedan junto a los demás pasteles de sabor normal.
PRODUCTS = [
    (
        "tres-leches-de-blueberry", "Tres leches de blueberry", "Relleno de blueberry y cobertura de crema pastelera.",
        "showcase_and_order", "blueberry", [("whole", NORMAL_PRICE), ("slice", NORMAL_SLICE), ("mini", MINI_PRICE)], 8,
    ),
    (
        "tres-leches-de-nuez", "Tres leches de nuez", "Relleno de nuez y cobertura de crema pastelera.",
        "order_only", "nuez", [("whole", WALNUT_PRICE)], 8,
    ),
]
# El pan de cada pastel (`Product.bread`), por su `slug`: con él, "Personalizar este pastel" lo abre como pastel de
# vitrina y el armado libre que coincide cobra su precio.
PRODUCT_BREADS = {
    "tres-leches-de-durazno": "vainilla",
    "tres-leches-de-fresa": "vainilla",
    "tres-leches-de-zarzamora": "vainilla",
    "tres-leches-de-cajeta": "vainilla",
    "tres-leches-de-galleta": "vainilla",
    "tres-leches-de-chocolate": "chocolate",
    "tres-leches-de-choco-vainilla": "choco_vainilla",
    "tres-leches-de-capuchino": "vainilla",
    "tres-leches-de-blueberry": "vainilla",
    "tres-leches-de-nuez": "vainilla",
    "tres-leches-con-queso-y-chocolate": "chocolate",
    "tres-leches-con-queso-y-zarzamora": "vainilla",
    "tres-leches-con-flan-y-cajeta": "vainilla",
    "tres-leches-con-flan-y-zarzamora": "vainilla",
}


def seed(apps, schema_editor):
    def model(name):
        return apps.get_model("core_pasteleria", name)

    CatalogPrice = model("CatalogPrice")
    prices = {price.name: price for price in CatalogPrice.objects.all()}
    walnut_order = max((price.sort_order for price in prices.values()), default=0) + 1
    # La nuez completa: su precio, su peso y sus personas son PENDIENTE.
    prices[WALNUT_PRICE], _ = CatalogPrice.objects.get_or_create(
        name=WALNUT_PRICE, defaults={"amount": None, "sort_order": walnut_order}
    )

    breads = {bread.slug: bread for bread in model("Bread").objects.all()}
    for code, price_name, diameter, height, cake_type, bread_slug in DESIGN_SIZES:
        if price_name not in prices or (bread_slug and bread_slug not in breads):
            continue
        model("DesignSize").objects.get_or_create(
            code=code,
            defaults={
                "catalog_price": prices[price_name],
                "diameter_cm": Decimal(diameter),
                "height_cm": Decimal(height),
                "reference_cake_type": cake_type,
                "reference_bread": breads.get(bread_slug) if bread_slug else None,
            },
        )

    FillingBase = model("FillingBase")
    for slug, price_name in BASE_SHOWCASE_PRICES.items():
        if price_name in prices:
            FillingBase.objects.filter(slug=slug, showcase_price__isnull=True).update(showcase_price=prices[price_name])
    FillingBase.objects.filter(slug__in=MINI_BASES).update(available_in_mini=True)
    for slug, price_name in BREAD_SHOWCASE_PRICES.items():
        if price_name in prices:
            model("Bread").objects.filter(
                slug=slug, pricing_mode="full_price_per_kg", showcase_price__isnull=True
            ).update(showcase_price=prices[price_name])
    model("DecorationOption").objects.filter(slug__in=MINI_DECORATIONS).update(available_in_mini=True)

    FillingFlavor = model("FillingFlavor")
    flavor_order = max(FillingFlavor.objects.values_list("sort_order", flat=True), default=0) + 1
    blueberry, created = FillingFlavor.objects.get_or_create(
        slug=BLUEBERRY["slug"],
        defaults={
            "name": BLUEBERRY["name"],
            "preview_style": BLUEBERRY["preview_style"],
            "preview_color": BLUEBERRY["preview_color"],
            "is_combinable": True,
            "allowed_cake_types": ["tres_leches", "seco", "envinado"],
            "sort_order": flavor_order,
        },
    )
    normal = FillingBase.objects.filter(slug="normal").first()
    if created and normal is not None:
        blueberry.bases.add(normal)

    flavors = {flavor.slug: flavor for flavor in FillingFlavor.objects.all()}
    Product = model("Product")
    for slug, name, summary, channel, flavor_slug, offerings, order in PRODUCTS:
        if normal is None or flavor_slug not in flavors:
            continue
        product, _ = Product.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "summary": summary,
                "category": "cake",
                "sales_channel": channel,
                "cake_type": "tres_leches",
                "filling_base": normal,
                "filling_flavor": flavors[flavor_slug],
                "sort_order": order,
            },
        )
        for presentation_order, (presentation, price_name) in enumerate(offerings, start=1):
            if price_name in prices:
                model("ProductOffering").objects.get_or_create(
                    product=product,
                    presentation=presentation,
                    defaults={"price": prices[price_name], "sort_order": presentation_order},
                )

    for slug, bread_slug in PRODUCT_BREADS.items():
        if bread_slug in breads:
            Product.objects.filter(slug=slug, bread__isnull=True).update(bread=breads[bread_slug])


def unseed(apps, schema_editor):
    """Quita la nuez solo mientras su precio siga PENDIENTE, para que la `0044` pueda volver a exigir el precio."""
    CatalogPrice = apps.get_model("core_pasteleria", "CatalogPrice")
    pending = CatalogPrice.objects.filter(name=WALNUT_PRICE, amount__isnull=True)
    apps.get_model("core_pasteleria", "ProductOffering").objects.filter(price__in=pending).delete()
    apps.get_model("core_pasteleria", "Product").objects.filter(slug="tres-leches-de-nuez", offerings__isnull=True).delete()
    pending.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0044_design_sizes"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
