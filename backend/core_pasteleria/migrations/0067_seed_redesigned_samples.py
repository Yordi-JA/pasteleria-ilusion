"""Las muestras del modelo de los 8 pasteles de antes, rediseñadas para parecerse a su foto (opciones de la `0066`).

El usuario revisó las imágenes del catálogo: en la mayoría la fruta era un montón chico al centro, encimado sobre la tapa, y en las
fotos cubre buena parte de ella con acomodos propios; varios tenían además la tapa, el costado o las conchas distintos a la foto.
Cada muestra copia otra vez lo que se ve en su foto (`frontend/public/fotos/<slug>.webp`, revisadas el 22 de noviembre de 2026),
como las de la `0050` a la `0064`. No son datos de la pastelería: el admin los marca como observados y ella puede corregirlos.

Solo cambia una muestra que sigue exactamente como la dejaron las migraciones de antes (`0050`, `0052`, `0054`, `0056` y `0058`):
si la pastelería la editó en el admin, no la pisa. Correrla otra vez no cambia nada. La reversa devuelve los valores de antes solo
a la muestra que sigue exactamente como la dejó esta migración. Las muestras de la `0064` no se tocan.
"""
from django.db import migrations

# Los campos que se comparan y se escriben; la decoración va por su `slug` (una llave a otra tabla).
FIELDS = (
    "coverage_color",
    "decoration",
    "decoration_color",
    "fruit_layout",
    "fruits",
    "side_comb",
    "top_color",
    "top_glossy",
    "side_glossy",
    "side_texture",
    "top_ring_color",
    "top_ring_width",
    "side_band_color",
    "side_band_height",
    "drizzle",
    "drizzle_color",
    "edge_size",
    "shells",
    "shell_color",
    "shell_second_color",
    "dusting_color",
    "side_bits",
    "side_bits_color",
    "fruit_density",
    "edge_inset",
    "sprinkle_density",
    "model_image",
    "show_model_in_catalog",
)

# Una muestra sin detalles; cada pastel cambia lo suyo.
BLANK = {
    "decoration_color": "",
    "fruit_layout": "",
    "fruits": [],
    "side_comb": False,
    "top_color": "",
    "top_glossy": False,
    "side_glossy": False,
    "side_texture": "",
    "top_ring_color": "",
    "top_ring_width": None,
    "side_band_color": "",
    "side_band_height": None,
    "drizzle": "",
    "drizzle_color": "",
    "edge_size": 1.0,
    "shells": "",
    "shell_color": "",
    "shell_second_color": "",
    "dusting_color": "",
    "side_bits": "",
    "side_bits_color": "",
    "fruit_density": 1.0,
    "edge_inset": 0.0,
    "sprinkle_density": 1.0,
    "show_model_in_catalog": True,
}

