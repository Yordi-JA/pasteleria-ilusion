"""Reintegrar a la vitrina respeta "un pastel por sabor" (D60, pendiente 2).

Al cancelarse un pedido, lo que se apartó vuelve a la vitrina. Un completo de un producto que se vende en rebanadas
vuelve como mucho a 1 pieza, y no vuelve si ese día ya tiene rebanadas cargadas (el rebanado). El repositorio en memoria
responde igual que PostgreSQL.
"""
import pytest

from tests.test_repositories import TODAY, TOMORROW, load_stock, memory_product_repo, offering_of
from core_pasteleria.repositories import product_repo

pytestmark = pytest.mark.django_db


def repos():
    return [product_repo, memory_product_repo(TODAY)]


def test_a_whole_cake_of_a_sliced_product_comes_back_up_to_one():
    load_stock("tres-leches-de-fresa", "whole", 0)
    whole = offering_of("tres-leches-de-fresa", "whole")
    for repo in repos():
        assert repo.restock_showcase(whole.id, TODAY, 2) is True
        assert repo.get_showcase_stock(whole.id, TODAY) == 1
        assert repo.restock_showcase(whole.id, TODAY, 1) is True
        assert repo.get_showcase_stock(whole.id, TODAY) == 1


def test_a_whole_cake_does_not_come_back_once_its_slices_are_loaded():
    load_stock("tres-leches-de-fresa", "whole", 0)
    load_stock("tres-leches-de-fresa", "slice", 0)
    whole = offering_of("tres-leches-de-fresa", "whole")
    for repo in repos():
        assert repo.restock_showcase(whole.id, TODAY, 1) is False
        assert repo.get_showcase_stock(whole.id, TODAY) == 0


def test_slices_on_another_day_do_not_block_the_whole_cake():
    load_stock("tres-leches-de-fresa", "whole", 0)
    load_stock("tres-leches-de-fresa", "slice", 4, on_date=TOMORROW)
    whole = offering_of("tres-leches-de-fresa", "whole")
    for repo in repos():
        assert repo.restock_showcase(whole.id, TODAY, 1) is True


def test_minis_and_products_without_slices_are_not_capped():
    load_stock("tres-leches-de-fresa", "mini", 1)
    load_stock("gelatina-de-molde", "whole", 0)
    mini = offering_of("tres-leches-de-fresa", "mini")
    gelatin = offering_of("gelatina-de-molde", "whole")
    assert product_repo.restock_showcase(mini.id, TODAY, 3) is True
    assert product_repo.get_showcase_stock(mini.id, TODAY) == 4
    assert product_repo.restock_showcase(gelatin.id, TODAY, 2) is True
    assert product_repo.get_showcase_stock(gelatin.id, TODAY) == 2


def test_has_slices_loaded_counts_slices_in_zero():
    product = offering_of("tres-leches-de-fresa", "whole").product
    for repo in repos():
        assert repo.has_slices_loaded(product.id, TODAY) is False
    load_stock("tres-leches-de-fresa", "slice", 0)
    for repo in repos():
        assert repo.has_slices_loaded(product.id, TODAY) is True
        assert repo.has_slices_loaded(product.id, TOMORROW) is False
