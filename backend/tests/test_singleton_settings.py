"""Las 4 configuraciones de una sola fila: restricciones, admin y semilla."""
import importlib
from datetime import time
from decimal import Decimal

import pytest
from django.apps import apps
from django.conf import settings as django_settings
from django.db import IntegrityError, transaction
from django.forms.models import model_to_dict
from django.urls import reverse

from core_pasteleria.models import (
    CakeDesignSettings,
    PolicySettings,
    StoreSettings,
    UploadSettings,
)

SINGLETON_MODELS = [StoreSettings, CakeDesignSettings, PolicySettings, UploadSettings]
seed_module = importlib.import_module("core_pasteleria.migrations.0003_seed_settings")


@pytest.fixture
def superuser_client(client, django_user_model):
    client.force_login(
        django_user_model.objects.create_superuser("jefa@pasteleria.test", "clave-segura-123")
    )
    return client


def field_values(model):
    """Valores de la fila sembrada, sin la llave."""
    values = model_to_dict(model.objects.get(pk=1))
    values.pop("id", None)
    return values


def change_url(model):
    return reverse(f"admin:core_pasteleria_{model._meta.model_name}_change", args=[1])


def form_data_from(values, **overrides):
    """Datos de formulario del admin: el admin recibe `""` donde hay `None`."""
    data = {name: "" if value is None else value for name, value in values.items()}
    return {**data, **overrides}


def form_data(model, **overrides):
    """Datos de formulario del admin a partir de la fila sembrada."""
    return form_data_from(field_values(model), **overrides)


def test_postgres_app_and_hard_upload_limit_are_configured():
    assert "django.contrib.postgres" in django_settings.INSTALLED_APPS
    assert django_settings.UPLOAD_HARD_LIMIT_MB == 10
    assert django_settings.UPLOAD_HARD_LIMIT_IMAGES == 3


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_each_settings_table_has_exactly_one_seeded_row(model):
    assert list(model.objects.values_list("pk", flat=True)) == [1]


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_second_row_through_save_is_rejected(model):
    with pytest.raises(IntegrityError), transaction.atomic():
        model.objects.create(**field_values(model))


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_second_row_that_skips_save_is_rejected_by_the_database(model):
    with pytest.raises(IntegrityError), transaction.atomic():
        model.objects.bulk_create([model(pk=2, **field_values(model))])


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_save_always_writes_the_single_row(model):
    instance = model(pk=7, **field_values(model))
    instance.save()
    assert instance.pk == 1
    assert model.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_admin_does_not_allow_adding_or_deleting(superuser_client, model):
    name = model._meta.model_name
    assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_add")).status_code == 403
    assert superuser_client.get(reverse(f"admin:core_pasteleria_{name}_delete", args=[1])).status_code == 403
    response = superuser_client.post(
        reverse(f"admin:core_pasteleria_{name}_delete", args=[1]), {"post": "yes"}
    )
    assert response.status_code == 403
    assert model.objects.filter(pk=1).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_admin_list_opens_the_single_row(superuser_client, model):
    name = model._meta.model_name
    response = superuser_client.get(reverse(f"admin:core_pasteleria_{name}_changelist"))
    assert response.status_code == 302
    assert response.url == change_url(model)
    assert superuser_client.get(response.url).status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("model", SINGLETON_MODELS)
def test_admin_allows_adding_only_when_the_table_is_empty(superuser_client, model):
    values = field_values(model)
    model.objects.all().delete()
    add_url = reverse(f"admin:core_pasteleria_{model._meta.model_name}_add")
    assert superuser_client.get(add_url).status_code == 200
    response = superuser_client.post(add_url, form_data_from(values))
    assert response.status_code == 302
    assert list(model.objects.values_list("pk", flat=True)) == [1]
    assert superuser_client.get(add_url).status_code == 403


@pytest.mark.django_db
def test_database_rejects_opening_at_or_after_closing():
    with pytest.raises(IntegrityError), transaction.atomic():
        StoreSettings.objects.filter(pk=1).update(store_opens_at=time(22, 30))


@pytest.mark.django_db
@pytest.mark.parametrize(
    "changes",
    [
        {"first_slot_starts_at": time(9, 0)},
        {"last_slot_starts_at": time(10, 0)},
        {"last_slot_starts_at": time(22, 30)},
        {"slot_minutes": 0},
        {"max_orders_per_slot": 0},
    ],
)
def test_database_rejects_inconsistent_store_hours_and_slots(changes):
    with pytest.raises(IntegrityError), transaction.atomic():
        StoreSettings.objects.filter(pk=1).update(**changes)


@pytest.mark.django_db
@pytest.mark.parametrize("megabytes", [0, 11])
def test_database_rejects_upload_size_outside_the_hard_limit(megabytes):
    with pytest.raises(IntegrityError), transaction.atomic():
        UploadSettings.objects.filter(pk=1).update(max_upload_mb=megabytes)


@pytest.mark.django_db
@pytest.mark.parametrize("images", [0, 4])
def test_database_rejects_reference_images_outside_the_hard_limit(images):
    with pytest.raises(IntegrityError), transaction.atomic():
        UploadSettings.objects.filter(pk=1).update(max_reference_images=images)


@pytest.mark.django_db
@pytest.mark.parametrize("images", [1, 3])
def test_database_accepts_reference_images_up_to_the_hard_limit(images):
    UploadSettings.objects.filter(pk=1).update(max_reference_images=images)
    assert UploadSettings.objects.get(pk=1).max_reference_images == images


