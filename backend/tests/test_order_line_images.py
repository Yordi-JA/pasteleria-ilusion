"""La imagen de cada línea del pedido (D103): la que muestra la tarjeta del catálogo, para que el detalle, el pago y la
confirmación no dependan de la miniatura que guardó la pestaña que hizo el pedido.

- Encargo y vitrina: la imagen del modelo si el catálogo la muestra y la línea lleva la foto del producto; si no, la foto
  de la presentación o la del producto. Una rebanada lleva su foto, nunca la imagen del modelo del pastel completo.
- "Diseña tu pastel": `null`, también desde "Personalizar este pastel": la cobertura y la decoración son libres y la imagen
  del pastel de origen puede no parecerse a lo pedido. Solo vale la captura que guardó la pestaña que hizo el pedido.
- Cotización aceptada (`reference`): `null`.
- `product_slug` deja que el frontend tome la imagen del modelo de un postre (D97), que el backend no guarda.
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core_pasteleria.models import Product, ProductOffering, ProductSampleDesign, ShowcaseInventory
from tests.test_orders_api import TODAY, URL, body, design_line, offering, post
from tests.test_orders_api import bakery_clock, many_unpaid_orders  # noqa: F401 - hora de la pastelería y tope de apartados
from tests.test_reference_requests import accept, quote, submitted
from tests.test_reference_requests import quoter  # noqa: F401 - el personal que cotiza

pytestmark = pytest.mark.django_db

# El pastel de vitrina de "Personalizar este pastel" de Tres leches de durazno (como en `test_design_sizes.py`).
DURAZNO_SHOWCASE = {
    "cake_size": "showcase", "source_product": "tres-leches-de-durazno", "cake_type": "tres_leches",
    "bread": "vainilla", "filling_base": "normal", "filling_flavors": ["durazno"],
    "coverage_color": "#F6B8CA", "decoration": "olanes",
}


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


def placed(client, *items, **options):
    response = post(client, body(*items, **options))
    assert response.status_code == 201, response.json()
    return response.json()


def line_images(order):
    return [(item["kind"], item["image"], item["product_slug"]) for item in order["items"]]


def detail(client, order_id):
    response = client.get(f"{URL}{order_id}/")
    assert response.status_code == 200
    return response.json()


def with_photo(slug):
    # La semilla solo pone la foto de algunos pasteles; en el sitio, la pastelería la nombra en el admin.
    Product.objects.filter(slug=slug).update(photo=f"{slug}.webp")


def showcase_stock(item_offering, quantity=3):
    ShowcaseInventory.objects.create(offering=item_offering, stock_date=TODAY, quantity=quantity)


# --- Encargo del catálogo (`order`) ---


def test_a_catalog_line_shows_the_model_image_of_its_card(api):
    order = placed(api, {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id})
    expected = [("order", "tres-leches-de-durazno-modelo.webp", "tres-leches-de-durazno")]
    assert line_images(order) == expected
    # El detalle, el que abre el correo, lo trae igual que la respuesta de la creación.
    assert line_images(detail(api, order["id"])) == expected


def test_without_the_model_in_the_catalog_the_line_shows_the_photo(api):
    with_photo("tres-leches-de-cajeta")
    ProductSampleDesign.objects.filter(product__slug="tres-leches-de-cajeta").update(show_model_in_catalog=False)
    order = placed(api, {"kind": "order", "offering_id": offering("tres-leches-de-cajeta").id})
    assert line_images(order) == [("order", "tres-leches-de-cajeta.webp", "tres-leches-de-cajeta")]


def test_a_presentation_with_its_own_photo_keeps_it(api):
    mini = offering("tres-leches-de-durazno", "mini")
    ProductOffering.objects.filter(pk=mini.pk).update(photo="tres-leches-de-durazno-mini.webp")
    order = placed(api, {"kind": "order", "offering_id": mini.id})
    assert line_images(order) == [("order", "tres-leches-de-durazno-mini.webp", "tres-leches-de-durazno")]


def test_a_dessert_without_photo_gives_its_slug_and_no_image(api):
    # La imagen del modelo de un postre la pone el frontend por su `slug` (D97).
    order = placed(api, {"kind": "order", "offering_id": offering("flan-napolitano", "large").id})
    assert line_images(order) == [("order", None, "flan-napolitano")]


# --- Vitrina de hoy (`showcase`) ---


def test_a_showcase_line_shows_the_image_of_its_card(api):
    whole = offering("tres-leches-de-galleta")
    showcase_stock(whole)
    order = placed(api, {"kind": "showcase", "offering_id": whole.id}, day=TODAY, slot="12:30")
    assert line_images(order) == [("showcase", "tres-leches-de-galleta-modelo.webp", "tres-leches-de-galleta")]


def test_a_slice_shows_its_photo_and_never_the_model_of_the_whole_cake(api):
    with_photo("tres-leches-de-fresa")
    slice_ = offering("tres-leches-de-fresa", "slice")
    showcase_stock(slice_, quantity=6)
    order = placed(api, {"kind": "showcase", "offering_id": slice_.id, "quantity": 2}, day=TODAY, slot="12:30")
    assert line_images(order) == [("showcase", "tres-leches-de-fresa.webp", "tres-leches-de-fresa")]


def test_a_showcase_dessert_gives_its_slug(api):
    cup = offering("gelatina-mosaico", "cup")
    showcase_stock(cup)
    order = placed(api, {"kind": "showcase", "offering_id": cup.id}, day=TODAY, slot="12:30")
    assert line_images(order) == [("showcase", None, "gelatina-mosaico")]


# --- "Diseña tu pastel" (`design`) ---


def test_a_design_from_personalize_this_cake_has_no_image(api):
    order = placed(api, {"kind": "design", "design": DURAZNO_SHOWCASE})
    expected = [("design", None, None)]
    assert line_images(order) == expected
    assert line_images(detail(api, order["id"])) == expected


def test_a_design_from_scratch_has_no_image(api):
    order = placed(api, design_line())
    assert line_images(order) == [("design", None, None)]


# --- Cotización aceptada (`reference`) ---


def test_an_accepted_quote_has_no_image(api, quoter):
    request = submitted(api)
    quote(request["id"], quoter)
    response = accept(api, request["id"])
    assert response.status_code == 201, response.json()
    assert line_images(response.json()) == [("reference", None, None)]
    assert line_images(detail(api, response.json()["id"])) == [("reference", None, None)]


# --- Consultas ---


def count_queries(callable_):
    with CaptureQueriesContext(connection) as queries:
        response = callable_()
    assert response.status_code == 200
    return len(queries)


# Medidas el 22 de noviembre de 2026 con el código de antes de D103 (sin la imagen por línea): el detalle de un pedido
# lee lo mismo con una línea que con cinco, y la lista, lo mismo con uno que con tres pedidos.
DETAIL_QUERIES = 4
LIST_QUERIES = 5


def test_the_images_do_not_add_queries_to_the_detail(api):
    one = placed(api, {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id})
    mixed = placed(
        api,
        {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id},
        {"kind": "order", "offering_id": offering("tres-leches-de-cajeta").id},
        {"kind": "order", "offering_id": offering("flan-napolitano", "large").id},
        {"kind": "design", "design": DURAZNO_SHOWCASE},
        design_line(),
    )
    assert count_queries(lambda: api.get(f"{URL}{one['id']}/")) == DETAIL_QUERIES
    assert count_queries(lambda: api.get(f"{URL}{mixed['id']}/")) == DETAIL_QUERIES


def test_the_images_do_not_add_queries_to_the_list(api):
    placed(api, {"kind": "order", "offering_id": offering("tres-leches-de-durazno").id})
    assert count_queries(lambda: api.get(URL)) == LIST_QUERIES
    placed(api, {"kind": "order", "offering_id": offering("tres-leches-de-cajeta").id}, {"kind": "design", "design": DURAZNO_SHOWCASE})
    placed(api, design_line(), {"kind": "order", "offering_id": offering("tres-leches-de-galleta").id})
    assert count_queries(lambda: api.get(URL)) == LIST_QUERIES
