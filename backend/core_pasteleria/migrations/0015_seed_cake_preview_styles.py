"""Siembra cómo se ven el pan choco-vainilla y los rellenos en la vista previa (D50).

Choco-vainilla toma de dos colores: arriba el del pan de chocolate y abajo el
de vainilla, leídos de esas filas si existen. Los sabores toman su estilo y el
color de sus trozos según lo que pidió la dueña el 7 de noviembre de 2026:
rebanadas de fruta (durazno, fresa), trozos de galleta (galleta) y granillo
(choco vainilla, capuchino, chocolate). Zarzamora, cajeta y los demás quedan
lisos. Los colores son un punto de partida que la pastelería edita en el admin.
Solo se llena lo que sigue vacío: no pisa lo que ya cambió el admin. La reversa
no borra nada.
"""
from django.db import migrations

# Respaldo si no existen las filas de chocolate o vainilla (los de la semilla 0005).
CHOCOLATE_FALLBACK = "#805438"
VAINILLA_FALLBACK = "#F0CE8A"

# (slug, estilo, color de los trozos)
FLAVOR_STYLES = [
    ("durazno", "fruit_slices", "#FBD08F"),
    ("fresa", "fruit_slices", "#C8283A"),
    ("galleta", "cookie_chunks", "#2B1D1A"),
    ("choco_vainilla", "sprinkles", "#FFFBFB"),
    ("capuchino", "sprinkles", "#5A3A28"),
    ("chocolate", "sprinkles", "#3A2218"),
]


def seed(apps, schema_editor):
    Bread = apps.get_model("core_pasteleria", "Bread")
    FillingFlavor = apps.get_model("core_pasteleria", "FillingFlavor")

    def color_of(slug, fallback):
        bread = Bread.objects.filter(slug=slug).first()
        return (bread.preview_color if bread and bread.preview_color else "") or fallback

    choco_vainilla = Bread.objects.filter(slug="choco_vainilla").first()
    if choco_vainilla and not choco_vainilla.preview_color and not choco_vainilla.preview_color_bottom:
        choco_vainilla.preview_color = color_of("chocolate", CHOCOLATE_FALLBACK)
        choco_vainilla.preview_color_bottom = color_of("vainilla", VAINILLA_FALLBACK)
        choco_vainilla.save(update_fields=["preview_color", "preview_color_bottom"])

    for slug, style, secondary in FLAVOR_STYLES:
        FillingFlavor.objects.filter(slug=slug, preview_style="smooth", preview_color_secondary="").update(
            preview_style=style, preview_color_secondary=secondary
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0014_cake_preview_styles_and_tier_minimums"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