@pytest.mark.django_db
def test_admin_form_rejects_reference_images_above_the_hard_limit(superuser_client):
    response = superuser_client.post(
        change_url(UploadSettings), form_data(UploadSettings, max_reference_images=4)
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["max_reference_images"]
    assert UploadSettings.objects.get(pk=1).max_reference_images == 3


@pytest.mark.django_db
def test_database_accepts_upload_size_at_the_hard_limit():
    UploadSettings.objects.filter(pk=1).update(max_upload_mb=10)
    assert UploadSettings.objects.get(pk=1).max_upload_mb == 10


@pytest.mark.django_db
@pytest.mark.parametrize(
    "model, changes",
    [
        (CakeDesignSettings, {"people_per_kg": 0}),
        (CakeDesignSettings, {"min_custom_kg": 0}),
        (CakeDesignSettings, {"max_online_kg": 3}),
        (CakeDesignSettings, {"wafer_price": Decimal("-1")}),
        (CakeDesignSettings, {"wafer_max_width_cm": 0}),
        (CakeDesignSettings, {"message_suggested_max_words": 0}),
        (PolicySettings, {"stand_return_days": 0}),
        (PolicySettings, {"advance_percent": 0}),
        (PolicySettings, {"advance_percent": 101}),
        (UploadSettings, {"max_reference_images": 0}),
    ],
)
def test_database_rejects_non_positive_limits(model, changes):
    with pytest.raises(IntegrityError), transaction.atomic():
        model.objects.filter(pk=1).update(**changes)


@pytest.mark.django_db
def test_wafer_price_may_be_zero():
    CakeDesignSettings.objects.filter(pk=1).update(wafer_price=Decimal("0"))
    assert CakeDesignSettings.objects.get(pk=1).wafer_price == 0


@pytest.mark.django_db
def test_wafer_price_may_be_empty_and_the_admin_shows_it_as_pending(superuser_client):
    CakeDesignSettings.objects.filter(pk=1).update(wafer_price=None)
    assert CakeDesignSettings.objects.get(pk=1).wafer_price is None
    response = superuser_client.get(change_url(CakeDesignSettings))
    assert response.status_code == 200
    form = response.context["adminform"].form
    assert form["wafer_price"].value() is None
    response = superuser_client.post(change_url(CakeDesignSettings), form_data(CakeDesignSettings, wafer_price=""))
    assert response.status_code == 302


@pytest.mark.django_db
def test_admin_form_rejects_opening_after_closing(superuser_client):
    response = superuser_client.post(
        change_url(StoreSettings),
        form_data(StoreSettings, store_opens_at="23:00:00", store_closes_at="22:30:00"),
    )
    assert response.status_code == 200
    assert "La pastelería debe abrir antes de cerrar." in response.content.decode()
    assert StoreSettings.objects.get(pk=1).store_opens_at == time(10, 0)


@pytest.mark.django_db
def test_admin_form_rejects_upload_size_above_the_hard_limit(superuser_client):
    response = superuser_client.post(
        change_url(UploadSettings), form_data(UploadSettings, max_upload_mb=11)
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.errors["max_upload_mb"]
    assert UploadSettings.objects.get(pk=1).max_upload_mb == 5


@pytest.mark.django_db
def test_admin_form_saves_a_valid_change(superuser_client):
    response = superuser_client.post(
        change_url(UploadSettings), form_data(UploadSettings, max_upload_mb=8)
    )
    assert response.status_code == 302
    assert UploadSettings.objects.get(pk=1).max_upload_mb == 8


@pytest.mark.django_db
def test_admin_shows_pending_marker_for_empty_damaged_stand_policy(superuser_client):
    response = superuser_client.get(change_url(PolicySettings))
    content = response.content.decode()
    assert "PENDIENTE" in content
    assert PolicySettings.objects.get(pk=1).damaged_stand_policy == ""


@pytest.mark.django_db
def test_seeded_values_match_the_business_rules():
    store = StoreSettings.objects.get(pk=1)
    assert (store.store_opens_at, store.store_closes_at) == (time(10, 0), time(22, 30))
    assert (store.first_slot_starts_at, store.last_slot_starts_at) == (time(10, 30), time(22, 0))
    assert store.slot_minutes == 30
    assert store.max_orders_per_slot == 3
    assert store.custom_lead_days == 2
    assert store.same_day_showcase_lead_hours == 2
    assert store.free_delivery_from_kg == 15

    design = CakeDesignSettings.objects.get(pk=1)
    assert design.people_per_kg == 7
    assert design.min_custom_kg == 4
    assert design.max_online_kg == 50
    assert design.wafer_price == Decimal("125.00")
    assert (design.wafer_max_width_cm, design.wafer_max_height_cm) == (Decimal("21.6"), Decimal("27.9"))
    assert design.message_suggested_max_words == 4

    policy = PolicySettings.objects.get(pk=1)
    assert policy.stand_return_days == 15
    assert policy.damaged_stand_policy == ""
    assert policy.advance_percent == 50

    uploads = UploadSettings.objects.get(pk=1)
    assert uploads.max_upload_mb == 5
    assert uploads.max_reference_images == 3


@pytest.mark.django_db
def test_seeded_rows_pass_full_validation():
    for model in SINGLETON_MODELS:
        model.objects.get(pk=1).full_clean()


@pytest.mark.django_db
def test_seed_can_run_again_without_overwriting_edits():
    UploadSettings.objects.filter(pk=1).update(max_upload_mb=8)
    StoreSettings.objects.filter(pk=1).update(slot_minutes=20)
    seed_module.seed_settings(apps, None)
    assert UploadSettings.objects.get(pk=1).max_upload_mb == 8
    assert StoreSettings.objects.get(pk=1).slot_minutes == 20
    assert StoreSettings.objects.count() == 1
