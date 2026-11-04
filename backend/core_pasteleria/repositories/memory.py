"""Repositorios en memoria para probar servicios sin PostgreSQL.

Tienen los mismos métodos y devuelven los mismos registros que los módulos
`product_repo`, `cake_option_repo` y `settings_repo`. Un servicio recibe el
repositorio por parámetro: en producción, el módulo; en las pruebas, una
instancia de estas clases. Asumen que los registros que reciben ya son activos
y están en el orden en que el repositorio real los devolvería.
"""
from dataclasses import replace
from datetime import date
from decimal import Decimal

from .records import (
    BreadRecord,
    CakeDesignSettingsRecord,
    CoverageColorRecord,
    DecorationRecord,
    DeliveryBandRecord,
    FillingBaseRecord,
    OfferingRecord,
    PolicySettingsRecord,
    ProductRecord,
    StandSizeRecord,
    StoreSettingsRecord,
    TierRecommendationRecord,
    UploadSettingsRecord,
)

# Mismo reparto que `product_repo`: las rebanadas van aparte, lo demás en la vitrina.
_SLICE = "slice"
# Un producto solo por encargo nunca tiene existencias de vitrina (como en `product_repo`).
_ORDER_ONLY = "order_only"


class MemoryProductRepo:
    """Catálogo y existencias en memoria.

    `showcase_stock` y `bread_stock` van por `(id, día)`. Los registros de
    `products` se reciben sin existencias: se calculan con esos diccionarios.
    """

    def __init__(
        self,
        products: list[ProductRecord] = (),
        showcase_stock: dict[tuple[int, date], int] | None = None,
        bread_stock: dict[tuple[int, date], int] | None = None,
    ):
        self._products = list(products)
        self._showcase_stock = dict(showcase_stock or {})
        self._bread_stock = dict(bread_stock or {})

    def _offering(self, offering: OfferingRecord, on_date: date | None) -> OfferingRecord:
        if on_date is None or offering.sales_channel == _ORDER_ONLY:
            return replace(offering, stock=None)
        return replace(offering, stock=self._showcase_stock.get((offering.id, on_date)))

    def _product(self, product: ProductRecord, on_date: date | None) -> ProductRecord:
        offerings = tuple(self._offering(offering, on_date) for offering in product.offerings)
        return replace(product, offerings=offerings)

    def list_catalog(
        self, *, on_date: date, category: str | None = None, search: str | None = None
    ) -> list[ProductRecord]:
        term = (search or "").strip().lower()
        return [
            self._product(product, on_date)
            for product in self._products
            if (not category or product.category == category)
            and (not term or term in product.name.lower() or term in product.summary.lower())
        ]

    def get_product_by_slug(self, slug: str, on_date: date) -> ProductRecord | None:
        product = next((p for p in self._products if p.slug == slug), None)
        return self._product(product, on_date) if product else None

    def list_related(self, product_id: int, limit: int = 3) -> list[ProductRecord]:
        product = next((p for p in self._products if p.id == product_id), None)
        if product is None:
            return []
        related = [p for p in self._products if p.category == product.category and p.id != product_id]
        return [self._product(p, None) for p in related[:limit]]

    def get_offering(self, offering_id: int) -> OfferingRecord | None:
        for product in self._products:
            for offering in product.offerings:
                if offering.id == offering_id:
                    return self._offering(offering, None)
        return None

    def _stocked(self, on_date: date):
        for product in self._products:
            for offering in product.offerings:
                record = self._offering(offering, on_date)
                if record.stock is not None:
                    yield record

    def list_showcase(self, on_date: date, category: str | None = None) -> list[OfferingRecord]:
        return [
            offering
            for offering in self._stocked(on_date)
            if offering.presentation != _SLICE and (not category or offering.category == category)
        ]

    def list_slices(self, on_date: date) -> list[OfferingRecord]:
        return [offering for offering in self._stocked(on_date) if offering.presentation == _SLICE]

    @staticmethod
    def _decrement(stock: dict, key: tuple[int, date], quantity: int) -> bool:
        if quantity < 1:
            raise ValueError("La cantidad debe ser de 1 o más.")
        if stock.get(key, 0) < quantity:
            return False
        stock[key] -= quantity
        return True

    @staticmethod
    def _increment(stock: dict, key: tuple[int, date], quantity: int) -> bool:
        if quantity < 1:
            raise ValueError("La cantidad debe ser de 1 o más.")
        if key not in stock:
            return False
        stock[key] += quantity
        return True

    def get_showcase_stock(self, offering_id: int, on_date: date) -> int | None:
        return self._showcase_stock.get((offering_id, on_date))

    def decrement_showcase_stock(self, offering_id: int, on_date: date, quantity: int) -> bool:
        return self._decrement(self._showcase_stock, (offering_id, on_date), quantity)

    def restock_showcase(self, offering_id: int, on_date: date, quantity: int) -> bool:
        return self._increment(self._showcase_stock, (offering_id, on_date), quantity)

    def get_bread_availability(self, bread_id: int, on_date: date) -> int | None:
        return self._bread_stock.get((bread_id, on_date))

    def consume_bread(self, bread_id: int, on_date: date, quantity: int) -> bool:
        return self._decrement(self._bread_stock, (bread_id, on_date), quantity)

    def release_bread(self, bread_id: int, on_date: date, quantity: int) -> bool:
        return self._increment(self._bread_stock, (bread_id, on_date), quantity)


