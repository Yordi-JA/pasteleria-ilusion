"""La muestra del modelo de un producto (D86): cómo se ve en el modelo 3D y la imagen fija que la tarjeta del catálogo muestra.

Cubre el modelo y su validación, el admin (en línea en el producto), la migración de datos que siembra las 8 muestras
observadas en las fotos y lo que la API del catálogo entrega (`model_image` en las tarjetas y la vitrina, `sample_design`
en la ficha).
"""
import importlib
import re
from datetime import date, datetime
from datetime import timezone as dt_timezone
from pathlib import Path

import pytest
from django.apps import apps
from django.contrib import admin as django_admin
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core_pasteleria.admin import ProductSampleDesignInline
from core_pasteleria.models import (
    DecorationOption,
    FruitKind,
    FruitLayout,
    Inventory,
    Product,
    ProductOffering,
    ProductSampleDesign,
)

migration = importlib.import_module("core_pasteleria.migrations.0050_seed_product_sample_designs")
# La `0052` siembra los detalles de la imagen y corrige tres datos de la `0050`; su reversa deja la muestra como la sembró la `0050`.
details_migration = importlib.import_module("core_pasteleria.migrations.0052_seed_sample_design_details")

pytestmark = pytest.mark.django_db

TODAY = date(2026, 11, 6)
NOON_TODAY = datetime(2026, 11, 6, 18, 0, tzinfo=dt_timezone.utc)

PRODUCTS_URL = "/api/v1/products/"
FEATURED_URL = "/api/v1/featured-products/"
SHOWCASE_URL = "/api/v1/showcase/"
SLICES_URL = "/api/v1/slices/"

# Lo que se observó en cada foto (análisis del 18 de noviembre de 2026): cobertura, decoración y su color, fruta y peinado.
OBSERVED = {
    "tres-leches-de-cajeta": ("#C8742F", "rosetones", "#F8F0E7", "mound", ["strawberry", "apple", "grape", "peach", "physalis"], True),
    "tres-leches-de-capuchino": ("#B3A188", "rosetones", "#E2D3B5", "mound", ["strawberry", "apple", "kiwi", "peach", "pear", "starfruit"], False),
    "tres-leches-de-choco-vainilla": ("#A88470", "chispas-choco-vainilla", "", "mound", ["strawberry", "apple", "kiwi", "peach", "pear"], False),
    "tres-leches-de-durazno": ("#E2B21C", "ninguna", "", "mound", ["strawberry", "apple", "kiwi", "pear"], False),
    "tres-leches-de-fresa": ("#F2EDE7", "ninguna", "", "mound", ["strawberry", "apple", "kiwi", "peach", "starfruit"], False),
    "tres-leches-de-galleta": ("#EBE3DC", "rosetones", "#F3EEE9", "mound", ["strawberry", "apple", "kiwi", "pear", "starfruit"], False),
    "tres-leches-con-flan-y-cajeta": ("#9C5E32", "rosetones", "#F1E8DC", "rows", ["strawberry", "apple", "kiwi", "starfruit"], False),
    "tres-leches-con-queso-y-chocolate": ("#8E6B57", "duya", "#8E6B57", "mound", ["strawberry", "apple", "kiwi", "peach", "starfruit"], False),
}


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture(autouse=True)
def bakery_clock(monkeypatch):
    monkeypatch.setattr(timezone, "now", lambda: NOON_TODAY)


def sample_of(slug):
    return ProductSampleDesign.objects.select_related("decoration").get(product__slug=slug)


def decoration(slug):
    return DecorationOption.objects.get(slug=slug)


def new_sample(slug="tres-leches-de-zarzamora", **fields):
    """Una muestra sin guardar de un pastel que la semilla no toca, válida salvo lo que se cambie."""
    values = {
        "product": Product.objects.get(slug=slug),
        "coverage_color": "#F2EDE7",
        "decoration": decoration("rosetones"),
        "decoration_color": "#F3EEE9",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "kiwi"],
        "side_comb": True,
        "model_image": f"{slug}-modelo.webp",
        "show_model_in_catalog": True,
        **fields,
    }
    return ProductSampleDesign(**values)


def errors_of(sample):
    with pytest.raises(ValidationError) as caught:
        sample.full_clean()
    return caught.value.message_dict


