"""Reglas del catálogo público con el repositorio en memoria, sin PostgreSQL.

El servicio decide qué es "hoy", qué cuenta como "En vitrina hoy", qué sale en
"Pasteles de la casa" y qué es PENDIENTE (`None`); el repositorio solo consulta.
"""
import ast
import dataclasses
import inspect
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal

import pytest
from django.utils import timezone

from django.db.models import Choices

from core_pasteleria import models
from core_pasteleria.api import views
from core_pasteleria.repositories.memory import MemoryProductRepo
from core_pasteleria.repositories.records import OfferingRecord, ProductRecord
from core_pasteleria.services import catalog_service

TODAY = date(2026, 11, 6)
PRICES = {"whole": Decimal("350.00"), "slice": Decimal("35.00"), "mini": Decimal("130.00")}


def product(id, slug, category="cake", *, presentations=("whole", "slice"), featured=False, **fields):
    """Registro como lo devolvería `product_repo`, sin existencias."""
    channel = fields.pop("sales_channel", "showcase_and_order")
    photos = fields.pop("offering_photos", {})
    photo = fields.pop("photo", "")
    offerings = tuple(
        OfferingRecord(
            id=id * 10 + index,
            product_id=id,
            product_slug=slug,
            product_name=slug.capitalize(),
            category=category,
            sales_channel=channel,
            presentation=presentation,
            price=PRICES[presentation],
            approx_weight_kg=Decimal("2.7") if presentation == "whole" else None,
            servings=19 if presentation == "whole" else None,
            photo=photos.get(presentation) or photo,
            stock=None,
        )
        for index, presentation in enumerate(presentations, start=1)
    )
    values = {
        "id": id,
        "slug": slug,
        "name": slug.capitalize(),
        "category": category,
        "sales_channel": channel,
        "summary": f"Resumen de {slug}.",
        "description": "",
        "cake_type": "tres_leches" if category == "cake" else None,
        "bread_id": None,
        "bread_slug": None,
        "filling_base_slug": "normal" if category == "cake" else None,
        "filling_flavor_slug": None,
        "storage_notes": "",
        "transport_notes": "",
        "photo": photo,
        "featured_on_home": featured,
        "offerings": offerings,
        **fields,
    }
    return ProductRecord(**values)


# Un postre va primero: el respaldo de la portada solo toma pasteles.
CATALOG = [
    product(1, "flan", "dessert"),
    product(2, "durazno", presentations=("whole", "slice", "mini")),
    product(3, "fresa"),
    product(4, "zarzamora"),
    product(5, "cajeta"),
    product(6, "galleta"),
    product(7, "imposible", "dessert"),
]


def repo(products=CATALOG, stock=None):
    return MemoryProductRepo(products, showcase_stock=stock)


def offering_id(slug, presentation):
    record = next(p for p in CATALOG if p.slug == slug)
    return next(o.id for o in record.offerings if o.presentation == presentation)


def stock(*rows):
    """`(slug, presentation, quantity)` o `(slug, presentation, quantity, day)`."""
    return {(offering_id(row[0], row[1]), row[3] if len(row) > 3 else TODAY): row[2] for row in rows}


def card_slugs(cards):
    return [card.slug for card in cards]


# --- Pasteles de la casa ---


def test_home_featured_falls_back_to_the_first_cakes_when_none_is_marked():
    cards = catalog_service.list_home_featured(products=repo(), today=TODAY)
    assert card_slugs(cards) == ["durazno", "fresa", "zarzamora", "cajeta"]


def test_home_featured_fallback_gives_what_there_is_with_fewer_than_four_cakes():
    few = [CATALOG[0], CATALOG[1], CATALOG[6]]
    assert card_slugs(catalog_service.list_home_featured(products=repo(few), today=TODAY)) == ["durazno"]
    assert catalog_service.list_home_featured(products=repo([CATALOG[0]]), today=TODAY) == []


def test_home_featured_gives_the_marked_products_in_their_order_up_to_four():
    marked = [
        product(1, "flan", "dessert", featured=True),
        *CATALOG[1:3],
        product(4, "zarzamora", featured=True),
        product(5, "cajeta", featured=True),
        product(6, "galleta", featured=True),
        product(7, "imposible", "dessert", featured=True),
    ]
    cards = catalog_service.list_home_featured(products=repo(marked), today=TODAY)
    assert card_slugs(cards) == ["flan", "zarzamora", "cajeta", "galleta"]


