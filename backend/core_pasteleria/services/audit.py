"""Decorator que audita operaciones: nombre, duración y resultado.

Nunca registra argumentos, payloads, tokens, montos ni datos personales: solo
el nombre de la operación, cuánto tardó y si terminó bien o con qué tipo de
error. El error se vuelve a lanzar sin cambios. Una operación puede agregar
ids y códigos de su resultado con `describe` (por ejemplo, el id del pedido,
el id de quien lo cambió y los dos estados), nunca un correo ni un nombre.
"""
import functools
import logging
import time
from collections.abc import Callable

logger = logging.getLogger("core_pasteleria.audit")


def audit_operation(
    func=None,
    *,
    expected_errors: tuple[type[BaseException], ...] = (),
    describe: Callable[[object], dict] | None = None,
    context: Callable[..., dict] | None = None,
):
    """Mide en milisegundos y registra en el logger `core_pasteleria.audit`.

    Se usa como `@audit_operation` o `@audit_operation(expected_errors=(...))`.
    Termina bien: INFO con `ok`. Lanza uno de `expected_errors` (un rechazo
    previsto, como una elección que no cumple las reglas): INFO con
    `rejected:<Clase>`. Cualquier otra excepción: ERROR con el nombre de su
    clase, sin mensaje ni traza (la traza la deja `django.request` si llega a 500).
    Con `describe`, al terminar bien se agregan al registro los campos que
    devuelve a partir del resultado (ids y códigos, no datos personales).
    Con `context`, los campos que devuelve a partir de los argumentos de la
    llamada (por ejemplo, el id de la cuenta) van en todos los registros: el
    éxito, el rechazo y la falla. Solo ids, nunca un correo ni un nombre.
    """
    if func is None:
        return functools.partial(audit_operation, expected_errors=expected_errors, describe=describe, context=context)
    operation = f"{func.__module__}.{func.__qualname__}"

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        known = context(*args, **kwargs) if context else {}
        try:
            result = func(*args, **kwargs)
        except expected_errors as error:
            _log(logging.INFO, operation, started, f"rejected:{type(error).__name__}", known)
            raise
        except Exception as error:
            _log(logging.ERROR, operation, started, type(error).__name__, known)
            raise
        _log(logging.INFO, operation, started, "ok", {**known, **(describe(result) if describe else {})})
        return result

    return wrapper


def _log(level, operation, started, result, details=None):
    duration_ms = round((time.perf_counter() - started) * 1000, 3)
    details = details or {}
    suffix = "".join(f" {key}={value}" for key, value in details.items())
    logger.log(
        level,
        "%s %.3f ms %s%s",
        operation,
        duration_ms,
        result,
        suffix,
        extra={"operation": operation, "duration_ms": duration_ms, "result": result, **details},
    )