# --- Modelo ---


def test_a_complete_sample_is_valid():
    new_sample().full_clean()


def test_a_sample_without_fruit_or_decoration_color_is_valid():
    new_sample(decoration=decoration("ninguna"), decoration_color="", fruit_layout="", fruits=[]).full_clean()


@pytest.mark.parametrize("color", ["F2EDE7", "#F2EDE", "#F2EDE7FF", "rojo", ""])
def test_the_coverage_color_must_be_a_hex_color(color):
    assert "coverage_color" in errors_of(new_sample(coverage_color=color))


def test_the_decoration_color_must_be_a_hex_color():
    assert "decoration_color" in errors_of(new_sample(decoration_color="blanco"))


def test_another_decoration_cannot_be_drawn():
    assert "decoration" in errors_of(new_sample(decoration=decoration("otra"), decoration_color=""))


def test_a_decoration_color_only_goes_with_a_decoration_that_takes_one():
    errors = errors_of(new_sample(decoration=decoration("chispas-choco-vainilla"), decoration_color="#FFFFFF"))
    assert errors["decoration_color"] == ["Esta decoración no lleva color propio: deja el color vacío."]


def test_fruit_needs_its_layout_and_a_layout_needs_fruit():
    assert errors_of(new_sample(fruit_layout="", fruits=["kiwi"]))["fruit_layout"] == [
        "Elige cómo va la fruta, o quita la fruta."
    ]
    assert errors_of(new_sample(fruit_layout="ring", fruits=[]))["fruits"] == ["Elige al menos una fruta, o quita cómo va."]


def test_a_fruit_goes_once_and_must_be_known():
    assert errors_of(new_sample(fruits=["kiwi", "kiwi"]))["fruits"] == ["Cada fruta va una sola vez."]
    assert "fruits" in errors_of(new_sample(fruits=["mango"]))


def test_showing_the_model_in_the_catalog_needs_its_image():
    errors = errors_of(new_sample(model_image=""))
    assert errors["model_image"] == ["Para mostrarla en el catálogo, escribe el archivo de la imagen del modelo."]
    new_sample(model_image="", show_model_in_catalog=False).full_clean()


@pytest.mark.parametrize("name", ["/fotos/a.webp", "https://x.test/a.webp", "A.webp", "a.gif"])
def test_the_model_image_is_only_a_file_name(name):
    assert "model_image" in errors_of(new_sample(model_image=name))


def test_only_a_cake_has_a_sample():
    errors = errors_of(new_sample(slug="imposible"))
    assert errors["product"] == ["Solo un pastel lleva muestra del modelo."]


def test_the_database_rejects_showing_it_without_an_image():
    with pytest.raises(IntegrityError), transaction.atomic():
        new_sample(model_image="").save()


def test_the_database_rejects_fruit_without_layout_and_unknown_fruit():
    with pytest.raises(IntegrityError), transaction.atomic():
        new_sample(fruit_layout="", fruits=["kiwi"]).save()
    with pytest.raises(IntegrityError), transaction.atomic():
        new_sample(fruits=["mango"]).save()


def test_a_product_has_one_sample_at_most():
    with pytest.raises(IntegrityError), transaction.atomic():
        new_sample(slug="tres-leches-de-cajeta").save()


def test_the_help_text_says_the_seed_was_observed_in_the_photo():
    for name in ("coverage_color", "decoration", "decoration_color", "fruit_layout", "fruits", "side_comb"):
        assert "observado en la foto; la pastelería puede corregirlo" in ProductSampleDesign._meta.get_field(name).help_text


def frontend_union(name):
    """Los valores de un tipo unión de `frontend/src/three/cakeShape.ts` (`export type X = 'a' | 'b'`)."""
    source = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "three" / "cakeShape.ts").read_text(encoding="utf-8")
    union = re.search(rf"export type {name} = ([^\n]+)", source).group(1)
    return set(re.findall(r"'([a-z_]+)'", union))


def test_the_fruits_and_layouts_are_the_ones_the_model_draws():
    """El admin solo ofrece lo que sabe dibujar la escena (`fruit.ts`): los mismos valores en los dos lados."""
    assert set(FruitKind.values) == frontend_union("FruitKind")
    assert set(FruitLayout.values) == frontend_union("FruitLayoutKind")


