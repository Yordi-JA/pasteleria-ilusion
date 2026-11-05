"""Errores de dominio que la API muestra por campo."""
from typing import Callable, TypeVar

T = TypeVar("T")


class DomainValidationError(Exception):
    """Elección que las reglas de negocio rechazan.

    `errors` va por campo de la petición, con mensajes en español listos para
    mostrarse, en la misma forma que los errores de DRF:
    `{"bread": ["Solo en pastel seco"]}`.
    """

    def __init__(self, errors: dict[str, list[str]]):
        self.errors = {field: list(messages) for field, messages in errors.items()}
        super().__init__(
            "; ".join(f"{field}: {' '.join(messages)}" for field, messages in self.errors.items())
        )


def attempt(failures: list[DomainValidationError], step: Callable[..., T], *args) -> T | None:
    """Corre una validación independiente y guarda su error para reportarlos juntos."""
    try:
        return step(*args)
    except DomainValidationError as error:
        failures.append(error)
        return None


def raise_all(
    failures: list[DomainValidationError], error_class: type[DomainValidationError] = DomainValidationError
) -> None:
    """Lanza los errores juntos; sin errores, no hace nada.

    Con uno solo lo lanza tal cual (conserva su clase, por ejemplo
    `PendingPriceError`). Con varios, junta sus campos en un `error_class`; un
    campo lleva solo los motivos del primer paso que lo rechazó, para no decir
    lo mismo dos veces (60 kg pasan el máximo en línea y además no tienen base).
    """
    if len(failures) == 1:
        raise failures[0]
    errors: dict[str, list[str]] = {}
    for failure in failures:
        for field, messages in failure.errors.items():
            errors.setdefault(field, messages)
    if errors:
        raise error_class(errors)
