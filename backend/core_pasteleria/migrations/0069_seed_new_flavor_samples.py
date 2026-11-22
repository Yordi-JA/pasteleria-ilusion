"""Los diseños nuevos de fresa y cajeta, y la foto y la muestra del modelo de zarzamora y de chocolate (fotos del 22 de noviembre de 2026).

La pastelería mandó otros diseños para fresa y cajeta (`assets/SABORES/FRESA.jpeg` y `CAJETA.jpeg`): sus muestras pasan de como las
dejó la `0067` al diseño nuevo, solo si siguen exactamente así (si la pastelería las editó en el admin, no se pisan). Sus fotos
recortadas reemplazan al archivo de antes con el mismo nombre, así que `Product.photo` no cambia.

Zarzamora y chocolate no tenían foto ni muestra: su `Product.photo` se pone solo si sigue vacío y su muestra se crea solo si falta,
como en la `0064`. Usan lo que agrega la `0068`. No son datos de la pastelería: el admin los marca como observados y ella puede
corregirlos.

La reversa devuelve fresa y cajeta a la `0067` con la misma guarda, borra las muestras nuevas que siguen exactamente como se
sembraron y quita la foto solo si sigue siendo esta.
"""
import importlib

from django.db import migrations

redesign = importlib.import_module("core_pasteleria.migrations.0067_seed_redesigned_samples")

FIELDS = redesign.FIELDS

# Lo que cambia el diseño nuevo de fresa y cajeta sobre como los dejó la `0067`.
NEW_DESIGN = {
    # Glaseado rojo brillante en toda la tapa con una telaraña plumeada de chocolate; una fresa entera al centro; seis rosetas de crema
    # en la orilla con una cereza con rabito cada una; lajas de chocolate de leche pegadas al costado blanco, asomando sobre la orilla.
    "tres-leches-de-fresa": {
        "coverage_color": "#F4F0EA",
        "decoration": "rosetones",
        "decoration_color": "#FAF6EF",
        "fruit_layout": "crown",
        "fruits": ["strawberry", "cherry"],
        "side_texture": "",
        "top_color": "#D62828",
        "top_glossy": True,
        "top_ring_color": "",
        "top_ring_width": None,
        "drizzle": "web",
        "drizzle_color": "#3A1A12",
        "edge_size": 1.5,
        "edge_inset": 0.05,
        "side_bits": "plates",
        "side_bits_color": "#8A5A3B",
    },
    # Glaseado de cajeta brillante con plumas blancas en espiral; placas de chocolate oscuro en abanico (con puntos y rejilla blancos);
    # pera tallada en flor, fresas, uvas negras, kiwi y durazno al centro; tejas de azúcar pegadas al costado, asomando sobre la orilla.
    "tres-leches-de-cajeta": {
        "coverage_color": "#C97A35",
        "decoration": "ninguna",
        "decoration_color": "",
        "fruit_layout": "cover",
        "fruits": ["strawberry", "black_grape", "pear_flower", "peach", "kiwi"],
        "top_color": "#D88C3C",
        "top_glossy": True,
        "side_glossy": True,
        "side_texture": "",
        "side_band_color": "",
        "side_band_height": None,
        "drizzle": "feathers",
        "drizzle_color": "#F4EEDF",
        "edge_size": 1.0,
        # 0.01, no 0: la `0056`, que también corre al resembrar las pruebas, metería otra vez una cajeta en 0.
        "edge_inset": 0.01,
        "shells": "plaques",
        "shell_color": "#2B1712",
        "shell_second_color": "#F3EDE2",
        "side_bits": "plates",
        "side_bits_color": "#E6D7C1",
        "fruit_density": 1.2,
    },
}

