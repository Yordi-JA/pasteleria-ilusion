"""La nota en PDF va adjunta al correo "Recibimos tu pago" y a ningún otro (D70, D69).

Es el mismo PDF que entrega `GET orders/<id>/note.pdf`, armado por el mismo código. Si no se puede armar, el correo sale
igual sin adjunto y queda un WARNING con el id del pedido.
"""
import logging

import pytest
from django.core import mail
from django.test import Client
from rest_framework.test import APIClient

from core_pasteleria.api import note_pdf
from core_pasteleria.models import Order
from core_pasteleria.services.orders import note_document, order_status
from tests.payment_fakes import gateways  # noqa: F401 - pasarelas simuladas
from tests.test_cash_payment_admin import superuser  # noqa: F401 - fixture del personal
from tests.test_order_admin import change_post
from tests.test_orders_api import body, design_line, offering, post
from tests.test_orders_api import bakery_clock  # noqa: F401 - fija la hora de la pastelería
from tests.test_payment_webhooks import mp_notify, mp_payment, started_with_mercadopago, webhook  # noqa: F401
from tests.test_payments_api import pay

pytestmark = pytest.mark.django_db
EMAILS = "core_pasteleria.emails"
ATTACHED_WITH_BASE = "Tu nota va adjunta en PDF y la presentas al devolver la base para recuperar tu depósito."
ATTACHED = "Tu nota va adjunta en PDF."


@pytest.fixture(autouse=True)
def email_on(settings):
    settings.EMAIL_ENABLED = True
    settings.SITE_URL = "https://pasteleriailusion.me"


@pytest.fixture
def api(customer_user):
    client = APIClient()
    client.force_authenticate(customer_user)
    return client


@pytest.fixture
def order(api):
    response = post(api, body(design_line()))
    assert response.status_code == 201, response.json()
    return Order.objects.get(pk=response.json()["id"])


def mark_received(order, staff_user, callbacks):
    with callbacks(execute=True):
        order_status.change_status(order.pk, "awaiting_payment", "received", actor_id=staff_user.pk)


def test_the_payment_email_carries_the_note_pdf(order, staff_user, django_capture_on_commit_callbacks):
    mark_received(order, staff_user, django_capture_on_commit_callbacks)
    (message,) = mail.outbox
    assert message.subject == f"Recibimos tu pago del pedido #{order.pk}"
    assert len(message.attachments) == 1
    name, content, mimetype = message.attachments[0]
    assert (name, mimetype) == (f"nota-pedido-{order.pk}.pdf", "application/pdf")
    assert content.startswith(b"%PDF")


def test_the_attachment_is_built_like_the_download(order, api, staff_user, monkeypatch, django_capture_on_commit_callbacks):
    # Mismo renderizador, misma nota y mismo enlace firmado del QR en los dos caminos.
    calls = []
    original = note_pdf.render_note

    def spy(note, url):
        calls.append((note, url))
        return original(note, url)

    monkeypatch.setattr(note_pdf, "render_note", spy)
    mark_received(order, staff_user, django_capture_on_commit_callbacks)
    assert api.get(f"/api/v1/orders/{order.pk}/note.pdf").status_code == 200
    (emailed, downloaded) = calls
    assert emailed == downloaded
    assert emailed[1] == f"https://pasteleriailusion.me/nota/{order.note_token}"


def test_the_body_says_the_note_is_attached_and_mentions_the_deposit_when_there_is_a_base(
    order, staff_user, django_capture_on_commit_callbacks
):
    mark_received(order, staff_user, django_capture_on_commit_callbacks)
    message = mail.outbox[0]
    assert ATTACHED_WITH_BASE in message.body
    assert ATTACHED_WITH_BASE in message.alternatives[0][0]


