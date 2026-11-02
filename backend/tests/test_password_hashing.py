"""Las contraseñas nuevas usan Argon2 (el conftest pone MD5 solo por velocidad)."""
import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import identify_hasher, make_password


@pytest.fixture
def real_hashers(settings, load_settings):
    settings.PASSWORD_HASHERS = load_settings().PASSWORD_HASHERS


def test_new_passwords_are_stored_with_argon2(real_hashers):
    new_hash = make_password("clave-segura-123")
    assert identify_hasher(new_hash).algorithm == "argon2"


@pytest.mark.django_db
def test_existing_pbkdf2_hash_is_upgraded_to_argon2_on_login(real_hashers):
    user = get_user_model().objects.create_user("ana@ejemplo.com")
    user.password = make_password("clave-segura-123", hasher="pbkdf2_sha256")
    user.save()
    assert user.check_password("clave-segura-123")
    user.refresh_from_db()
    assert user.password.startswith("argon2$")