# --- Semilla ---


def test_the_seed_gives_the_eight_products_with_a_photo_their_observed_sample():
    details_migration.unseed(apps, None)
    assert ProductSampleDesign.objects.count() == len(OBSERVED)
    for slug, (coverage, decoration_slug, decoration_color, layout, fruits, comb) in OBSERVED.items():
        sample = sample_of(slug)
        assert (
            sample.coverage_color,
            sample.decoration.slug,
            sample.decoration_color,
            sample.fruit_layout,
            sample.fruits,
            sample.side_comb,
            sample.model_image,
            sample.show_model_in_catalog,
        ) == (coverage, decoration_slug, decoration_color, layout, fruits, comb, f"{slug}-modelo.webp", True), slug
        sample.full_clean()


def test_running_the_seed_again_changes_nothing():
    migration.seed(apps, None)
    assert ProductSampleDesign.objects.count() == len(OBSERVED)


def test_the_seed_does_not_overwrite_what_the_admin_changed():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(coverage_color="#FFFFFF", show_model_in_catalog=False)
    migration.seed(apps, None)
    sample = sample_of("tres-leches-de-fresa")
    assert (sample.coverage_color, sample.show_model_in_catalog) == ("#FFFFFF", False)


def test_the_seed_fills_in_a_sample_that_is_missing():
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-durazno").delete()
    migration.seed(apps, None)
    assert sample_of("tres-leches-de-durazno").coverage_color == "#E2B21C"


def test_the_seed_skips_a_product_that_is_gone_or_a_decoration_that_is_missing():
    ProductSampleDesign.objects.all().delete()
    Product.objects.filter(slug="tres-leches-de-durazno").update(slug="durazno-renombrado")
    DecorationOption.objects.filter(slug="duya").update(slug="duya-renombrada")
    migration.seed(apps, None)
    seeded = set(ProductSampleDesign.objects.values_list("product__slug", flat=True))
    assert seeded == set(OBSERVED) - {"tres-leches-de-durazno", "tres-leches-con-queso-y-chocolate"}


def test_the_reverse_deletes_only_the_samples_still_as_seeded():
    details_migration.unseed(apps, None)
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-galleta").update(side_comb=True)
    migration.unseed(apps, None)
    assert list(ProductSampleDesign.objects.values_list("product__slug", flat=True)) == ["tres-leches-de-galleta"]
    assert Product.objects.filter(slug="tres-leches-de-fresa").exists()


# --- Admin ---


@pytest.fixture
def superuser_client(client, django_user_model):
    user = django_user_model.objects.create_superuser("admin@pasteleria.test", "clave-de-prueba-123")
    client.force_login(user)
    return client


def test_the_product_admin_edits_the_sample_inline():
    inlines = django_admin.site._registry[Product].inlines
    assert ProductSampleDesignInline in inlines
    assert ProductSampleDesignInline.max_num == 1


def change_data(product, **sample):
    """El formulario de cambio del producto tal como lo manda el admin, con su muestra."""
    offerings = list(product.offerings.order_by("sort_order", "id"))
    data = {
        "name": product.name, "slug": product.slug, "category": product.category,
        "sales_channel": product.sales_channel, "summary": product.summary, "description": product.description,
        "cake_type": product.cake_type or "", "bread": product.bread_id or "",
        "filling_base": product.filling_base_id or "", "filling_flavor": product.filling_flavor_id or "",
        "storage_notes": "", "transport_notes": "", "photo": product.photo, "sort_order": product.sort_order,
        "is_active": "on",
        "offerings-TOTAL_FORMS": len(offerings), "offerings-INITIAL_FORMS": len(offerings),
        "offerings-MIN_NUM_FORMS": 0, "offerings-MAX_NUM_FORMS": 1000,
    }
    for i, offering in enumerate(offerings):
        data.update({
            f"offerings-{i}-id": offering.id, f"offerings-{i}-product": product.id,
            f"offerings-{i}-presentation": offering.presentation, f"offerings-{i}-price": offering.price_id,
            f"offerings-{i}-photo": offering.photo, f"offerings-{i}-sort_order": offering.sort_order,
            f"offerings-{i}-is_active": "on" if offering.is_active else "",
        })
    existing = ProductSampleDesign.objects.filter(product=product).first()
    data.update({
        "sample_design-TOTAL_FORMS": 1, "sample_design-INITIAL_FORMS": 1 if existing else 0,
        "sample_design-MIN_NUM_FORMS": 0, "sample_design-MAX_NUM_FORMS": 1,
        "sample_design-0-product": product.id,
        # El admin manda el tamaño de las piezas del borde con su valor inicial (tanda 4b).
        "sample_design-0-edge_size": 1.0,
        "sample_design-0-fruit_density": 1.0,
        "sample_design-0-sprinkle_density": 1.0,
        "sample_design-0-edge_inset": 0.0,
    })
    if existing:
        data["sample_design-0-id"] = existing.id
    for name, value in sample.items():
        if isinstance(value, list):
            data[f"sample_design-0-{name}"] = value
        elif value is True:
            data[f"sample_design-0-{name}"] = "on"
        elif value is not False:
            data[f"sample_design-0-{name}"] = value
    return data


