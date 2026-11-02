"""Modelo de usuario propio: correo como identificador y sin username."""
import pytest
from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import RequestFactory

User = get_user_model()


def test_user_model_is_the_custom_one():
    assert User._meta.label == "core_pasteleria.User"
    assert User.USERNAME_FIELD == "email"


def test_there_is_no_username():
    names = {field.name for field in User._meta.get_fields()}
    assert "username" not in names
    assert not hasattr(User, "username")


@pytest.mark.django_db
def test_create_user_by_email():
    user = User.objects.create_user("ana@ejemplo.com", "clave-segura-123")
    assert user.pk is not None
    assert user.get_username() == "ana@ejemplo.com"
    assert user.check_password("clave-segura-123")
    assert user.is_active
    assert not user.is_staff
    assert not user.is_superuser


@pytest.mark.django_db
def test_create_user_without_password_leaves_it_unusable():
    # Cuentas de Google: no tienen contraseña usable.
    user = User.objects.create_user("google@ejemplo.com")
    assert not user.has_usable_password()


@pytest.mark.django_db
def test_create_superuser_by_email():
    admin = User.objects.create_superuser("jefa@ejemplo.com", "clave-segura-123")
    assert admin.is_staff
    assert admin.is_superuser
    assert admin.is_active


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["is_staff", "is_superuser"])
def test_create_superuser_rejects_false_flags(field):
    with pytest.raises(ValueError):
        User.objects.create_superuser(
            "jefa@ejemplo.com", "clave-segura-123", **{field: False}
        )


@pytest.mark.django_db
@pytest.mark.parametrize("email", ["", "   ", None])
def test_email_is_required(email):
    with pytest.raises(ValueError):
        User.objects.create_user(email, "clave-segura-123")
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_email_is_normalized_to_lowercase_and_stripped():
    user = User.objects.create_user("  Ana.Lopez@EJEMPLO.Com ", "clave-segura-123")
    assert user.email == "ana.lopez@ejemplo.com"
    user.refresh_from_db()
    assert user.email == "ana.lopez@ejemplo.com"


@pytest.mark.django_db
def test_email_is_unique_regardless_of_case():
    User.objects.create_user("ana@ejemplo.com", "clave-segura-123")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user("ANA@ejemplo.com", "otra-clave-456")
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_full_clean_detects_duplicate_email_with_different_case():
    User.objects.create_user("ana@ejemplo.com", "clave-segura-123")
    duplicate = User(email="ANA@Ejemplo.com")
    with pytest.raises(ValidationError) as error:
        duplicate.full_clean(exclude=["password"])
    assert "email" in error.value.message_dict


@pytest.mark.django_db
def test_login_by_email_ignores_case():
    User.objects.create_user("ana@ejemplo.com", "clave-segura-123")
    # django-axes exige la petición al autenticar.
    request = RequestFactory().post("/")
    assert authenticate(request, username="Ana@Ejemplo.COM", password="clave-segura-123")
    assert authenticate(request, username="ana@ejemplo.com", password="incorrecta") is None


@pytest.mark.django_db
def test_database_rejects_duplicate_email_even_when_save_is_skipped():
    # bulk_create no llama a save(): solo lo frena la restricción de la base.
    User.objects.create_user("ana@ejemplo.com", "clave-segura-123")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.bulk_create([User(email="ANA@ejemplo.com")])
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_database_rejects_update_that_duplicates_email_with_different_case():
    User.objects.create_user("ana@ejemplo.com", "clave-segura-123")
    other = User.objects.create_user("beto@ejemplo.com", "clave-segura-123")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.filter(pk=other.pk).update(email="Ana@Ejemplo.com")
    other.refresh_from_db()
    assert other.email == "beto@ejemplo.com"
