"""Siembra la muestra del modelo de los 8 pasteles que tienen foto (D86).

Cada valor se observó en la foto del pastel (análisis del 18 de noviembre de 2026, `frontend/public/fotos/`): el color de la
cobertura y de la decoración, la decoración del paso 6 más parecida, la fruta de la tapa y su acomodo, y el peinado. No son
datos de la pastelería: el admin los marca como observados y ella puede corregirlos. El tipo, el pan y el relleno salen del
producto. Las 8 muestran su imagen del modelo en el catálogo (`<slug>-modelo.webp`, que genera
`frontend/scripts/render-models.mjs`), como decidió el usuario.

Solo se crea la muestra que falta, de un pastel que existe y con una decoración que existe: lo que la pastelería cambió en el
admin no se pisa y correrla otra vez no cambia nada. La reversa borra solo las muestras que siguen exactamente como se
sembraron; una editada se queda.
"""
from django.db import migrations

# (slug del producto, cobertura, slug de la decoración, color de la decoración, acomodo de la fruta, frutas, peinado)
SAMPLES = [
    ("tres-leches-de-cajeta", "#C8742F", "rosetones", "#F8F0E7", "mound", ["strawberry", "apple", "grape", "peach", "physalis"], True),
    ("tres-leches-de-capuchino", "#B3A188", "rosetones", "#E2D3B5", "mound", ["strawberry", "apple", "kiwi", "peach", "pear", "starfruit"], False),
    ("tres-leches-de-choco-vainilla", "#A88470", "chispas-choco-vainilla", "", "mound", ["strawberry", "apple", "kiwi", "peach", "pear"], False),
    ("tres-leches-de-durazno", "#E2B21C", "ninguna", "", "mound", ["strawberry", "apple", "kiwi", "pear"], False),
    ("tres-leches-de-fresa", "#F2EDE7", "ninguna", "", "mound", ["strawberry", "apple", "kiwi", "peach", "starfruit"], False),
    ("tres-leches-de-galleta", "#EBE3DC", "rosetones", "#F3EEE9", "mound", ["strawberry", "apple", "kiwi", "pear", "starfruit"], False),
    ("tres-leches-con-flan-y-cajeta", "#9C5E32", "rosetones", "#F1E8DC", "rows", ["strawberry", "apple", "kiwi", "starfruit"], False),
    ("tres-leches-con-queso-y-chocolate", "#8E6B57", "duya", "#8E6B57", "mound", ["strawberry", "apple", "kiwi", "peach", "starfruit"], False),
]


def _values(slug, coverage, decoration_color, layout, fruits, comb):
    """Lo sembrado de una muestra, sin la decoración (una llave a otra tabla)."""
    return {
        "coverage_color": coverage,
        "decoration_color": decoration_color,
        "fruit_layout": layout,
        "fruits": fruits,
        "side_comb": comb,
        "model_image": f"{slug}-modelo.webp",
        "show_model_in_catalog": True,
    }


def seed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for slug, coverage, decoration_slug, decoration_color, layout, fruits, comb in SAMPLES:
        product = Product.objects.filter(slug=slug, category="cake").first()
        decoration = Decoration.objects.filter(slug=decoration_slug).first()
        if product is None or decoration is None or Sample.objects.filter(product=product).exists():
            continue
        Sample.objects.create(product=product, decoration=decoration, **_values(slug, coverage, decoration_color, layout, fruits, comb))


def unseed(apps, schema_editor):
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for slug, coverage, decoration_slug, decoration_color, layout, fruits, comb in SAMPLES:
        values = _values(slug, coverage, decoration_color, layout, fruits, comb)
        Sample.objects.filter(product__slug=slug, decoration__slug=decoration_slug, **values).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0049_product_sample_design"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
