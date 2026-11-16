"""Correos al cliente (D70): uno por evento, después del commit, de mejor esfuerzo y sin datos personales en el log."""
import logging
import re
import smtplib

import pytest
from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMultiAlternatives

from core_pasteleria.models import Order, StoreSettings
from core_pasteleria.services.orders import order_observer, order_status
from tests.test_orders_api import body, design_line, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería
from tests.test_reference_requests import api, quote, quoter, submitted  # noqa: F401 - fixtures del envío

pytestmark = pytest.mark.django_db
NOTIFICATIONS = "core_pasteleria.emails"


@pytest.fixture(autouse=True)
def email_on(settings):
    settings.EMAIL_ENABLED = True
    settings.SITE_URL = "https://pasteleriailusion.me"


@pytest.fixture
def order(api):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


def move(order, *steps, actor):
    for current, new in steps:
        order_status.change_status(order.pk, current, new, actor_id=actor.pk)


def test_the_email_observer_is_subscribed():
    kinds = [type(observer) for observer in order_observer.build_order_subject()._observers]
    assert order_observer.CustomerEmailObserver in kinds


def test_reference_received_is_sent_once_after_commit(api, customer_user, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        data = submitted(api)
    assert mail.outbox == []
    for callback in callbacks:
        callback()
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.subject == f"Recibimos tu solicitud #{data['id']}"
    assert message.to == [customer_user.email]
    assert f"https://pasteleriailusion.me/cuenta/cotizaciones/{data['id']}" in message.body
    html, kind = message.alternatives[0]
    assert kind == "text/html" and "#5e1921" in html
    # Los datos PENDIENTE de la pastelería llevan su marcador.
    assert "[Dirección por confirmar]" in message.body and "[WhatsApp por confirmar]" in message.body


def test_quote_ready_is_sent_with_price_and_pending_validity(api, quoter, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        data = submitted(api)
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        quote(data["id"], quoter, price="1800.00")
    assert [message.subject for message in mail.outbox] == [f"Tu cotización #{data['id']} está lista"]
    assert "$1,800.00" in mail.outbox[0].body and "[Vigencia por confirmar]" in mail.outbox[0].body


def test_payment_received_and_ready_are_sent_once_each(order, staff_user, django_capture_on_commit_callbacks):
    StoreSettings.objects.update(address="Av. Siempre Viva 1", whatsapp="525512345678")
    with django_capture_on_commit_callbacks(execute=True):
        move(
            order,
            ("awaiting_payment", "received"),
            ("received", "in_preparation"),
            ("in_preparation", "ready_for_delivery"),
            actor=staff_user,
        )
    assert [message.subject for message in mail.outbox] == [
        f"Recibimos tu pago del pedido #{order.pk}",
        f"Tu pedido #{order.pk} está listo",
    ]
    assert f"https://pasteleriailusion.me/cuenta/pedidos/{order.pk}" in mail.outbox[1].body
    assert "Av. Siempre Viva 1" in mail.outbox[1].body and "55 1234 5678" in mail.outbox[1].body


PHISHING_NAME = "Tu pago fue rechazado, entra a sitio-falso.example"
FREE_TEXTS = (PHISHING_NAME, "sitio-falso.example", "TEXTO-LIBRE-DE-LA-DESCRIPCION", "QUIEN-RECOGE-FALSO")


def test_no_free_text_of_the_customer_reaches_any_email(api, customer_user, quoter, staff_user, django_capture_on_commit_callbacks):
    # El correo del registro con contraseña no se verifica: el nombre de la cuenta lo escribe cualquiera (D70).
    customer_user.full_name = PHISHING_NAME
    customer_user.save(update_fields=["full_name"])
    with django_capture_on_commit_callbacks(execute=True):
        data = submitted(api, description="TEXTO-LIBRE-DE-LA-DESCRIPCION")
        quote(data["id"], quoter, price="1800.00")
        response = post(api, body(design_line(), pickup_name="QUIEN-RECOGE-FALSO"))
        assert response.status_code == 201, response.json()
        move(
            Order.objects.get(pk=response.json()["id"]),
            ("awaiting_payment", "received"),
            ("received", "in_preparation"),
            ("in_preparation", "ready_for_delivery"),
            actor=staff_user,
        )
    assert len(mail.outbox) == 4
    for message in mail.outbox:
        html, _ = message.alternatives[0]
        assert "Hola." in message.body and "Hola." in html
        for text in FREE_TEXTS:
            assert text not in message.body and text not in html, (message.subject, text)


def test_a_rolled_back_change_sends_nothing(order, staff_user, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        move(order, ("awaiting_payment", "cancelled"), actor=staff_user)
    for callback in callbacks:
        callback()
    assert mail.outbox == []


def test_an_smtp_failure_is_a_warning_and_undoes_nothing(
    order, staff_user, customer_user, monkeypatch, caplog, django_capture_on_commit_callbacks
):
    def broken(self, fail_silently=False):
        raise smtplib.SMTPServerDisconnected("se cayó")

    monkeypatch.setattr(EmailMultiAlternatives, "send", broken)
    with caplog.at_level(logging.INFO, logger=NOTIFICATIONS):
        with django_capture_on_commit_callbacks(execute=True):
            move(order, ("awaiting_payment", "received"), actor=staff_user)
    order.refresh_from_db()
    assert order.status == "received"
    warnings = [record for record in caplog.records if record.name == NOTIFICATIONS and record.levelno == logging.WARNING]
    assert len(warnings) == 1 and "SMTPServerDisconnected" in warnings[0].getMessage()
    assert all(customer_user.email not in record.getMessage() for record in caplog.records)


def test_without_email_host_nothing_is_sent(order, staff_user, settings, caplog, django_capture_on_commit_callbacks):
    settings.EMAIL_ENABLED = False
    with caplog.at_level(logging.INFO, logger=NOTIFICATIONS):
        with django_capture_on_commit_callbacks(execute=True):
            move(order, ("awaiting_payment", "received"), actor=staff_user)
    assert mail.outbox == []
    assert any("falta EMAIL_HOST" in record.getMessage() for record in caplog.records if record.name == NOTIFICATIONS)


# --- Diseño y datos de la pastelería (D71) ---

# Una dirección de prueba, no la de la pastelería: los datos reales viven en el admin (regla 2).
STORE_ADDRESS = "Calle Ficticia 12, Coyoacán, 04369 Ciudad de México"
MAPS_URL = (
    "https://www.google.com/maps/search/?api=1&query="
    "Calle%20Ficticia%2012%2C%20Coyoac%C3%A1n%2C%2004369%20Ciudad%20de%20M%C3%A9xico"
)
LOGO_URL = "https://pasteleriailusion.me/correo/ilusion-logo.png"


def all_four_emails(api, quoter, staff_user, callbacks):
    """Los cuatro correos en orden: solicitud recibida, cotización lista, pago recibido y pedido listo."""
    with callbacks(execute=True):
        data = submitted(api)
        quote(data["id"], quoter, price="1800.00")
        response = post(api, body(design_line()))
        assert response.status_code == 201, response.json()
        order = Order.objects.get(pk=response.json()["id"])
        move(
            order,
            ("awaiting_payment", "received"),
            ("received", "in_preparation"),
            ("in_preparation", "ready_for_delivery"),
            actor=staff_user,
        )
    assert len(mail.outbox) == 4
    order.refresh_from_db()
    links = [
        (f"https://pasteleriailusion.me/cuenta/cotizaciones/{data['id']}", "Ver mi solicitud"),
        (f"https://pasteleriailusion.me/cuenta/cotizaciones/{data['id']}", "Ver mi cotización"),
        (f"https://pasteleriailusion.me/cuenta/pedidos/{order.pk}", "Ver mi pedido"),
        (f"https://pasteleriailusion.me/cuenta/pedidos/{order.pk}", "Ver mi pedido"),
    ]
    return [(message, message.alternatives[0][0], *link) for message, link in zip(mail.outbox, links)], order


def test_every_email_is_real_email_html_with_the_logo_button_and_store_links(
    api, quoter, staff_user, django_capture_on_commit_callbacks
):
    StoreSettings.objects.update(address=STORE_ADDRESS, whatsapp="525512345678")
    emails, _ = all_four_emails(api, quoter, staff_user, django_capture_on_commit_callbacks)
    for message, html, url, button in emails:
        subject = message.subject
        assert '<html lang="es"' in html and 'role="presentation"' in html and "<script" not in html, subject
        # El preheader: el resumen oculto que muestra la bandeja junto al asunto.
        assert 'data-preheader' in html and "display:none" in html, subject
        # El logo en PNG con URL absoluta (Gmail no muestra SVG), con su texto y tamaño fijo.
        logo = re.search(rf'<img[^>]*src="{re.escape(LOGO_URL)}"[^>]*>', html)
        assert logo, subject
        assert 'alt="Pastelería Ilusión"' in logo[0] and 'width="160"' in logo[0] and 'height="70"' in logo[0], subject
        # El botón principal lleva el enlace absoluto.
        assert re.search(rf'<a href="{re.escape(url)}"[^>]*>\s*{button}\s*</a>', html), subject
        assert f"{button}:\n{url}" in message.body, subject
        # El pie: dirección, "Cómo llegar" con la dirección codificada y el WhatsApp.
        for text in (STORE_ADDRESS, "Cómo llegar", "55 1234 5678"):
            assert text in html and text in message.body, (subject, text)
        assert f'href="{MAPS_URL.replace("&", "&amp;")}"' in html and MAPS_URL in message.body, subject
        assert 'href="https://wa.me/525512345678"' in html and "https://wa.me/525512345678" in message.body, subject
        assert 'rel="noopener noreferrer"' in html, subject


def test_without_store_data_the_emails_show_the_markers_and_no_store_links(
    api, quoter, staff_user, django_capture_on_commit_callbacks
):
    StoreSettings.objects.update(address="", whatsapp="")
    emails, _ = all_four_emails(api, quoter, staff_user, django_capture_on_commit_callbacks)
    for message, html, _, _ in emails:
        for content in (html, message.body):
            assert "[Dirección por confirmar]" in content and "[WhatsApp por confirmar]" in content, message.subject
            assert "Cómo llegar" not in content and "google.com/maps" not in content, message.subject
            assert "wa.me" not in content, message.subject


def test_each_email_card_names_the_status_and_its_key_data(api, quoter, staff_user, django_capture_on_commit_callbacks):
    emails, order = all_four_emails(api, quoter, staff_user, django_capture_on_commit_callbacks)
    (received, _, _, _), (quoted, _, _, _), (paid, _, _, _), (ready, _, _, _) = emails
    pay_today = f"${order.pay_today:,.2f}"
    rest = f"${order.pay_on_delivery:,.2f}"
    expected = {
        received: ("En revisión", "Fecha del evento"),
        quoted: ("Cotización lista", "Pastel según tu referencia", "$1,800.00", "Válida hasta", "[Vigencia por confirmar]"),
        paid: ("Recibido", "Recoges", "Pagaste", pay_today, "Resto, el día de la entrega", rest, "Qué sigue"),
        ready: ("Listo para entregar", "Recoges", "Resto, el día de la entrega", rest, "Qué sigue"),
    }
    for message, texts in expected.items():
        html = message.alternatives[0][0]
        for text in texts:
            assert text in html and text in message.body, (message.subject, text)


# --- Configuración ---


def test_without_email_host_production_uses_no_backend(load_settings):
    loaded = load_settings(DEBUG="False", CORS_ALLOWED_ORIGINS="")
    assert loaded.EMAIL_BACKEND == "django.core.mail.backends.dummy.EmailBackend"
    assert loaded.EMAIL_ENABLED is False


def test_without_email_host_development_uses_the_console(load_settings):
    loaded = load_settings(DEBUG="True")
    assert loaded.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend"
    assert loaded.EMAIL_ENABLED is True


def test_with_email_host_it_uses_smtp_with_a_short_timeout(load_settings):
    loaded = load_settings(DEBUG="True", EMAIL_HOST="smtp.ejemplo.test", DEFAULT_FROM_EMAIL="Pastelería <pedidos@ejemplo.test>")
    assert loaded.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend"
    assert (loaded.EMAIL_PORT, loaded.EMAIL_USE_TLS, loaded.EMAIL_TIMEOUT, loaded.EMAIL_ENABLED) == (587, True, 5, True)


def test_email_host_needs_a_sender(load_settings):
    with pytest.raises(ImproperlyConfigured):
        load_settings(DEBUG="True", EMAIL_HOST="smtp.ejemplo.test")


def test_the_links_use_the_canonical_domain(load_settings):
    loaded = load_settings(CANONICAL_HOST="pasteleriailusion.me", ALLOWED_HOSTS="pasteleriailusion.me,www.pasteleriailusion.me")
    assert loaded.SITE_URL == "https://pasteleriailusion.me"


def test_with_email_host_in_production_the_canonical_host_is_required(load_settings):
    # Sin él, los enlaces de los correos y el QR de la nota caerían en localhost.
    with pytest.raises(ImproperlyConfigured, match="CANONICAL_HOST"):
        load_settings(DEBUG="False", CORS_ALLOWED_ORIGINS="", EMAIL_HOST="smtp.ejemplo.test", DEFAULT_FROM_EMAIL="Pastelería <pedidos@ejemplo.test>")


def test_with_email_host_in_production_and_the_canonical_host_it_loads(load_settings):
    loaded = load_settings(
        DEBUG="False",
        CORS_ALLOWED_ORIGINS="",
        EMAIL_HOST="smtp.ejemplo.test",
        DEFAULT_FROM_EMAIL="Pastelería <pedidos@ejemplo.test>",
        CANONICAL_HOST="pasteleriailusion.me",
        ALLOWED_HOSTS="pasteleriailusion.me,www.pasteleriailusion.me",
    )
    assert loaded.SITE_URL == "https://pasteleriailusion.me"
