"""Respaldo de la SPA de React y servicio del build, con un `dist/` falso."""
import pytest
from django.test import Client

MARKER = "<!--index-falso-de-pruebas-->"
ASSET = "/assets/app-12345678.js"


@pytest.fixture
def dist(tmp_path, settings):
    """`dist/` de mentira en un directorio temporal; no depende del build real."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(f"<!doctype html>{MARKER}", encoding="utf-8")
    (tmp_path / "assets" / "app-12345678.js").write_text("console.log(1)", encoding="utf-8")
    settings.FRONTEND_DIST = tmp_path
    settings.WHITENOISE_ROOT = tmp_path
    return tmp_path


@pytest.fixture
def web(dist):
    # Se crea después de fijar la configuración: WhiteNoise lee WHITENOISE_ROOT
    # al construir el middleware, en la primera petición de este cliente.
    return Client()


def _text(response):
    body = b"".join(response.streaming_content) if response.streaming else response.content
    return body.decode()


@pytest.mark.parametrize("path", ["/", "/catalogo", "/cuenta/bases", "/pedido/3/seguimiento"])
def test_site_routes_return_the_index(web, path):
    response = web.get(path)
    assert response.status_code == 200
    assert MARKER in _text(response)
    assert response["Content-Type"].startswith("text/html")


def test_fallback_index_is_never_cached(web):
    assert web.get("/catalogo")["Cache-Control"] == "no-cache"


def test_fallback_accepts_head_but_not_post(web):
    assert web.head("/catalogo").status_code == 200
    assert web.post("/catalogo").status_code == 405


@pytest.mark.parametrize("path", ["/api/v1/noexiste/", "/api/", "/api"])
def test_unknown_api_route_is_a_json_404_without_the_index(web, path):
    response = web.get(path)
    assert response.status_code == 404
    assert response["Content-Type"] == "application/json"
    assert response.json() == {"detail": "No encontrado."}
    assert MARKER not in response.content.decode()


def test_api_routes_are_not_shadowed_by_the_fallback(web):
    # Existe y exige ser personal: 401, no el index.
    assert web.get("/api/v1/docs/").status_code == 401
    assert web.get("/api/v1/schema/").status_code == 401


def test_admin_keeps_responding(web):
    response = web.get("/admin/login/")
    assert response.status_code == 200
    assert MARKER not in response.content.decode()


def test_unknown_admin_route_goes_to_the_admin_login_not_the_index(web):
    response = web.get("/admin/no-existe/")
    assert response.status_code == 302
    assert response["Location"] == "/admin/login/?next=/admin/no-existe/"
    assert MARKER not in response.content.decode()


def test_admin_without_slash_redirects_to_admin(web):
    response = web.get("/admin")
    assert response.status_code == 301
    assert response["Location"] == "/admin/"


@pytest.mark.parametrize("path", ["/media/x.jpg", "/media/", "/media"])
def test_nothing_serves_media(web, path):
    response = web.get(path)
    assert response.status_code == 404
    assert MARKER not in response.content.decode()


@pytest.mark.parametrize("path", ["/static/no-existe.css", "/assets/falta.js", "/robots.txt"])
def test_missing_files_are_404_not_the_index(web, path):
    response = web.get(path)
    assert response.status_code == 404
    assert MARKER not in response.content.decode()


def test_build_assets_are_served_as_immutable(web):
    response = web.get(ASSET)
    assert response.status_code == 200
    assert "immutable" in response["Cache-Control"]
    assert "max-age=31536000" in response["Cache-Control"]


def test_index_html_served_by_whitenoise_is_framed_denied_and_not_cached(web):
    response = web.get("/index.html")
    assert response.status_code == 200
    assert MARKER in _text(response)
    assert response["X-Frame-Options"] == "DENY"
    assert response["Cache-Control"] == "no-cache"


def test_whitenoise_files_carry_x_frame_options_too(web):
    response = web.get(ASSET)
    assert response["X-Frame-Options"] == "DENY"
    assert "immutable" in response["Cache-Control"]


def test_site_routes_also_carry_x_frame_options(web):
    assert web.get("/catalogo")["X-Frame-Options"] == "DENY"


def test_real_build_has_no_source_maps(settings):
    # Se prueba el build real (si existe): un mapa expone el código fuente.
    dist = settings.FRONTEND_DIST
    if not (dist / "index.html").is_file():
        pytest.skip("No hay build en frontend/dist")
    assert list(dist.rglob("*.map")) == []
    for file in dist.rglob("*"):
        if file.suffix in {".js", ".css"}:
            assert "sourceMappingURL" not in file.read_text(encoding="utf-8")


def test_without_a_build_the_site_routes_are_404(settings, tmp_path):
    settings.FRONTEND_DIST = tmp_path / "no-existe"
    assert Client().get("/catalogo").status_code == 404