def test_home_featured_does_not_pad_with_cakes_when_fewer_are_marked():
    marked = [product(7, "imposible", "dessert", featured=True), *CATALOG[1:3]]
    assert card_slugs(catalog_service.list_home_featured(products=repo(marked), today=TODAY)) == ["imposible"]


def test_home_featured_cards_read_the_showcase_of_today():
    cards = catalog_service.list_home_featured(products=repo(stock=stock(("fresa", "whole", 2))), today=TODAY)
    assert [(card.slug, card.in_showcase_today) for card in cards] == [
        ("durazno", False), ("fresa", True), ("zarzamora", False), ("cajeta", False),
    ]


# --- "En vitrina hoy" ---


def test_in_showcase_today_needs_a_piece_left_today_outside_the_slices():
    rows = stock(
        ("durazno", "mini", 1),
        ("fresa", "whole", 0),
        ("zarzamora", "slice", 6),
        ("cajeta", "whole", 3, TODAY + timedelta(days=1)),
    )
    shown = {card.slug: card.in_showcase_today for card in catalog_service.list_catalog(products=repo(stock=rows), today=TODAY)}
    assert shown == {
        "flan": False, "durazno": True, "fresa": False, "zarzamora": False,
        "cajeta": False, "galleta": False, "imposible": False,
    }


def test_catalog_passes_the_category_and_the_search_to_the_repository():
    service_repo = repo()
    assert card_slugs(catalog_service.list_catalog("dessert", products=service_repo, today=TODAY)) == ["flan", "imposible"]
    assert card_slugs(catalog_service.list_catalog(search="FRE", products=service_repo, today=TODAY)) == ["fresa"]
    assert len(catalog_service.list_catalog(None, "", products=service_repo, today=TODAY)) == len(CATALOG)


# --- PENDIENTE como `None` ---


def test_empty_or_blank_photos_and_notes_are_pending():
    records = [
        product(2, "durazno", photo="  ", storage_notes="", transport_notes=" \n "),
        product(3, "fresa", photo="fresa.webp", offering_photos={"slice": "fresa-rebanada.webp"},
                storage_notes="En refrigeración.", transport_notes="Plano."),
    ]
    durazno = catalog_service.get_product("durazno", products=repo(records), today=TODAY)
    assert (durazno.photo, durazno.storage_notes, durazno.transport_notes) == (None, None, None)
    assert [o.photo for o in durazno.offerings] == [None, None]
    fresa = catalog_service.get_product("fresa", products=repo(records), today=TODAY)
    assert (fresa.photo, fresa.storage_notes, fresa.transport_notes) == ("fresa.webp", "En refrigeración.", "Plano.")
    assert [o.photo for o in fresa.offerings] == ["fresa.webp", "fresa-rebanada.webp"]


# --- Ficha ---


def test_product_detail_is_none_when_the_repository_has_no_such_product():
    assert catalog_service.get_product("no-existe", products=repo(), today=TODAY) is None


def test_product_detail_carries_the_stock_of_today_and_related_cards_of_today():
    rows = stock(("durazno", "whole", 3), ("fresa", "whole", 1), ("durazno", "slice", 0, TODAY - timedelta(days=1)))
    detail = catalog_service.get_product("durazno", products=repo(stock=rows), today=TODAY)
    assert [(o.presentation, o.stock) for o in detail.offerings] == [("whole", 3), ("slice", None), ("mini", None)]
    assert detail.in_showcase_today is True
    assert [(card.slug, card.in_showcase_today) for card in detail.related] == [
        ("fresa", True), ("zarzamora", False), ("cajeta", False),
    ]
    assert len(detail.related) == catalog_service.RELATED_LIMIT


# --- Vitrina y rebanadas ---


def test_showcase_tells_sold_out_from_available_and_carries_the_date():
    rows = stock(("durazno", "whole", 0), ("fresa", "whole", 2), ("fresa", "slice", 4), ("flan", "whole", 1))
    showcase = catalog_service.get_showcase(products=repo(stock=rows), today=TODAY)
    assert showcase.date == TODAY
    assert [(i.product_slug, i.presentation, i.stock, i.sold_out) for i in showcase.items] == [
        ("flan", "whole", 1, False), ("durazno", "whole", 0, True), ("fresa", "whole", 2, False),
    ]
    cakes = catalog_service.get_showcase("cake", products=repo(stock=rows), today=TODAY)
    assert [i.product_slug for i in cakes.items] == ["durazno", "fresa"]