def test_without_a_base_the_sentence_does_not_mention_the_deposit(api, staff_user, django_capture_on_commit_callbacks):
    response = post(api, body({"kind": "order", "offering_id": offering("tres-leches-de-durazno").id, "quantity": 1}))
    assert response.status_code == 201, response.json()
    order = Order.objects.get(pk=response.json()["id"])
    mark_received(order, staff_user, django_capture_on_commit_callbacks)
    message = mail.outbox[0]
    for content in (message.body, message.alternatives[0][0]):
        assert ATTACHED in content
        assert "depósito" not in content.split(ATTACHED)[1].split("\n")[0]
        assert ATTACHED_WITH_BASE not in content
    assert len(message.attachments) == 1


def test_it_is_attached_when_the_mercado_pago_webhook_receives_the_order(
    api, webhook, gateways, django_capture_on_commit_callbacks  # noqa: F811
):
    order = started_with_mercadopago(api, gateways)
    mp_payment(gateways, order)
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        assert mp_notify(webhook).status_code == 200
    (message,) = [m for m in mail.outbox if m.subject.startswith("Recibimos tu pago")]
    assert [(name, mimetype) for name, _, mimetype in message.attachments] == [
        (f"nota-pedido-{order.pk}.pdf", "application/pdf")
    ]
    assert message.attachments[0][1].startswith(b"%PDF")


def test_it_is_attached_when_the_cash_is_recorded_in_the_admin(
    order, superuser, django_capture_on_commit_callbacks  # noqa: F811
):
    client = Client()
    client.force_login(superuser)
    with django_capture_on_commit_callbacks(execute=True):
        assert change_post(client, order, status="received").status_code == 302
    (message,) = mail.outbox
    assert [(name, mimetype) for name, _, mimetype in message.attachments] == [
        (f"nota-pedido-{order.pk}.pdf", "application/pdf")
    ]
    assert message.attachments[0][1].startswith(b"%PDF")


def test_a_render_failure_sends_the_email_without_the_attachment(
    order, staff_user, customer_user, monkeypatch, caplog, django_capture_on_commit_callbacks
):
    def broken(note):
        raise RuntimeError(f"falló con {customer_user.email}")

    monkeypatch.setattr(note_document, "render_pdf", broken)
    with caplog.at_level(logging.INFO, logger=EMAILS):
        mark_received(order, staff_user, django_capture_on_commit_callbacks)
    order.refresh_from_db()
    assert order.status == "received"
    (message,) = mail.outbox
    assert message.attachments == []
    assert ATTACHED not in message.body and ATTACHED not in message.alternatives[0][0]
    warnings = [r for r in caplog.records if r.name == EMAILS and r.levelno == logging.WARNING]
    assert len(warnings) == 1 and str(order.pk) in warnings[0].getMessage()
    assert customer_user.email not in warnings[0].getMessage()
    assert f"Correo payment_received del pedido {order.pk} enviado" in caplog.text


def test_other_emails_have_no_attachment(order, staff_user, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        for current, new in (
            ("awaiting_payment", "received"),
            ("received", "in_preparation"),
            ("in_preparation", "ready_for_delivery"),
        ):
            order_status.change_status(order.pk, current, new, actor_id=staff_user.pk)
    paid, ready = mail.outbox
    assert len(paid.attachments) == 1
    assert ready.subject == f"Tu pedido #{order.pk} está listo"
    assert ready.attachments == []
    assert ATTACHED not in ready.body


def test_a_cancelled_order_has_no_note_so_nothing_is_attached(order, staff_user, django_capture_on_commit_callbacks):
    from core_pasteleria.services import email_service

    Order.objects.filter(pk=order.pk).update(status="cancelled")
    with django_capture_on_commit_callbacks(execute=True):
        assert email_service.send_order_email(email_service.PAYMENT_RECEIVED, order.pk)
    assert mail.outbox[0].attachments == []


def test_other_kinds_never_ask_for_the_note():
    from core_pasteleria.services import email_service

    kinds = {email_service.PAYMENT_RECEIVED: True, email_service.ORDER_READY: False}
    assert {kind: kind.attach_note for kind in kinds} == kinds
