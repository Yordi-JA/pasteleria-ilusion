"""Admin de Django con un usuario sin username."""
import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.urls import reverse

User = get_user_model()

ADD_URL = "admin:core_pasteleria_user_add"


@pytest.fixture
def superuser_client(client, db):
    superuser = User.objects.create_superuser("jefa@ejemplo.com", "clave-segura-123")
    client.force_login(superuser)
    return client


@pytest.mark.django_db
def test_admin_changelist_and_forms_load(superuser_client):
    assert superuser_client.get(reverse("admin:core_pasteleria_user_changelist")).status_code == 200
    response = superuser_client.get(reverse(ADD_URL))
    assert response.status_code == 200
    assert "email" in response.context["adminform"].form.fields
    assert "username" not in response.context["adminform"].form.fields


@pytest.mark.django_db
def test_user_change_form_loads(superuser_client):
    user = User.objects.get(email="jefa@ejemplo.com")
    response = superuser_client.get(reverse("admin:core_pasteleria_user_change", args=[user.pk]))
    assert response.status_code == 200


@pytest.mark.django_db
def test_admin_add_with_password_normalizes_email(superuser_client):
    response = superuser_client.post(
        reverse(ADD_URL),
        {
            "email": "Nueva@Ejemplo.com",
            "usable_password": "true",
            "password1": "clave-muy-segura-789",
            "password2": "clave-muy-segura-789",
        },
    )
    assert response.status_code == 302
    created = User.objects.get(email="nueva@ejemplo.com")
    assert created.check_password("clave-muy-segura-789")


@pytest.mark.django_db
def test_admin_add_without_usable_password(superuser_client):
    response = superuser_client.post(
        reverse(ADD_URL),
        {"email": "google@ejemplo.com", "usable_password": "false"},
    )
    assert response.status_code == 302
    assert not User.objects.get(email="google@ejemplo.com").has_usable_password()


@pytest.mark.django_db
def test_admin_add_rejects_duplicate_email_with_different_case(superuser_client):
    response = superuser_client.post(
        reverse(ADD_URL),
        {
            "email": "JEFA@ejemplo.com",
            "usable_password": "true",
            "password1": "clave-muy-segura-789",
            "password2": "clave-muy-segura-789",
        },
    )
    assert response.status_code == 200
    assert "email" in response.context["adminform"].form.errors
    assert User.objects.count() == 1


@pytest.fixture
def staff_with_change_perm(client, db):
    """Personal no superusuario que puede cambiar usuarios en el admin."""
    staff = User.objects.create_user(
        "personal@ejemplo.com", "clave-segura-123", is_staff=True
    )
    staff.user_permissions.add(
        Permission.objects.get(codename="change_user"),
        Permission.objects.get(codename="delete_user"),
    )
    client.force_login(staff)
    return staff


def _change_url(user):
    return reverse("admin:core_pasteleria_user_change", args=[user.pk])


def _is_not_found(response):
    """El admin responde a un objeto fuera de su queryset con 404 o con un
    redirect a /admin/ ("no existe"); en ambos casos no hay acceso."""
    return response.status_code == 404 or (
        response.status_code == 302 and response.url == "/admin/"
    )


def _edit_data(user, **extra):
    return {"email": user.email, "is_active": "on", **extra}


@pytest.mark.django_db
def test_staff_cannot_grant_itself_privileges(client, staff_with_change_perm):
    url = _change_url(staff_with_change_perm)
    # Ni siquiera ve su propio registro de personal.
    assert _is_not_found(client.get(url))
    response = client.post(
        url, _edit_data(staff_with_change_perm, is_staff="on", is_superuser="on")
    )
    assert _is_not_found(response)
    staff_with_change_perm.refresh_from_db()
    assert staff_with_change_perm.is_staff
    assert not staff_with_change_perm.is_superuser


@pytest.mark.django_db
def test_staff_cannot_edit_or_delete_other_staff_or_superusers(
    client, staff_with_change_perm
):
    other = User.objects.create_user("otro@ejemplo.com", "clave-segura-123", is_staff=True)
    boss = User.objects.create_superuser("jefa@ejemplo.com", "clave-segura-123")
    for target in (other, boss):
        assert _is_not_found(client.get(_change_url(target)))
        assert _is_not_found(client.post(_change_url(target), _edit_data(target)))
        delete_url = reverse("admin:core_pasteleria_user_delete", args=[target.pk])
        assert _is_not_found(client.post(delete_url, {"post": "yes"}))
        # También el cambio de contraseña, que es otra vía a la misma cuenta.
        password_url = reverse("admin:auth_user_password_change", args=[target.pk])
        assert client.get(password_url).status_code == 403
    assert User.objects.filter(pk__in=[other.pk, boss.pk]).count() == 2


@pytest.mark.django_db
def test_changelist_hides_staff_and_superusers_from_non_superusers(
    client, staff_with_change_perm
):
    User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    User.objects.create_superuser("jefa@ejemplo.com", "clave-segura-123")
    response = client.get(reverse("admin:core_pasteleria_user_changelist"))
    assert response.status_code == 200
    assert [u.email for u in response.context["cl"].result_list] == ["clienta@ejemplo.com"]


@pytest.mark.django_db
def test_staff_cannot_promote_a_customer(client, staff_with_change_perm):
    customer = User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    form = client.get(_change_url(customer)).context["adminform"].form
    for field in ("is_staff", "is_superuser", "groups", "user_permissions"):
        assert field not in form.fields

    # Aunque mande los campos a mano, no surten efecto.
    response = client.post(
        _change_url(customer),
        _edit_data(customer, is_staff="on", is_superuser="on"),
    )
    assert response.status_code == 302
    customer.refresh_from_db()
    assert not customer.is_staff
    assert not customer.is_superuser


