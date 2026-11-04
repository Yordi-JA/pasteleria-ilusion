"""Toda migración de datos debe estar en la lista que vuelve a sembrar tras las pruebas transaccionales."""
import importlib
from pathlib import Path

import core_pasteleria.migrations
from tests.conftest import SEED_MIGRATIONS


def seed_files():
    folder = Path(core_pasteleria.migrations.__file__).parent
    return sorted(path.stem for path in folder.glob("*seed*.py"))


def test_every_seed_migration_is_listed_in_conftest():
    listed = sorted(module_name for module_name, _ in SEED_MIGRATIONS)
    assert seed_files() == listed


def test_every_listed_seed_function_exists():
    for module_name, function_name in SEED_MIGRATIONS:
        module = importlib.import_module(f"core_pasteleria.migrations.{module_name}")
        assert callable(getattr(module, function_name)), (module_name, function_name)
