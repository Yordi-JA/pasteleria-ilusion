"""`@audit_operation`: registra nombre, duración y resultado, nunca argumentos ni resultados."""
import logging

import pytest

from core_pasteleria.services import pricing_service
from core_pasteleria.services.audit import audit_operation
from core_pasteleria.services.errors import DomainValidationError
from core_pasteleria.services.pricing_service import CakeDesignChoice, PendingPriceError
from tests import memory_cake_design as data

LOGGER = "core_pasteleria.audit"
SECRET = "ana.lopez@correo.test"


class ExpectedRejection(DomainValidationError):
    pass


@audit_operation
def charge_something(customer_email, amount):
    """Docstring original."""
    return {"customer": customer_email, "amount": amount}


@audit_operation
def fail_with(error):
    raise error


@audit_operation(expected_errors=(DomainValidationError,))
def validate_something(error):
    raise error


@pytest.fixture
def audit_log(caplog):
    """Registros del logger de auditoría.

    `LOGGING` no deja que `core_pasteleria` se propague a la raíz; pytest
    cuelga su manejador también de los loggers que no se propagan.
    """
    caplog.set_level(logging.INFO, logger=LOGGER)
    return caplog


def audit_records(caplog):
    return [record for record in caplog.records if record.name == LOGGER]


def test_keeps_the_name_and_docstring_of_the_function():
    assert charge_something.__name__ == "charge_something"
    assert charge_something.__doc__ == "Docstring original."
    assert charge_something.__wrapped__ is not None
    assert validate_something.__name__ == "validate_something"


def test_success_logs_name_duration_and_result_without_arguments(audit_log):
    assert charge_something(SECRET, 350) == {"customer": SECRET, "amount": 350}
    [record] = audit_records(audit_log)
    assert record.levelno == logging.INFO
    assert record.operation == "tests.test_audit.charge_something"
    assert record.result == "ok"
    assert isinstance(record.duration_ms, float) and record.duration_ms >= 0
    message = record.getMessage()
    assert "tests.test_audit.charge_something" in message and "ms" in message and "ok" in message
    assert SECRET not in audit_log.text
    assert "350" not in message


def test_an_unexpected_error_logs_its_type_only_as_error_and_reraises(audit_log):
    error = RuntimeError(f"Falla con {SECRET}")
    with pytest.raises(RuntimeError) as raised:
        fail_with(error)
    assert raised.value is error
    [record] = audit_records(audit_log)
    assert record.levelno == logging.ERROR
    assert record.result == "RuntimeError"
    assert record.exc_info is None
    assert SECRET not in audit_log.text


def test_a_validation_error_is_unexpected_unless_the_decorator_says_so(audit_log):
    with pytest.raises(DomainValidationError):
        fail_with(DomainValidationError({"kg": ["x"]}))
    [record] = audit_records(audit_log)
    assert (record.levelno, record.result) == (logging.ERROR, "DomainValidationError")


@pytest.mark.parametrize("error_class", [DomainValidationError, ExpectedRejection])
def test_an_expected_rejection_is_info_with_its_class(audit_log, error_class):
    error = error_class({"kg": [f"Dato de {SECRET}"]})
    with pytest.raises(error_class) as raised:
        validate_something(error)
    assert raised.value is error
    [record] = audit_records(audit_log)
    assert record.levelno == logging.INFO
    assert record.result == f"rejected:{error_class.__name__}"
    assert SECRET not in audit_log.text


def test_expected_errors_do_not_hide_other_errors(audit_log):
    with pytest.raises(KeyError):
        validate_something(KeyError("x"))
    [record] = audit_records(audit_log)
    assert (record.levelno, record.result) == (logging.ERROR, "KeyError")


def calculate(**choice):
    return pricing_service.calculate_price(
        CakeDesignChoice(**{"kg": 10, "cake_type": "seco", "bread": "red_velvet", **choice}),
        cake_options=data.cake_option_repo(),
        settings=data.settings_repo(),
    )


def test_price_calculation_writes_one_audit_record(audit_log):
    calculate()
    [record] = audit_records(audit_log)
    assert record.operation == "core_pasteleria.services.pricing_service.calculate_price"
    assert record.result == "ok"
    assert "red_velvet" not in audit_log.text


def test_a_rejected_price_is_logged_as_info_without_the_choice(audit_log):
    with pytest.raises(PendingPriceError):
        calculate(decoration="duya")
    [record] = audit_records(audit_log)
    assert (record.levelno, record.result) == (logging.INFO, "rejected:PendingPriceError")
    assert "duya" not in audit_log.text and "Precio por confirmar" not in audit_log.text