@pytest.mark.django_db
def test_superuser_can_promote_and_edit_staff(superuser_client):
    customer = User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    form = superuser_client.get(_change_url(customer)).context["adminform"].form
    for field in ("is_staff", "is_superuser", "groups", "user_permissions"):
        assert field in form.fields

    response = superuser_client.post(
        _change_url(customer), _edit_data(customer, is_staff="on")
    )
    assert response.status_code == 302
    customer.refresh_from_db()
    assert customer.is_staff

    # Y ahora ve y edita a ese miembro del personal.
    assert superuser_client.get(_change_url(customer)).status_code == 200
    response = superuser_client.post(
        _change_url(customer), _edit_data(customer, is_staff="on", is_superuser="on")
    )
    assert response.status_code == 302
    customer.refresh_from_db()
    assert customer.is_superuser


@pytest.mark.django_db
def test_superuser_sees_everyone_in_changelist(superuser_client):
    User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    response = superuser_client.get(reverse("admin:core_pasteleria_user_changelist"))
    emails = {u.email for u in response.context["cl"].result_list}
    assert emails == {"jefa@ejemplo.com", "clienta@ejemplo.com"}


def _staff_with_perms(client, email, *codenames):
    staff = User.objects.create_user(email, "clave-segura-123", is_staff=True)
    staff.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    client.force_login(staff)
    return staff


@pytest.mark.django_db
def test_staff_cannot_change_a_customer_email(client, staff_with_change_perm):
    customer = User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    form = client.get(_change_url(customer)).context["adminform"].form
    assert "email" not in form.fields

    response = client.post(
        _change_url(customer), {"email": "otro@ejemplo.com", "is_active": "on"}
    )
    assert response.status_code == 302
    customer.refresh_from_db()
    assert customer.email == "clienta@ejemplo.com"


@pytest.mark.django_db
def test_staff_cannot_change_a_customer_password(client, staff_with_change_perm):
    customer = User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    url = reverse("admin:auth_user_password_change", args=[customer.pk])
    assert client.get(url).status_code == 403
    response = client.post(
        url,
        {
            "usable_password": "true",
            "password1": "clave-del-personal-789",
            "password2": "clave-del-personal-789",
        },
    )
    assert response.status_code == 403
    customer.refresh_from_db()
    assert customer.check_password("clave-segura-123")


@pytest.mark.django_db
def test_superuser_can_change_a_customer_email_and_password(superuser_client):
    customer = User.objects.create_user("clienta@ejemplo.com", "clave-segura-123")
    form = superuser_client.get(_change_url(customer)).context["adminform"].form
    assert "email" in form.fields

    response = superuser_client.post(
        _change_url(customer), _edit_data(customer, email="nueva@ejemplo.com")
    )
    assert response.status_code == 302
    customer.refresh_from_db()
    assert customer.email == "nueva@ejemplo.com"

    url = reverse("admin:auth_user_password_change", args=[customer.pk])
    assert superuser_client.get(url).status_code == 200
    response = superuser_client.post(
        url,
        {
            "usable_password": "true",
            "password1": "clave-nueva-segura-789",
            "password2": "clave-nueva-segura-789",
        },
    )
    assert response.status_code == 302
    customer.refresh_from_db()
    assert customer.check_password("clave-nueva-segura-789")


@pytest.mark.django_db
def test_staff_with_add_user_cannot_create_users(client):
    _staff_with_perms(client, "personal@ejemplo.com", "add_user", "view_user")
    assert client.get(reverse(ADD_URL)).status_code == 403
    response = client.post(
        reverse(ADD_URL),
        {
            "email": "nuevo@ejemplo.com",
            "usable_password": "true",
            "password1": "clave-muy-segura-789",
            "password2": "clave-muy-segura-789",
        },
    )
    assert response.status_code == 403
    assert not User.objects.filter(email="nuevo@ejemplo.com").exists()


@pytest.mark.django_db
def test_staff_with_group_perms_cannot_use_group_admin(client):
    _staff_with_perms(
        client, "personal@ejemplo.com",
        "view_group", "add_group", "change_group", "delete_group",
    )
    group = Group.objects.create(name="Cocina")
    assert client.get(reverse("admin:auth_group_changelist")).status_code == 403
    assert client.get(reverse("admin:auth_group_add")).status_code == 403
    assert client.post(reverse("admin:auth_group_add"), {"name": "Nuevo"}).status_code == 403
    change_url = reverse("admin:auth_group_change", args=[group.pk])
    assert client.get(change_url).status_code == 403
    assert client.post(change_url, {"name": "Otro", "permissions": []}).status_code == 403
    delete_url = reverse("admin:auth_group_delete", args=[group.pk])
    assert client.post(delete_url, {"post": "yes"}).status_code == 403
    group.refresh_from_db()
    assert group.name == "Cocina"
    assert Group.objects.count() == 1


@pytest.mark.django_db
def test_groups_are_not_listed_in_admin_index_for_staff(client):
    _staff_with_perms(client, "personal@ejemplo.com", "view_group", "change_group")
    assert "Grupos" not in client.get(reverse("admin:index")).content.decode()


@pytest.mark.django_db
def test_superuser_can_manage_groups(superuser_client):
    assert superuser_client.get(reverse("admin:auth_group_changelist")).status_code == 200
    assert superuser_client.get(reverse("admin:auth_group_add")).status_code == 200
    response = superuser_client.post(reverse("admin:auth_group_add"), {"name": "Cocina"})
    assert response.status_code == 302
    group = Group.objects.get(name="Cocina")
    assert superuser_client.get(reverse("admin:auth_group_change", args=[group.pk])).status_code == 200