def test_slices_carry_only_the_slices_and_the_date():
    rows = stock(("durazno", "slice", 0), ("fresa", "slice", 4), ("fresa", "whole", 2))
    slices = catalog_service.get_slices(products=repo(stock=rows), today=TODAY)
    assert slices.date == TODAY
    assert [(i.product_slug, i.stock, i.sold_out, i.price) for i in slices.items] == [
        ("durazno", 0, True, Decimal("35.00")), ("fresa", 4, False, Decimal("35.00")),
    ]


def test_today_defaults_to_the_local_date_of_the_bakery(monkeypatch):
    # 23:00 del 6 en la Ciudad de México: en UTC ya es el 7.
    monkeypatch.setattr(timezone, "now", lambda: datetime(2026, 11, 7, 5, 0, tzinfo=dt_timezone.utc))
    assert catalog_service.bakery_today() == TODAY
    rows = stock(("fresa", "whole", 2), ("durazno", "whole", 5, TODAY + timedelta(days=1)))
    showcase = catalog_service.get_showcase(products=repo(stock=rows))
    assert (showcase.date, [i.product_slug for i in showcase.items]) == (TODAY, ["fresa"])


# --- Capas ---


def imports_of(module):
    """`(módulo, nombres)` de cada import; los relativos llevan sus puntos (`..models`)."""
    found = []
    for node in ast.walk(ast.parse(inspect.getsource(module))):
        if isinstance(node, ast.Import):
            found.extend((alias.name, ()) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            found.append(("." * node.level + (node.module or ""), tuple(alias.name for alias in node.names)))
    return found


@pytest.mark.parametrize("module", [catalog_service, views])
def test_the_view_and_the_service_only_take_enums_from_the_models_and_never_the_orm(module):
    imported = imports_of(module)
    assert not [name for name, _ in imported if name.startswith("django.db")]
    from_models = [names for name, names in imported if name in ("..models", "core_pasteleria.models")]
    for names in from_models:
        for name in names:
            assert issubclass(getattr(models, name), Choices), name


def test_the_layer_check_would_catch_a_model_import():
    """La prueba de capas no pasa en vacío: `product_repo` sí importa modelos y el ORM."""
    from core_pasteleria.repositories import product_repo

    imported = imports_of(product_repo)
    assert any(name.startswith("django.db") for name, _ in imported)
    model_names = [n for name, names in imported if name == "..models" for n in names]
    assert not all(issubclass(getattr(models, n), Choices) for n in model_names)


# --- Alternativas más chicas de "Diseña tu pastel" ---


def test_smaller_alternatives_take_the_lightest_showcase_cake_and_the_smallest_mini():
    mini = product(8, "mini", presentations=("whole", "mini"))
    light = product(9, "ligero")
    light = dataclasses.replace(
        light,
        offerings=tuple(
            dataclasses.replace(o, approx_weight_kg=Decimal("1.5"), servings=10) if o.presentation == "whole" else o
            for o in light.offerings
        ),
    )
    mini = dataclasses.replace(
        mini, offerings=tuple(dataclasses.replace(o, servings=3) if o.presentation == "mini" else o for o in mini.offerings)
    )
    result = catalog_service.get_smaller_alternatives(products=repo([*CATALOG, mini, light]), today=TODAY)
    assert result.showcase_cake == catalog_service.CakeSize(Decimal("1.5"), 10)
    assert result.mini_cake == catalog_service.CakeSize(None, 3)


def test_smaller_alternatives_skip_order_only_cakes_desserts_and_missing_data():
    order_only = product(8, "red-velvet", sales_channel="order_only")
    order_only = dataclasses.replace(
        order_only,
        offerings=tuple(dataclasses.replace(o, approx_weight_kg=Decimal("1.0")) for o in order_only.offerings),
    )
    result = catalog_service.get_smaller_alternatives(products=repo([order_only, product(1, "flan", "dessert")]), today=TODAY)
    assert result == catalog_service.SmallerAlternatives(showcase_cake=None, mini_cake=None)
