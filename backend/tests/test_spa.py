"""Respaldo de la SPA de React y servicio del build, con un `dist/` falso."""
import gzip
import json

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


@pytest.mark.parametrize("path", ["/static/no-existe.css", "/assets/falta.js", "/sitemap.xml"])
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


# Archivos que Vite copia de `frontend/public/` a la raíz del build (D47).
ROOT_FILES = {
    "/robots.txt": ("text/plain", b"User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n"),
    "/favicon.ico": ("image/", b"\x00\x00\x01\x00"),
    "/favicon.svg": ("image/svg+xml", b"<svg xmlns='http://www.w3.org/2000/svg'/>"),
    "/apple-touch-icon.png": ("image/png", b"\x89PNG\r\n\x1a\n"),
}


@pytest.fixture
def web_with_root_files(dist):
    for url, (_, content) in ROOT_FILES.items():
        (dist / url.lstrip("/")).write_bytes(content)
    return Client()


@pytest.mark.parametrize("url", sorted(ROOT_FILES))
def test_root_files_of_the_build_are_served_as_files_not_the_index(web_with_root_files, url):
    # WhiteNoise los sirve desde la raíz del build antes de llegar al respaldo de la SPA.
    content_type, content = ROOT_FILES[url]
    response = web_with_root_files.get(url)
    assert response.status_code == 200
    assert response["Content-Type"].startswith(content_type)
    body = b"".join(response.streaming_content) if response.streaming else response.content
    assert body == content
    assert MARKER.encode() not in body
    # No llevan hash en el nombre: nunca se marcan como inmutables.
    assert "immutable" not in response.get("Cache-Control", "")


def test_robots_keeps_crawlers_out_of_admin_and_api(settings):
    # Se prueba el archivo que se versiona, no un `dist/` de mentira.
    robots = (settings.BASE_DIR.parent / "frontend" / "public" / "robots.txt").read_text(encoding="utf-8")
    lines = robots.splitlines()
    assert "User-agent: *" in lines
    assert "Disallow: /admin/" in lines
    assert "Disallow: /api/" in lines


def test_real_build_ships_robots_and_the_favicons(settings):
    dist = settings.FRONTEND_DIST
    if not (dist / "index.html").is_file():
        pytest.skip("No hay build en frontend/dist")
    for url in ROOT_FILES:
        assert (dist / url.lstrip("/")).is_file(), f"Falta {url} en el build"


@pytest.fixture
def compressed_web(dist):
    """Como `frontend/scripts/compress-dist.mjs`: variantes `.br` y `.gz` junto al original."""
    (dist / "assets" / "app-12345678.js.br").write_bytes(b"br-falso")
    (dist / "assets" / "app-12345678.js.gz").write_bytes(b"gzip-falso")
    return Client()


@pytest.mark.parametrize(
    ("accept", "encoding", "body"),
    [("br, gzip", "br", b"br-falso"), ("gzip", "gzip", b"gzip-falso")],
)
def test_build_assets_use_the_precompressed_variant(compressed_web, accept, encoding, body):
    response = compressed_web.get(ASSET, headers={"accept-encoding": accept})
    assert response["Content-Encoding"] == encoding
    assert b"".join(response.streaming_content) == body
    assert "Accept-Encoding" in response["Vary"]
    assert "immutable" in response["Cache-Control"]


def test_build_assets_without_accept_encoding_are_served_as_is(compressed_web):
    response = compressed_web.get(ASSET)
    assert "Content-Encoding" not in response
    assert "Accept-Encoding" in response["Vary"]
    assert b"".join(response.streaming_content) == b"console.log(1)"


def test_accept_encoding_br_on_a_file_without_variants_returns_the_original(web):
    response = web.get(ASSET, headers={"accept-encoding": "br"})
    assert response.status_code == 200
    assert "Content-Encoding" not in response
    assert b"".join(response.streaming_content) == b"console.log(1)"


def test_build_script_runs_the_compression(settings):
    # No depende de que `dist/` sea reciente: si el paso sale del build, esta falla.
    package = json.loads((settings.BASE_DIR.parent / "frontend" / "package.json").read_text(encoding="utf-8"))
    assert "compress-dist.mjs" in package["scripts"]["build"]


def test_real_build_variants_match_their_originals(settings):
    """Valida las variantes del último `npm run build` (el script `compress-dist.mjs`)."""
    dist = settings.FRONTEND_DIST
    if not (dist / "index.html").is_file():
        pytest.skip("No hay build en frontend/dist")
    brotli = pytest.importorskip("brotli")
    variants = [p for p in dist.rglob("*") if p.suffix in (".br", ".gz")]
    for variant in variants:
        original = variant.with_suffix("")
        assert original.is_file(), f"{variant.name} no tiene original"
        assert original.suffix not in (".br", ".gz"), f"{variant.name} es una variante de una variante"
        decompress = gzip.decompress if variant.suffix == ".gz" else brotli.decompress
        data = decompress(variant.read_bytes())
        assert data == original.read_bytes(), f"{variant.name} no coincide con su original"
        assert variant.stat().st_size < original.stat().st_size
    biggest = max((dist / "assets").glob("*.js"), key=lambda p: p.stat().st_size)
    assert biggest.with_name(biggest.name + ".br").is_file()
    assert biggest.with_name(biggest.name + ".gz").is_file()


def test_without_a_build_the_site_routes_are_404(settings, tmp_path):
    settings.FRONTEND_DIST = tmp_path / "no-existe"
    assert Client().get("/catalogo").status_code == 404
