"""Catálogo: productos, precios de catálogo y presentaciones a la venta."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.urls import reverse

from core_pasteleria.models import (
    Bread,
    CakeType,
    CatalogPrice,
    FillingBase,
    FillingFlavor,
    Product,
    ProductOffering,
)

seed_module = importlib.import_module("core_pasteleria.migrations.0009_seed_catalog")

pytestmark = pytest.mark.django_db


def rejected(operation):
    with pytest.raises(IntegrityError), transaction.atomic():
        operation()


def build_product(**overrides):
    values = {
        "name": "Producto de prueba",
        "slug": "producto-de-prueba",
        "category": "cake",
        "summary": "Resumen",
    }
    return Product(**{**values, **overrides})


def make_product(**overrides):
    product = build_product(**overrides)
    product.save()
    return product


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


# --- Restricciones de la base ---


@pytest.mark.parametrize(
    "field, value",
    [
        ("cake_type", "tres_leches"),
        ("bread", lambda: Bread.objects.get(slug="vainilla")),
        ("filling_base", lambda: FillingBase.objects.get(slug="normal")),
        ("filling_flavor", lambda: FillingFlavor.objects.get(slug="nuez")),
    ],
)
def test_dessert_with_any_cake_field_is_rejected(field, value):
    value = value() if callable(value) else value
    # Se agregan los campos que cada uno necesita para aislar la regla del postre.
    extra = {"cake_type": "tres_leches"} if field != "cake_type" else {}
    if field == "filling_flavor":
        extra["filling_base"] = FillingBase.objects.get(slug="normal")
    rejected(lambda: make_product(category="dessert", **{field: value}, **extra))


def test_dessert_without_cake_fields_is_accepted():
    make_product(category="dessert").full_clean()


def test_flavor_without_base_is_rejected():
    rejected(
        lambda: make_product(
            cake_type="tres_leches", filling_flavor=FillingFlavor.objects.get(slug="nuez")
        )
    )


def test_base_without_cake_type_is_rejected():
    rejected(lambda: make_product(filling_base=FillingBase.objects.get(slug="normal")))


def test_bread_without_cake_type_is_rejected():
    rejected(lambda: make_product(bread=Bread.objects.get(slug="vainilla")))


def test_complete_cake_definition_is_accepted():
    make_product(
        cake_type="tres_leches",
        bread=Bread.objects.get(slug="vainilla"),
        filling_base=FillingBase.objects.get(slug="normal"),
        filling_flavor=FillingFlavor.objects.get(slug="nuez"),
    ).full_clean()


def test_repeated_presentation_is_rejected():
    offering = ProductOffering.objects.filter(presentation="whole").first()
    rejected(
        lambda: ProductOffering.objects.create(
            product=offering.product, presentation="whole", price=offering.price
        )
    )


def test_same_presentation_in_another_product_is_accepted():
    product = make_product()
    ProductOffering.objects.create(
        product=product, presentation="whole", price=CatalogPrice.objects.get(name="Pastel mini")
    ).full_clean()


def test_catalog_price_must_be_positive():
    rejected(lambda: CatalogPrice.objects.create(name="Gratis", amount=Decimal("0")))


def test_catalog_price_name_is_unique():
    rejected(lambda: CatalogPrice.objects.create(name="Pastel mini", amount=Decimal("1")))


def test_price_in_use_cannot_be_deleted():
    price = CatalogPrice.objects.get(name="Pastel mini")
    with pytest.raises(ProtectedError):
        price.delete()


def test_deleting_a_product_deletes_its_offerings():
    product = Product.objects.get(slug="red-velvet")
    product.delete()
    assert not ProductOffering.objects.filter(product__slug="red-velvet").exists()


# --- clean() ---


def test_clean_rejects_a_flavor_that_the_base_does_not_offer():
    product = build_product(
        cake_type="tres_leches",
        filling_base=FillingBase.objects.get(slug="queso"),
        filling_flavor=FillingFlavor.objects.get(slug="nuez"),
    )
    with pytest.raises(ValidationError) as error:
        product.clean()
    assert "base" in error.value.message_dict["filling_flavor"][0]


def test_clean_rejects_a_flavor_that_the_cake_type_does_not_allow():
    product = build_product(
        cake_type="envinado",
        filling_base=FillingBase.objects.get(slug="normal"),
        filling_flavor=FillingFlavor.objects.get(slug="fresa_yogurt"),
    )
    with pytest.raises(ValidationError) as error:
        product.clean()
    assert "tipo de pastel" in error.value.message_dict["filling_flavor"][0]


def test_clean_rejects_a_bread_that_the_cake_type_does_not_allow():
    product = build_product(cake_type="tres_leches", bread=Bread.objects.get(slug="red_velvet"))
    with pytest.raises(ValidationError) as error:
        product.clean()
    assert "bread" in error.value.message_dict


def test_clean_rejects_a_full_price_bread_with_a_filling_base():
    product = build_product(
        cake_type=CakeType.SECO,
        bread=Bread.objects.get(slug="red_velvet"),
        filling_base=FillingBase.objects.get(slug="normal"),
    )
    with pytest.raises(ValidationError) as error:
        product.clean()
    assert "filling_base" in error.value.message_dict


def test_clean_accepts_a_full_price_bread_without_base():
    build_product(cake_type=CakeType.SECO, bread=Bread.objects.get(slug="choco_pinguino")).clean()


def test_clean_ignores_empty_relations():
    build_product().clean()


# --- Nombres de archivo de las fotos ---

GOOD_PHOTOS = ["tres-leches-durazno.webp", "a.jpg", "foto-1.jpeg", "7.png", "x-y-z.avif"]
BAD_PHOTOS = [
    "../secreto.webp", "carpeta/foto.webp", "/etc/passwd.png", "http://x.test/foto.webp",
    "https://x.test/foto.webp", "foto.webp?x=1", "foto.gif", "foto", "Foto.webp", "FOTO.WEBP",
    "-foto.webp", ".webp", "foto con espacio.webp", "foto.webp\n", "foto.webp.exe", "foto_1.webp",
]


@pytest.mark.parametrize("photo", GOOD_PHOTOS)
def test_photo_accepts_a_static_file_name(photo):
    build_product(photo=photo).full_clean()
    product = Product.objects.get(slug="imposible")
    ProductOffering(product=product, presentation="mini", price=CatalogPrice.objects.first(), photo=photo).full_clean()


@pytest.mark.parametrize("photo", BAD_PHOTOS)
def test_photo_rejects_urls_paths_and_other_extensions(photo):
    with pytest.raises(ValidationError) as product_error:
        build_product(photo=photo).full_clean()
    assert "photo" in product_error.value.message_dict
    offering = ProductOffering(
        product=Product.objects.get(slug="imposible"),
        presentation="mini",
        price=CatalogPrice.objects.first(),
        photo=photo,
    )
    with pytest.raises(ValidationError) as offering_error:
        offering.full_clean()
    assert "photo" in offering_error.value.message_dict


def test_empty_photo_is_allowed_and_means_pending():
    build_product(photo="").full_clean()


# --- Semilla ---


def test_seeded_products_are_14_cakes_and_8_desserts():
    assert Product.objects.filter(category="cake").count() == 14
    assert Product.objects.filter(category="dessert").count() == 8


def test_seeded_catalog_prices_are_the_20_cells_of_section_2():
    prices = {p.name: p.amount for p in CatalogPrice.objects.all()}
    assert len(prices) == 20
    assert prices == {
        "Pastel de sabor normal, completo": Decimal("350"),
        "Pastel de sabor normal, rebanada": Decimal("35"),
        "Pastel con queso o con flan, completo": Decimal("420"),
        "Pastel con queso o con flan, rebanada": Decimal("40"),
        "Choco-pingüino, completo": Decimal("350"),
        "Choco-pingüino, rebanada": Decimal("35"),
        "Red velvet, completo": Decimal("450"),
        "Pastel mini": Decimal("130"),
        "Imposible, completo": Decimal("350"),
        "Imposible, rebanada": Decimal("35"),
        "Posible, completo": Decimal("350"),
        "Posible, rebanada": Decimal("35"),
        "Flan napolitano, grande": Decimal("360"),
        "Flan napolitano, individual": Decimal("35"),
        "Tarta de frutas, grande": Decimal("290"),
        "Tarta de frutas, mini": Decimal("35"),
        "Gelatina de molde": Decimal("290"),
        "Gelatina Mosaico con crema (vaso)": Decimal("20"),
        "Gelatina Mosaico con yogurt (vaso)": Decimal("20"),
        "Gelatina de Duvalín (vaso)": Decimal("25"),
    }


def test_seeded_weights_and_servings_match_the_rules_and_pending_ones_are_empty():
    def info(name):
        price = CatalogPrice.objects.get(name=name)
        return price.approx_weight_kg, price.servings

    for name in (
        "Pastel de sabor normal, completo",
        "Pastel con queso o con flan, completo",
        "Choco-pingüino, completo",
    ):
        assert info(name) == (Decimal("2.7"), 19)
    assert info("Pastel mini") == (None, 3)
    # PENDIENTE: el peso del Red velvet completo no se inventa.
    assert info("Red velvet, completo") == (None, None)


def test_seeded_offerings_are_47_and_each_priced_by_group():
    assert ProductOffering.objects.count() == 47
    by_product = {}
    for offering in ProductOffering.objects.select_related("product", "price"):
        by_product.setdefault(offering.product.slug, {})[offering.presentation] = offering.price.amount
    normal = {"whole": Decimal("350"), "slice": Decimal("35"), "mini": Decimal("130")}
    for slug in (
        "tres-leches-de-durazno", "tres-leches-de-fresa", "tres-leches-de-zarzamora",
        "tres-leches-de-cajeta", "tres-leches-de-galleta", "tres-leches-de-chocolate",
        "tres-leches-de-choco-vainilla", "tres-leches-de-capuchino",
    ):
        assert by_product[slug] == normal
    for slug in (
        "tres-leches-con-queso-y-chocolate", "tres-leches-con-queso-y-zarzamora",
        "tres-leches-con-flan-y-cajeta", "tres-leches-con-flan-y-zarzamora",
    ):
        assert by_product[slug] == {"whole": Decimal("420"), "slice": Decimal("40")}
    assert by_product["choco-pinguino"] == {"whole": Decimal("350"), "slice": Decimal("35")}
    assert by_product["red-velvet"] == {"whole": Decimal("450")}
    assert by_product["imposible"] == {"whole": Decimal("350"), "slice": Decimal("35")}
    assert by_product["posible"] == {"whole": Decimal("350"), "slice": Decimal("35")}
    assert by_product["flan-napolitano"] == {"large": Decimal("360"), "individual": Decimal("35")}
    assert by_product["tarta-de-frutas"] == {"large": Decimal("290"), "mini": Decimal("35")}
    assert by_product["gelatina-de-molde"] == {"whole": Decimal("290")}
    assert by_product["mosaico-con-crema"] == {"cup": Decimal("20")}
    assert by_product["mosaico-con-yogurt"] == {"cup": Decimal("20")}
    assert by_product["gelatina-de-duvalin"] == {"cup": Decimal("25")}


def test_there_is_no_mini_with_cheese_or_flan():
    assert not ProductOffering.objects.filter(
        presentation="mini", product__filling_base__slug__in=["queso", "flan"]
    ).exists()
    mini_cakes = ProductOffering.objects.filter(presentation="mini", product__category="cake")
    assert mini_cakes.count() == 8
    assert all(o.product.filling_base.slug == "normal" for o in mini_cakes)


def test_cup_gelatins_are_showcase_only():
    cups = Product.objects.filter(offerings__presentation="cup")
    assert cups.count() == 3
    assert set(cups.values_list("sales_channel", flat=True)) == {"showcase_only"}
    assert Product.objects.filter(sales_channel="showcase_only").count() == 3


def test_red_velvet_is_order_only_and_the_only_one():
    assert Product.objects.get(slug="red-velvet").sales_channel == "order_only"
    assert list(Product.objects.filter(sales_channel="order_only")) == [Product.objects.get(slug="red-velvet")]


def test_seeded_cake_definitions_follow_the_menu():
    assert Product.objects.get(slug="choco-pinguino").cake_type == "seco"
    assert Product.objects.get(slug="red-velvet").cake_type == "seco"
    three_milks = Product.objects.filter(category="cake").exclude(slug__in=["choco-pinguino", "red-velvet"])
    assert three_milks.count() == 12
    assert set(three_milks.values_list("cake_type", flat=True)) == {"tres_leches"}
    flavored = Product.objects.get(slug="tres-leches-con-queso-y-zarzamora")
    assert (flavored.filling_base.slug, flavored.filling_flavor.slug) == ("queso", "zarzamora")


def test_only_choco_pinguino_and_red_velvet_have_a_bread_in_the_seed():
    # Regla 4.3 fija el pan de esos dos. El de los demás pasteles es PENDIENTE.
    with_bread = dict(Product.objects.filter(bread__isnull=False).values_list("slug", "bread__slug"))
    assert with_bread == {"choco-pinguino": "choco_pinguino", "red-velvet": "red_velvet"}
    assert Product.objects.filter(bread__isnull=True).count() == 20


def test_choco_pinguino_and_red_velvet_keep_their_definition_after_getting_a_bread():
    for slug in ("choco-pinguino", "red-velvet"):
        product = Product.objects.get(slug=slug)
        assert product.cake_type == "seco"
        assert product.filling_base_id is None and product.filling_flavor_id is None
        product.full_clean()


def test_pending_data_is_left_empty():
    # PENDIENTE: pan de los demás pasteles, fotos, conservación y transporte.
    assert not Product.objects.exclude(photo="").exists()
    assert not Product.objects.exclude(storage_notes="").exists()
    assert not Product.objects.exclude(transport_notes="").exists()
    assert not ProductOffering.objects.exclude(photo="").exists()


def test_every_seeded_row_passes_full_validation():
    for model in (CatalogPrice, Product, ProductOffering):
        for row in model.objects.all():
            row.full_clean()


def test_no_seeded_product_uses_a_blocked_combination():
    # Reglas 4.7: Fresa con yogurt no va en envinado; nada sembrado la usa.
    assert not Product.objects.filter(filling_flavor__slug="fresa_yogurt").exists()
    assert not Product.objects.filter(cake_type="envinado").exists()


def test_seed_can_run_again_without_duplicating_or_overwriting():
    CatalogPrice.objects.filter(name="Pastel mini").update(amount=Decimal("140.00"))
    Product.objects.filter(slug="imposible").update(summary="Editado por la pastelería.")
    ProductOffering.objects.filter(product__slug="posible", presentation="slice").delete()
    seed_module.seed_catalog(apps, None)
    assert Product.objects.count() == 22
    assert CatalogPrice.objects.count() == 20
    assert ProductOffering.objects.count() == 47
    assert CatalogPrice.objects.get(name="Pastel mini").amount == Decimal("140.00")
    assert Product.objects.get(slug="imposible").summary == "Editado por la pastelería."


# --- Admin ---


def test_catalog_admin_pages_load(superuser_client):
    for name in ("product", "catalogprice"):
        assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_changelist")).status_code == 200
        assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_add")).status_code == 200
    product = Product.objects.get(slug="tres-leches-de-fresa")
    response = superuser_client.get(reverse("admin:core_pasteleria_product_change", args=[product.pk]))
    assert response.status_code == 200
    assert len(response.context["inline_admin_formsets"][0].formset.forms) >= 3


def test_product_list_shows_pending_photo(superuser_client):
    response = superuser_client.get(reverse("admin:core_pasteleria_product_changelist"))
    assert "PENDIENTE" in response.content.decode()


def test_admin_rejects_a_dessert_with_cake_fields(superuser_client):
    response = superuser_client.post(
        reverse("admin:core_pasteleria_product_add"),
        {
            "name": "Postre raro", "slug": "postre-raro", "category": "dessert",
            "sales_channel": "showcase_and_order", "summary": "x", "cake_type": "seco",
            "sort_order": 0, "is_active": "on",
            "offerings-TOTAL_FORMS": 0, "offerings-INITIAL_FORMS": 0,
        },
    )
    assert response.status_code == 200
    errors = response.context["adminform"].form.non_field_errors()
    assert "Un postre no lleva tipo de pastel, pan, base ni sabor de relleno." in errors
    assert not Product.objects.filter(slug="postre-raro").exists()
