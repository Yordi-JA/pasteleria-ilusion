"""Siembra los detalles de la imagen del catálogo en las 8 muestras del modelo (tanda 4b, campos de la `0051`).

Cada valor se observó en la foto del pastel (`frontend/public/fotos/`, análisis del 18 de noviembre de 2026 en `muestras.md`):
la tapa de otro color, el anillo de mermelada, la franja de abajo, la textura y el brillo del costado, los hilos, el tamaño de
las piezas del borde, las conchas de chocolate, el espolvoreado y lo pegado al costado. No son datos de la pastelería: el admin
los marca como observados y ella puede corregirlos. Solo los dibuja la imagen del catálogo.

Además corrige cuatro datos de la `0050` que ahora tienen dónde ir, solo si siguen como los sembró la `0050`:

- Durazno: la cobertura pasa al blanco del costado (`#EFE9E3`); el amarillo queda en la tapa y en la franja de abajo.
- Capuchino: las conchas de chocolate blanco ocupan el borde de arriba, así que la decoración pasa a «Sin decoración».
- Choco vainilla: suma el plátano de la foto a su fruta.
- Cajeta: sin el peinado horizontal; su costado lleva las crestas diagonales de la foto (`side_texture`).

Los detalles se siembran solo en una muestra que aún no tiene ninguno: lo que la pastelería cambió en el admin no se pisa y
correrla otra vez no cambia nada. La reversa quita solo los detalles que siguen exactamente como se sembraron y devuelve los cuatro
datos corregidos solo si nadie los cambió.
"""
from django.db import migrations

# Los detalles sin nada: así quedan las muestras con la `0051`.
EMPTY = {
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
}

# Lo que cambia de `EMPTY` en cada foto.
DETAILS = {
    "tres-leches-de-fresa": {"top_ring_color": "#B3312F", "top_ring_width": 0.5, "side_texture": "lace"},
    "tres-leches-de-durazno": {
        "top_color": "#E2B21C",
        "top_glossy": True,
        "side_texture": "spatula",
        "side_band_color": "#D9B52E",
        "side_band_height": 0.5,
        "drizzle": "lace",
        "drizzle_color": "#432517",
    },
    "tres-leches-de-cajeta": {
        "top_color": "#F7EFE6",
        "side_glossy": True,
        "side_texture": "ridges",
        "side_band_color": "#F7EFE6",
        "side_band_height": 0.08,
        "drizzle": "threads",
        "drizzle_color": "#C8742F",
        "edge_size": 1.9,
    },
    "tres-leches-con-flan-y-cajeta": {"side_glossy": True, "side_band_color": "#F1E8DC", "side_band_height": 0.12, "edge_size": 1.4},
    "tres-leches-de-capuchino": {
        "side_texture": "spatula",
        "shells": "edge",
        "shell_color": "#E2D3B5",
        "dusting_color": "#A8875E",
        "side_bits": "flakes",
        "side_bits_color": "#E9DCC2",
    },
    "tres-leches-de-choco-vainilla": {
        "shells": "edge",
        "shell_color": "#E6DFCC",
        "shell_second_color": "#3B2A25",
        "side_band_color": "#F3ECE2",
        "side_band_height": 0.06,
    },
    "tres-leches-de-galleta": {"edge_size": 1.6, "side_texture": "spatula", "side_bits": "crumbs", "side_bits_color": "#2E2422"},
    "tres-leches-con-queso-y-chocolate": {
        "side_texture": "spatula",
        "shells": "top",
        "shell_color": "#6B4A3A",
        "shell_second_color": "#3B2A25",
        "dusting_color": "#F4F0EA",
        "side_bits": "flakes",
        "side_bits_color": "#5B4038",
    },
}

# Los datos de la `0050` que se corrigen: (como los sembró la `0050`, como quedan). La decoración va por su `slug`.
CORRECTIONS = {
    "tres-leches-de-durazno": ({"coverage_color": "#E2B21C"}, {"coverage_color": "#EFE9E3"}),
    "tres-leches-de-capuchino": (
        {"decoration": "rosetones", "decoration_color": "#E2D3B5"},
        {"decoration": "ninguna", "decoration_color": ""},
    ),
    "tres-leches-de-cajeta": ({"side_comb": True}, {"side_comb": False}),
    "tres-leches-de-choco-vainilla": (
        {"fruits": ["strawberry", "apple", "kiwi", "peach", "pear"]},
        {"fruits": ["strawberry", "apple", "kiwi", "peach", "pear", "banana"]},
    ),
}


def _seeded(slug):
    return {**EMPTY, **DETAILS[slug]}


def _matches(sample, values):
    return all((sample.decoration.slug if name == "decoration" else getattr(sample, name)) == value for name, value in values.items())


def _apply(sample, values, Decoration):
    """Escribe `values` en la muestra; `False` si la decoración que pide ya no existe."""
    for name, value in values.items():
        if name == "decoration":
            decoration = Decoration.objects.filter(slug=value).first()
            if decoration is None:
                return False
            sample.decoration = decoration
        else:
            setattr(sample, name, value)
    return True


def _samples(apps):
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    return Sample.objects.select_related("decoration", "product").filter(product__slug__in=DETAILS)


def seed(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for sample in _samples(apps):
        slug = sample.product.slug
        changed = False
        if _matches(sample, EMPTY):
            _apply(sample, DETAILS[slug], Decoration)
            changed = True
        if slug in CORRECTIONS:
            before, after = CORRECTIONS[slug]
            if _matches(sample, before) and _apply(sample, after, Decoration):
                changed = True
        if changed:
            sample.save()


def unseed(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for sample in _samples(apps):
        slug = sample.product.slug
        changed = False
        if _matches(sample, _seeded(slug)):
            _apply(sample, EMPTY, Decoration)
            changed = True
        if slug in CORRECTIONS:
            before, after = CORRECTIONS[slug]
            if _matches(sample, after) and _apply(sample, before, Decoration):
                changed = True
        if changed:
            sample.save()


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0051_sample_design_details"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