# slug: (decoración, lo que cambia de `redesign.BLANK`). Los pasteles que no tenían foto ni muestra.
NEW_SAMPLES = {
    # Crema blanca con la tapa de salsa de zarzamora y trazos blancos curvos en espiral hasta la orilla; rosetones grandes de crema en
    # flor alrededor de la fruta, cada uno con un rayón de salsa; al centro, alta, manzana roja en abanico, pera tallada en flor, fresas,
    # durazno, un racimo de uvas negras y hojas de menta; placas de chocolate y láminas blancas de pie detrás; gotas de zarzamora que
    # escurren por el costado.
    "tres-leches-de-zarzamora": (
        "rosetones",
        {
            "coverage_color": "#F6F1EC",
            "decoration_color": "#FAF7F2",
            "fruit_layout": "cover",
            "fruits": ["apple", "strawberry", "black_grapes", "pear_flower", "peach", "mint"],
            "top_color": "#9C3655",
            "top_glossy": True,
            "drizzle": "marble",
            "drizzle_color": "#FBF6F3",
            "edge_size": 1.7,
            "edge_inset": 0.3,
            "fruit_density": 2.2,
            "shells": "plaques",
            "shell_color": "#2B1712",
            "shell_second_color": "#F3EDE2",
            "side_bits": "drips",
            "side_bits_color": "#7A2038",
        },
    ),
    # Cobertura de chocolate de leche; cascarones de huevo rotos de chocolate de leche, con la boca dentada y azúcar glass que casi cubre
    # lo de arriba, en una vuelta apretada en la orilla y algunos encimados; al centro láminas de pera en abanico, un racimo de uvas
    # negras, fresas partidas, kiwi, durazno y plátano tallado en flor.
    "tres-leches-de-chocolate": (
        "ninguna",
        {
            "coverage_color": "#A27458",
            "fruit_layout": "cover",
            "fruits": ["pear", "strawberry", "black_grapes", "kiwi", "peach", "pear_flower"],
            "side_texture": "spatula",
            "shells": "rim",
            "shell_color": "#8B5E45",
            "shell_second_color": "#7A5038",
            "dusting_color": "#F4F0EA",
            "fruit_density": 1.9,
        },
    ),
}


def before(slug):
    """Fresa o cajeta como las dejó la `0067`."""
    return redesign.after(slug)


def after(slug):
    """Fresa o cajeta con el diseño nuevo."""
    return {**before(slug), **NEW_DESIGN[slug]}


def seeded(slug):
    """Lo que la semilla deja en la muestra nueva, sin la decoración."""
    _, values = NEW_SAMPLES[slug]
    return {**redesign.BLANK, **values, "model_image": f"{slug}-modelo.webp", "show_model_in_catalog": True}


def photo_of(slug):
    return f"{slug}.webp"


def _move(apps, source, target):
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for sample in Sample.objects.select_related("decoration", "product").filter(product__slug__in=NEW_DESIGN):
        slug = sample.product.slug
        if redesign.fields_of(sample) != source(slug):
            continue
        values = target(slug)
        decoration = Decoration.objects.filter(slug=values["decoration"]).first()
        if decoration is None:
            continue
        sample.decoration = decoration
        for name in FIELDS:
            if name != "decoration":
                setattr(sample, name, values[name])
        sample.save()


def seed(apps, schema_editor):
    _move(apps, before, after)
    Product = apps.get_model("core_pasteleria", "Product")
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for slug, (decoration_slug, _) in NEW_SAMPLES.items():
        Product.objects.filter(slug=slug, photo="").update(photo=photo_of(slug))
        product = Product.objects.filter(slug=slug, category="cake").first()
        decoration = Decoration.objects.filter(slug=decoration_slug).first()
        if product is None or decoration is None or Sample.objects.filter(product=product).exists():
            continue
        Sample.objects.create(product=product, decoration=decoration, **seeded(slug))


def unseed(apps, schema_editor):
    _move(apps, after, before)
    Product = apps.get_model("core_pasteleria", "Product")
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for slug, (decoration_slug, _) in NEW_SAMPLES.items():
        Sample.objects.filter(product__slug=slug, decoration__slug=decoration_slug, **seeded(slug)).delete()
        Product.objects.filter(slug=slug, photo=photo_of(slug)).update(photo="")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0068_sample_new_flavor_choices"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