def test_the_admin_saves_a_sample_from_the_product_form(superuser_client):
    product = Product.objects.get(slug="tres-leches-de-zarzamora")
    response = superuser_client.post(
        reverse("admin:core_pasteleria_product_change", args=[product.pk]),
        change_data(
            product, coverage_color="#5A2A4A", decoration=decoration("festones").id, decoration_color="",
            fruit_layout="ring", fruits=["strawberry", "kiwi"], side_comb=False,
            model_image="tres-leches-de-zarzamora-modelo.webp", show_model_in_catalog=False,
        ),
    )
    assert response.status_code == 302, response.context and response.context["errors"]
    sample = sample_of("tres-leches-de-zarzamora")
    assert (sample.coverage_color, sample.fruit_layout, sample.fruits, sample.side_comb) == ("#5A2A4A", "ring", ["strawberry", "kiwi"], False)


def test_the_admin_shows_the_sample_errors_and_saves_nothing(superuser_client):
    product = Product.objects.get(slug="tres-leches-de-fresa")
    response = superuser_client.post(
        reverse("admin:core_pasteleria_product_change", args=[product.pk]),
        change_data(
            product, coverage_color="#F2EDE7", decoration=decoration("chispas-choco-vainilla").id, decoration_color="#FFFFFF",
            fruit_layout="", fruits=["kiwi"], side_comb=False, model_image="", show_model_in_catalog=True,
        ),
    )
    assert response.status_code == 200
    errors = response.context["inline_admin_formsets"][1].formset.errors[0]
    assert set(errors) >= {"decoration_color", "fruit_layout", "model_image"}
    assert sample_of("tres-leches-de-fresa").decoration.slug == "ninguna"


def test_the_admin_does_not_offer_another_decoration(superuser_client):
    product = Product.objects.get(slug="tres-leches-de-fresa")
    response = superuser_client.get(reverse("admin:core_pasteleria_product_change", args=[product.pk]))
    form = response.context["inline_admin_formsets"][1].formset.forms[0]
    offered = {choice.instance.slug for choice, _ in form.fields["decoration"].choices if choice}
    assert "otra" not in offered
    assert {"ninguna", "rosetones"} <= offered


# --- API ---


def test_the_catalog_card_gives_the_model_image_only_when_the_bakery_shows_it(api):
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    assert cards["tres-leches-de-durazno"]["model_image"] == "tres-leches-de-durazno-modelo.webp"
    assert cards["tres-leches-de-zarzamora"]["model_image"] is None
    assert cards["imposible"]["model_image"] is None
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-durazno").update(show_model_in_catalog=False)
    cards = {card["slug"]: card for card in api.get(PRODUCTS_URL).json()}
    assert cards["tres-leches-de-durazno"]["model_image"] is None


def test_the_cards_do_not_carry_the_whole_sample(api):
    card = api.get(PRODUCTS_URL).json()[0]
    assert "sample_design" not in card