class MemoryCakeOptionRepo:
    """Opciones de "Diseña tu pastel" en memoria."""

    def __init__(
        self,
        breads: list[BreadRecord] = (),
        filling_bases: list[FillingBaseRecord] = (),
        filling_prices: dict[tuple[str, str, str | None], Decimal] | None = None,
        coverage_colors: list[CoverageColorRecord] = (),
        decorations: list[DecorationRecord] = (),
        tier_recommendations: list[TierRecommendationRecord] = (),
    ):
        self._breads = list(breads)
        self._filling_bases = list(filling_bases)
        self._filling_prices = dict(filling_prices or {})
        self._coverage_colors = list(coverage_colors)
        self._decorations = list(decorations)
        self._tier_recommendations = list(tier_recommendations)

    def list_breads(self) -> list[BreadRecord]:
        return list(self._breads)

    def list_filling_bases_with_flavors(self) -> list[FillingBaseRecord]:
        return list(self._filling_bases)

    def get_filling_price_table(self) -> dict[tuple[str, str, str | None], Decimal]:
        return dict(self._filling_prices)

    def list_coverage_colors(self) -> list[CoverageColorRecord]:
        return list(self._coverage_colors)

    def list_decorations(self) -> list[DecorationRecord]:
        return list(self._decorations)

    def list_tier_recommendations(self) -> list[TierRecommendationRecord]:
        return list(self._tier_recommendations)


class MemorySettingsRepo:
    """Configuración editable, bases y envío en memoria."""

    def __init__(
        self,
        store: StoreSettingsRecord,
        cake_design: CakeDesignSettingsRecord,
        policy: PolicySettingsRecord,
        upload: UploadSettingsRecord,
        stands: list[StandSizeRecord] = (),
        delivery_bands: list[DeliveryBandRecord] = (),
    ):
        self._store = store
        self._cake_design = cake_design
        self._policy = policy
        self._upload = upload
        self._stands = list(stands)
        self._delivery_bands = list(delivery_bands)

    def get_store_settings(self) -> StoreSettingsRecord:
        return self._store

    def get_cake_design_settings(self) -> CakeDesignSettingsRecord:
        return self._cake_design

    def get_policy_settings(self) -> PolicySettingsRecord:
        return self._policy

    def get_upload_settings(self) -> UploadSettingsRecord:
        return self._upload

    def list_stand_sizes(self, active_only: bool = True) -> list[StandSizeRecord]:
        stands = [s for s in self._stands if s.is_active or not active_only]
        return sorted(stands, key=lambda stand: stand.max_kg)

    def list_delivery_bands(self) -> list[DeliveryBandRecord]:
        return sorted(self._delivery_bands, key=lambda band: band.max_km)
