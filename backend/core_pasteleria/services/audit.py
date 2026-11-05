"""Decorator que audita operaciones: nombre, duración y resultado.

Nunca registra argumentos, payloads, tokens, montos ni datos personales: solo
el nombre de la operación, cuánto tardó y si terminó bien o con qué tipo de
error. El error se vuelve a lanzar sin cambios.
"""
import functools
import logging
import time

logger = logging.getLogger("core_pasteleria.audit")


def audit_operation(func=None, *, expected_errors: tuple[type[BaseException], ...] = ()):
    """Mide en milisegundos y registra en el logger `core_pasteleria.audit`.

    Se usa como `@audit_operation` o `@audit_operation(expected_errors=(...))`.
    Termina bien: INFO con `ok`. Lanza uno de `expected_errors` (un rechazo
    previsto, como una elección que no cumple las reglas): INFO con
    `rejected:<Clase>`. Cualquier otra excepción: ERROR con el nombre de su
    clase, sin mensaje ni traza (la traza la deja `django.request` si llega a 500).
    """
    if func is None:
        return functools.partial(audit_operation, expected_errors=expected_errors)
    operation = f"{func.__module__}.{func.__qualname__}"

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        try:
            result = func(*args, **kwargs)
        except expected_errors as error:
            _log(logging.INFO, operation, started, f"rejected:{type(error).__name__}")
            raise
        except Exception as error:
            _log(logging.ERROR, operation, started, type(error).__name__)
            raise
        _log(logging.INFO, operation, started, "ok")
        return result

    return wrapper


def _log(level, operation, started, result):
    duration_ms = round((time.perf_counter() - started) * 1000, 3)
    logger.log(
        level,
        "%s %.3f ms %s",
        operation,
        duration_ms,
        result,
        extra={"operation": operation, "duration_ms": duration_ms, "result": result},
    )
