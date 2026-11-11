"""Siembra los diseños concretos de la decoración (paso 6, D53).

La `0005` sembró cinco decoraciones (`ninguna`, `duya`, `flores`, `chispas`, `otra`). El
usuario decidió el 10 de noviembre de 2026 que el patrón con duya son cuatro diseños, cada
uno con su propio precio: borde de conchas, rosetones, festones colgantes y olanes. Esta
migración:

- renombra `duya` como "Borde de conchas" (el identificador no cambia: la vista previa y
  los borradores ya lo conocen) y agrega `rosetones`, `festones` y `olanes`;
- ajusta la descripción de `flores`;
- reordena `flores`, `chispas` y `otra` para que los cuatro diseños de duya queden juntos.

Los precios de los diseños son PENDIENTE: no se siembran. Todo lo que la pastelería cambió
en el admin no se pisa: el nombre, la descripción y el orden solo se cambian si siguen como
los sembró la `0005`, y una fila nueva no se crea si ya existe su identificador o su nombre.

La reversa devuelve el nombre, la descripción y el orden que siguen como los sembró esta
migración (y no renombra `duya` si otra fila ya tiene su nombre anterior) y borra solo los
diseños nuevos que siguen exactamente como se sembraron: uno con precio, o con cualquier
otro dato editado, se queda, porque borrarlo perdería lo que capturó la pastelería.
"""
from django.db import migrations

# (campo, valor de la `0005`, valor de esta migración) por identificador.
TEXT_CHANGES = [
    ("duya", "name", "Patrón con duya", "Borde de conchas"),
    ("duya", "description", "Líneas y festones de crema", "Conchas de duya estrella arriba y abajo de cada piso"),
    ("flores", "description", "Flores hechas con duya", "Florecitas de crema hechas con duya, con hojitas verdes"),
]
# (identificador, orden de la `0005`, orden de esta migración)
SORT_CHANGES = [("flores", 3, 6), ("chispas", 4, 7), ("otra", 5, 8)]
# (identificador, nombre, descripción, orden), todos de precio fijo y sin precio.
NEW_DESIGNS = [
    ("rosetones", "Rosetones", "Rosetas en espiral alrededor del borde de arriba", 3),
    ("festones", "Festones colgantes", "Guirnaldas de crema que cuelgan del borde, con perlitas", 4),
    ("olanes", "Olanes", "Ondas de crema por el costado, con duya de pétalo", 5),
]


def seed(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for slug, field, before, after in TEXT_CHANGES:
        # Un nombre ya tomado por otra fila (único) se deja como está.
        if field == "name" and Decoration.objects.filter(name=after).exists():
            continue
        Decoration.objects.filter(slug=slug, **{field: before}).update(**{field: after})
    for slug, before, after in SORT_CHANGES:
        Decoration.objects.filter(slug=slug, sort_order=before).update(sort_order=after)
    for slug, name, description, sort_order in NEW_DESIGNS:
        if Decoration.objects.filter(slug=slug).exists() or Decoration.objects.filter(name=name).exists():
            continue
        Decoration.objects.create(
            slug=slug, name=name, description=description, pricing="fixed", price=None, sort_order=sort_order
        )


def restore(apps, schema_editor):
    Decoration = apps.get_model("core_pasteleria", "DecorationOption")
    for slug, field, before, after in TEXT_CHANGES:
        # Un nombre ya tomado por otra fila (único) se deja como está, igual que al sembrar.
        if field == "name" and Decoration.objects.filter(name=before).exists():
            continue
        Decoration.objects.filter(slug=slug, **{field: after}).update(**{field: before})
    for slug, before, after in SORT_CHANGES:
        Decoration.objects.filter(slug=slug, sort_order=after).update(sort_order=before)
    # Solo se borra lo que sigue exactamente como lo sembró esta migración: una fila que la pastelería editó (aunque no
    # le haya puesto precio) se queda.
    for slug, name, description, sort_order in NEW_DESIGNS:
        Decoration.objects.filter(
            slug=slug, name=name, description=description, sort_order=sort_order, pricing="fixed", price__isnull=True
        ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core_pasteleria", "0022_cake_mold_limits"),
    ]

    operations = [migrations.RunPython(seed, restore)]