# Cómo quedaron las 8 con las migraciones de antes (lo que cambia de `BLANK`).
PREVIOUS = {
    "tres-leches-de-durazno": {
        "coverage_color": "#EFE9E3",
        "decoration": "ninguna",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "kiwi", "pear"],
        "top_color": "#E2B21C",
        "top_glossy": True,
        "side_texture": "spatula",
        "side_band_color": "#D9B52E",
        "side_band_height": 0.5,
        "drizzle": "lace",
        "drizzle_color": "#432517",
    },
    "tres-leches-de-fresa": {
        "coverage_color": "#F2EDE7",
        "decoration": "ninguna",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "kiwi", "peach", "starfruit"],
        "side_texture": "lace",
        "top_ring_color": "#B3312F",
        "top_ring_width": 0.5,
    },
    "tres-leches-de-cajeta": {
        "coverage_color": "#C8742F",
        "decoration": "rosetones",
        "decoration_color": "#F8F0E7",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "grape", "peach", "physalis"],
        "top_color": "#F7EFE6",
        "side_glossy": True,
        "side_texture": "ridges",
        "side_band_color": "#F7EFE6",
        "side_band_height": 0.08,
        "drizzle": "threads",
        "drizzle_color": "#C8742F",
        "edge_size": 1.9,
        "fruit_density": 2.0,
        "edge_inset": 0.08,
    },
    "tres-leches-de-galleta": {
        "coverage_color": "#EBE3DC",
        "decoration": "rosetones",
        "decoration_color": "#F3EEE9",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "kiwi", "pear", "starfruit"],
        "side_texture": "spatula",
        "edge_size": 1.6,
        "side_bits": "crumbs",
        "side_bits_color": "#2E2422",
    },
    "tres-leches-de-choco-vainilla": {
        "coverage_color": "#A88470",
        "decoration": "chispas-choco-vainilla",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "kiwi", "peach", "pear", "banana"],
        "side_band_color": "#F3ECE2",
        "side_band_height": 0.06,
        "shells": "edge",
        "shell_color": "#E6DFCC",
        "shell_second_color": "#3B2A25",
        "fruit_density": 2.0,
        "edge_inset": 0.14,
        "sprinkle_density": 8.0,
    },
    "tres-leches-de-capuchino": {
        "coverage_color": "#B3A188",
        "decoration": "ninguna",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "kiwi", "peach", "pear", "starfruit"],
        "side_texture": "spatula",
        "shells": "tulips",
        "shell_color": "#E2D3B5",
        "dusting_color": "#A8875E",
        "side_bits": "flakes",
        "side_bits_color": "#E9DCC2",
        "fruit_density": 3.0,
        "edge_inset": 0.08,
    },
    "tres-leches-con-queso-y-chocolate": {
        "coverage_color": "#8E6B57",
        "decoration": "duya",
        "decoration_color": "#8E6B57",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "kiwi", "peach", "starfruit"],
        "side_texture": "spatula",
        "shells": "top",
        "shell_color": "#6B4A3A",
        "shell_second_color": "#3B2A25",
        "dusting_color": "#F4F0EA",
        "side_bits": "flakes",
        "side_bits_color": "#5B4038",
        "fruit_density": 2.0,
        "edge_inset": 0.06,
    },
    "tres-leches-con-flan-y-cajeta": {
        "coverage_color": "#9C5E32",
        "decoration": "rosetones",
        "decoration_color": "#F1E8DC",
        "fruit_layout": "rows",
        "fruits": ["strawberry", "apple", "kiwi", "starfruit"],
        "side_glossy": True,
        "side_band_color": "#F1E8DC",
        "side_band_height": 0.12,
        "edge_size": 1.4,
        "fruit_density": 2.0,
    },
}

