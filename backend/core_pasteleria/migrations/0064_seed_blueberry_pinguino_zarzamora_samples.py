"""Las fotos reales y las muestras del modelo de blueberry, choco-pingüino, queso y zarzamora y flan y zarzamora.

Las fotos son archivos estáticos del frontend (`frontend/public/fotos/<slug>.webp`, D32), recortadas de las que tomó la
pastelería (`assets/pasteles/`). Cada producto la nombra en su campo `photo` solo si sigue vacío: no pisa una foto que la
pastelería ya puso en el admin.

Cada muestra copia lo que se ve en su foto, como las de la `0050` a la `0058`: la cobertura, la tapa y su brillo, la decoración, la
franja de abajo, lo pegado al costado, los hilos, las conchas y la fruta con su acomodo. Usa lo que agrega la `0063`: la piña y la
manzana en rodajas, las franjas con rosetones entre ellas, las filas diagonales, el garabato de hilos, los huevos grandes de la mitad
de atrás, las conchas que cubren toda la tapa y las semillas de la mermelada. No son datos de la pastelería: el admin los marca como
observados y ella puede corregirlos. Las cuatro muestran su imagen del modelo en el catálogo (`<slug>-modelo.webp`, que genera
`frontend/scripts/render-models.mjs`).

Solo se crea la muestra que falta, de un pastel que existe y con una decoración que existe; correrla otra vez no cambia nada. La
reversa borra solo las muestras que siguen exactamente como se sembraron y quita la foto solo si sigue siendo esta.
"""
from django.db import migrations

# Todos los campos de la muestra salvo el producto y la decoración (una llave a otra tabla, va aparte por su `slug`).
DEFAULTS = {
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
}

# slug: (decoración, lo que cambia de `DEFAULTS`). Observado en las fotos del 21 de noviembre de 2026.
SAMPLES = {
    # Mermelada magenta brillante en el costado y la tapa más oscura; rosetones blancos en la orilla y en tres hileras entre cuatro
    # franjas de fruta (piña, kiwi, fresa y durazno); una franja delgada de crema abajo, sobre la charola.
    "tres-leches-de-blueberry": (
        "rosetones",
        {
            "coverage_color": "#A3456B",
            "decoration_color": "#F7F4EF",
            "fruit_layout": "stripes",
            "fruits": ["pineapple", "kiwi", "strawberry", "peach"],
            "fruit_density": 2.0,
            "top_color": "#5E2235",
            "top_glossy": True,
            "side_glossy": True,
            "side_band_color": "#F4EFE9",
            "side_band_height": 0.06,
            "edge_size": 1.2,
            "edge_inset": 0.03,
        },
    ),
    # Crema de chocolate con marcas de espátula y virutas pegadas; borde de duya del mismo color; huevos de chocolate boca abajo y
    # rizos que cubren toda la tapa, con azúcar glass.
    "choco-pinguino": (
        "duya",
        {
            "coverage_color": "#7A5040",
            "decoration_color": "#7A4E3A",
            "side_texture": "spatula",
            "edge_size": 1.1,
            "shells": "full",
            "shell_color": "#5E3A2A",
            "dusting_color": "#F4F0EA",
            "side_bits": "shavings",
            "side_bits_color": "#553222",
        },
    ),
    # Mermelada de zarzamora brillante con sus semillas en el costado y la tapa; crema blanca abajo; un garabato de hilos blancos en el
    # lado izquierdo; huevos grandes de chocolate blanco en la mitad de atrás; un montón de abanicos del centro hacia la derecha, donde
    # mandan la manzana roja en láminas y la pera, con fresa, algo de kiwi y poca piña; rosetones solo por el frente y la derecha.
    "tres-leches-con-queso-y-zarzamora": (
        "rosetones",
        {
            "coverage_color": "#7D2434",
            "decoration_color": "#F6EEE3",
            "fruit_layout": "fans",
            "fruits": ["apple", "pear", "strawberry", "kiwi", "pineapple"],
            "top_color": "#7A2438",
            "top_glossy": True,
            "side_glossy": True,
            "side_band_color": "#F3ECE4",
            "side_band_height": 0.1,
            "drizzle": "scribble",
            "drizzle_color": "#F6E4E4",
            "edge_size": 1.1,
            "edge_inset": 0.03,
            "shells": "back",
            "shell_color": "#F1E6CC",
            "side_bits": "seeds",
            "side_bits_color": "#2A0B10",
            "fruit_density": 1.8,
        },
    ),
    # Mermelada de zarzamora casi negra y muy brillante en la tapa y el costado; rosetones blancos alrededor; fruta en filas diagonales
    # que llenan la tapa (fresa, durazno, kiwi y manzana en rodajas); crema blanca abajo.
    "tres-leches-con-flan-y-zarzamora": (
        "rosetones",
        {
            "coverage_color": "#2E0F1F",
            "decoration_color": "#F7F1EC",
            "fruit_layout": "diagonal",
            "fruits": ["strawberry", "peach", "kiwi", "apple_slice"],
            "top_color": "#2E0F1F",
            "top_glossy": True,
            "side_glossy": True,
            "side_band_color": "#F2EAE6",
            "side_band_height": 0.08,
            "edge_size": 1.05,
            "fruit_density": 1.6,
        },
    ),
}


def photo_of(slug):
    return f"{slug}.webp"


def seeded(slug):
    """Lo que la semilla deja en la muestra, sin la decoración."""
    _, values = SAMPLES[slug]
    return {**DEFAULTS, **values, "model_image": f"{slug}-modelo.webp", "show_model_in_catalog": True}


def seed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for slug, (decoration_slug, _) in SAMPLES.items():
        Product.objects.filter(slug=slug, photo="").update(photo=photo_of(slug))
        product = Product.objects.filter(slug=slug, category="cake").first()
        decoration = Decoration.objects.filter(slug=decoration_slug).first()
        if product is None or decoration is None or Sample.objects.filter(product=product).exists():
            continue
        Sample.objects.create(product=product, decoration=decoration, **seeded(slug))


def unseed(apps, schema_editor):
    Product = apps.get_model("core_pasteleria", "Product")
    Sample = apps.get_model("core_pasteleria", "ProductSampleDesign")
    for slug, (decoration_slug, _) in SAMPLES.items():
        Sample.objects.filter(product__slug=slug, decoration__slug=decoration_slug, **seeded(slug)).delete()
        Product.objects.filter(slug=slug, photo=photo_of(slug)).update(photo="")


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0063_sample_photo_choices"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