def test_the_product_detail_gives_its_sample_for_the_render(api):
    body = api.get(f"{PRODUCTS_URL}tres-leches-de-cajeta/").json()
    assert body["model_image"] == "tres-leches-de-cajeta-modelo.webp"
    assert body["sample_design"] == {
        "coverage_color": "#C8742F",
        "decoration": "rosetones",
        "decoration_color": "#F8F0E7",
        "fruit_layout": "mound",
        "fruits": ["strawberry", "apple", "grape", "peach", "physalis"],
        # La `0052` le quita el peinado horizontal: la foto tiene crestas diagonales.
        "side_comb": False,
        "model_image": "tres-leches-de-cajeta-modelo.webp",
        "show_model_in_catalog": True,
        # Los detalles de la imagen del catálogo (`0052`).
        "top_color": "#F7EFE6",
        "top_glossy": False,
        "side_glossy": True,
        "side_texture": "ridges",
        "top_ring_color": None,
        "top_ring_width": None,
        "side_band_color": "#F7EFE6",
        "side_band_height": 0.08,
        "drizzle": "threads",
        "drizzle_color": "#C8742F",
        "edge_size": 1.9,
        "shells": None,
        "shell_color": None,
        "shell_second_color": None,
        "dusting_color": None,
        "side_bits": None,
        "side_bits_color": None,
        # Lo tupido de la fruta y de las chispas (`0054`): cajeta lleva la fruta tupida, como su foto.
        "fruit_density": 2.0,
        "sprinkle_density": 1.0,
        # Los copos más adentro, abrazando la fruta (`0056`).
        "edge_inset": 0.08,
    }
    assert all("model_image" in card for card in body["related"])


def test_the_detail_gives_the_sample_even_when_it_is_not_shown_and_null_without_one(api):
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(show_model_in_catalog=False, model_image="")
    body = api.get(f"{PRODUCTS_URL}tres-leches-de-fresa/").json()
    assert body["model_image"] is None
    assert body["sample_design"]["model_image"] is None
    assert body["sample_design"]["show_model_in_catalog"] is False
    assert body["sample_design"]["fruit_layout"] == "mound"
    assert api.get(f"{PRODUCTS_URL}tres-leches-de-zarzamora/").json()["sample_design"] is None


def test_the_detail_gives_no_decoration_or_fruit_layout_when_there_is_none(api):
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-fresa").update(fruit_layout="", fruits=[])
    DecorationOption.objects.filter(slug="ninguna").update(is_active=False)
    sample = api.get(f"{PRODUCTS_URL}tres-leches-de-fresa/").json()["sample_design"]
    assert (sample["decoration"], sample["decoration_color"], sample["fruit_layout"], sample["fruits"]) == (None, None, None, [])


def test_featured_cards_give_the_model_image(api):
    cards = {card["slug"]: card for card in api.get(FEATURED_URL).json()}
    assert cards["tres-leches-de-cajeta"]["model_image"] == "tres-leches-de-cajeta-modelo.webp"
    assert cards["tres-leches-de-zarzamora"]["model_image"] is None


def load_stock(slug, presentation, quantity):
    offering = ProductOffering.objects.get(product__slug=slug, presentation=presentation)
    return Inventory.objects.create(kind="showcase", offering=offering, stock_date=TODAY, quantity=quantity)


def test_the_showcase_gives_the_model_image_where_the_product_photo_goes(api):
    """La imagen del modelo toma el lugar de la foto del producto: el completo, el rebanado y lo que no tiene foto propia."""
    ProductOffering.objects.filter(product__slug="tres-leches-de-fresa", presentation="mini").update(photo="fresa-mini.webp")
    load_stock("tres-leches-de-durazno", "whole", 1)
    load_stock("tres-leches-de-fresa", "mini", 2)
    load_stock("tres-leches-de-cajeta", "slice", 6)
    load_stock("tres-leches-de-zarzamora", "whole", 1)
    showcase = {(item["product_slug"], item["presentation"]): item["model_image"] for item in api.get(SHOWCASE_URL).json()["items"]}
    assert showcase == {
        ("tres-leches-de-durazno", "whole"): "tres-leches-de-durazno-modelo.webp",
        ("tres-leches-de-fresa", "mini"): None,
        ("tres-leches-de-cajeta", "slice"): "tres-leches-de-cajeta-modelo.webp",
        ("tres-leches-de-zarzamora", "whole"): None,
    }
    slices = api.get(SLICES_URL).json()["items"]
    assert "model_image" not in slices[0]