# Lo que cambia cada foto sobre `PREVIOUS`. Observado en las fotos del 22 de noviembre de 2026.
REDESIGN = {
    # Glaseado amarillo con una celosía de garabatos de chocolate alrededor; la fruta en la mitad de atrás (manzana roja en abanico
    # y en láminas, fresa, pera y un poco de kiwi y durazno); el costado blanco con pinceladas amarillas en diagonal que suben desde
    # abajo.
    "tres-leches-de-durazno": {
        "fruit_layout": "back",
        "fruits": ["strawberry", "pear", "apple", "kiwi", "peach"],
        "side_texture": "brushed",
        "side_band_color": "#E9B10E",
        "side_band_height": 0.62,
        "drizzle": "lattice",
        "fruit_density": 1.5,
    },
    # Una banda de mermelada en la orilla y el centro blanco, cerca del 60 % del diámetro de la tapa; la fruta dentro de él: fresas a
    # la mitad, plátano, kiwi, durazno y manzana roja en abanico.
    "tres-leches-de-fresa": {
        "fruit_layout": "cover",
        "fruits": ["strawberry", "banana", "kiwi", "peach", "apple"],
        "top_ring_width": 0.25,
    },
    # Uvas verdes, manzana en láminas, fresas, manzana roja en abanico, physalis y pera cubren el centro, con un rizo de chocolate
    # blanco atrás a la izquierda.
    "tres-leches-de-cajeta": {
        "fruit_layout": "cover",
        "fruits": ["apple_wedge", "grape", "strawberry", "apple", "physalis", "pear"],
        "edge_size": 1.7,
        "edge_inset": 0.05,
        "shells": "curl",
        "shell_color": "#EFE3CB",
    },
    # Mandan las láminas grandes de manzana, de pulpa clara con un hilo de cáscara roja, y la manzana roja en abanico; algunas fresas y
    # poco kiwi, en el centro y atrás.
    "tres-leches-de-galleta": {
        "fruit_layout": "cover",
        "fruits": ["apple_sheet", "apple", "strawberry", "kiwi"],
        "edge_size": 1.3,
        "fruit_density": 1.8,
    },
    # Una mezcla de durazno, manzana en láminas, fresa, plátano, kiwi, piña y manzana roja que cubre el centro.
    "tres-leches-de-choco-vainilla": {
        "fruit_layout": "cover",
        "fruits": ["peach", "apple_wedge", "strawberry", "banana", "kiwi", "pineapple", "apple"],
        "edge_inset": 0.04,
    },
    # Tulipanes de chocolate blanco abiertos y recostados con canela; piña en rebanadas, manzana en láminas, fresa, durazno, kiwi y
    # carambola.
    "tres-leches-de-capuchino": {
        "fruit_layout": "cover",
        "fruits": ["pineapple", "apple_wedge", "strawberry", "peach", "kiwi", "starfruit"],
        "shells": "open",
        "shell_color": "#EEE3CB",
        "fruit_density": 2.4,
        # Casi en la orilla. No en 0: la `0056`, que también corre al resembrar las pruebas, metería otra vez una muestra en 0.
        "edge_inset": 0.02,
    },
    # Media tapa de conchas finas y brillantes de chocolate, abiertas, algunas de pie, con azúcar glass; la otra media de fruta: manzana
    # roja en láminas, fresa, kiwi, pera y durazno.
    "tres-leches-con-queso-y-chocolate": {
        "fruit_layout": "cover",
        "fruits": ["apple_wedge", "strawberry", "kiwi", "pear", "peach"],
        "shells": "half",
        "shell_color": "#4E3022",
        "shell_second_color": "#6A4532",
        "fruit_density": 2.0,
    },
    # Cajeta brillante y más clara en el costado; el borde de crema blanca pegado a la orilla, en rosetones chicos y juntos; la fruta
    # en filas de atrás hacia el frente que llegan a la orilla: fresa, limón, láminas finas de manzana roja y kiwi, sin carambola.
    "tres-leches-con-flan-y-cajeta": {
        "coverage_color": "#A9692F",
        "decoration_color": "#F6EFE6",
        "fruit_layout": "columns",
        "fruits": ["strawberry", "citrus", "apple_sheet", "kiwi"],
        "edge_size": 1.0,
        "fruit_density": 1.6,
    },
}


def model_image(slug):
    return f"{slug}-modelo.webp"


def before(slug):
    """La muestra como la dejaron las migraciones de antes."""
    return {**BLANK, **PREVIOUS[slug], "model_image": model_image(slug)}


def after(slug):
    """La muestra como la deja esta migración."""
    return {**before(slug), **REDESIGN[slug]}


def fields_of(sample):
    return {name: (sample.decoration.slug if name == "decoration" else getattr(sample, name)) for name in FIELDS}


def _move(apps, source, target):
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for sample in Sample.objects.select_related("decoration", "product").filter(product__slug__in=REDESIGN):
        slug = sample.product.slug
        if fields_of(sample) != source(slug):
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


def unseed(apps, schema_editor):
    _move(apps, after, before)


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0066_sample_redesign_choices"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
