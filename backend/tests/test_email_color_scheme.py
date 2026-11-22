"""Los correos siempre en el tema claro (correcciones del 21 de noviembre de 2026).

Cada plantilla HTML de correo se pinta con lo mínimo y se revisa que pida el esquema claro (meta etiquetas y CSS), que no dependa
de ``prefers-color-scheme``, que traiga las reglas de Outlook para deshacer su modo oscuro y que cada contenedor y cada texto
lleven su fondo y su color en línea: los clientes que oscurecen el correo los cambian cuando faltan.
"""
import re
from pathlib import Path

import pytest
from django.conf import settings
from django.template.loader import render_to_string

from core_pasteleria.services.email_service import TEMPLATE_DIR

EMAIL_TEMPLATES = sorted(
    path.name
    for path in (Path(settings.BASE_DIR) / "core_pasteleria" / "templates" / TEMPLATE_DIR).glob("*.html")
    # `base.html` es el marco que heredan todas y los que empiezan con `_` son piezas que se incluyen.
    if path.name != "base.html" and not path.name.startswith("_")
)

# Lo que llena todos los bloques: con datos, la tarjeta pinta sus renglones (`_detail.html`) y el pie, sus enlaces.
CONTEXT = {
    "number": 102,
    "card": "Pedido #102",
    "status": "Recibido",
    "url": "https://pasteleriailusion.me/cuenta/pedidos/102",
    "home_url": "https://pasteleriailusion.me/",
    "logo_url": "https://pasteleriailusion.me/correo/ilusion-logo.png",
    "address": "Calle Ficticia 12",
    "directions_url": "https://www.google.com/maps/search/?api=1&query=Calle",
    "whatsapp": "55 1234 5678",
    "whatsapp_url": "https://wa.me/525512345678",
    "pickup": "domingo 29 de noviembre de 2026, de 11:30 a 12:00",
    "pickup_day": "domingo 29",
    "pay_today": "$1,015.00",
    "pay_on_delivery": "$1,015.00",
    "stand_deposit": "$90.00",
    "price": "$1,800.00",
    "event_day": "domingo 29 de noviembre",
    "valid_until": "sábado 28 de noviembre",
    "occasion": "Cumpleaños",
    "expires": "24 horas",
    "request": {"people": 20, "quote_note": "Lleva fresas."},
}


def test_there_are_email_templates_to_check():
    assert "payment_received.html" in EMAIL_TEMPLATES and len(EMAIL_TEMPLATES) >= 7, EMAIL_TEMPLATES


@pytest.mark.parametrize("template", EMAIL_TEMPLATES)
def test_every_email_asks_for_the_light_scheme_only(template):
    html = render_to_string(f"{TEMPLATE_DIR}/{template}", CONTEXT)
    assert '<meta name="color-scheme" content="light only">' in html
    assert '<meta name="supported-color-schemes" content="light">' in html
    assert ":root{color-scheme:light only;supported-color-schemes:light;}" in html
    assert "color-scheme:light only" in re.search(r"<body[^>]*>", html)[0]
    # Ningún estilo para el modo oscuro: el correo se ve igual en los dos.
    assert "prefers-color-scheme" not in html
    # Outlook.com y su app marcan lo que oscurecen; las reglas devuelven los colores claros.
    for rule in ("[data-ogsb] .bg-nata", "[data-ogsb] .bg-fresa", "[data-ogsb] .bg-betun", "[data-ogsc] .ink", "[data-ogsc] .on-dark"):
        assert rule in html, rule
    # Los comentarios de la plantilla no salen en el correo.
    assert "Siempre en el tema claro" not in html


@pytest.mark.parametrize("template", EMAIL_TEMPLATES)
def test_every_container_and_text_carries_its_colors_inline(template):
    html = render_to_string(f"{TEMPLATE_DIR}/{template}", CONTEXT)
    # Sin los bloques de Outlook (`<!--[if mso]>`), que solo lee el Outlook de escritorio.
    visible = re.sub(r"<!--\[if mso\]>.*?<!\[endif\]-->", "", html, flags=re.S)
    containers = re.findall(r"<(?:body|table|td)\b[^>]*>", visible)
    assert containers
    for tag in containers:
        assert re.search(r'bgcolor="#[0-9a-f]{6}"', tag) and "background-color:#" in tag, tag
    texts = re.findall(r"<(?:p|h1|h2|a)\b[^>]*>", visible)
    assert texts
    for tag in texts:
        assert re.search(r"[;\"]color:#[0-9a-f]{6}", tag), tag
    # Un segundo `class` en la misma etiqueta se ignora: las reglas de Outlook no encontrarían su clase.
    assert not re.search(r'<[^>]*\bclass="[^"]*"[^>]*\bclass="', visible)
    # La franja del logo solo lleva la imagen: su fondo va también como imagen, que Gmail en iOS no invierte.
    assert "background-image:linear-gradient(#f9c1c1,#f9c1c1)" in visible
