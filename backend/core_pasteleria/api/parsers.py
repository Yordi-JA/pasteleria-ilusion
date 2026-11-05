"""Parsers de la API: JSON con tope de tamaño y de anidación."""
import io

from rest_framework import status
from rest_framework.exceptions import APIException, ParseError
from rest_framework.parsers import JSONParser

# Las peticiones JSON de la API son elecciones cortas; las subidas de imágenes
# usarán su propio parser multipart con su propio tope.
MAX_JSON_BODY_BYTES = 16 * 1024


class RequestBodyTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "La petición es demasiado grande."
    default_code = "request_too_large"


class BoundedJSONParser(JSONParser):
    """`JSONParser` con tope de `MAX_JSON_BODY_BYTES` y sin 500 por anidamiento.

    Primero revisa el `Content-Length` declarado: si pasa del tope, 413 sin
    leer el cuerpo. El tope de lectura (nunca más de `MAX_JSON_BODY_BYTES` + 1
    bytes) es defensa en profundidad por si el encabezado miente. Un cuerpo
    sin longitud declarada (chunked) no llega al parser: DRF lo trata como
    vacío y la vista recibe `{}`. Un JSON tan anidado que agota la recursión
    de Python es un error del cliente (400 "JSON inválido."), no un 500.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        request = (parser_context or {}).get("request")
        declared = request.META.get("CONTENT_LENGTH") if request is not None else None
        if str(declared or "").isdigit() and int(declared) > MAX_JSON_BODY_BYTES:
            raise RequestBodyTooLarge()
        body = stream.read(MAX_JSON_BODY_BYTES + 1)
        if len(body) > MAX_JSON_BODY_BYTES:
            raise RequestBodyTooLarge()
        try:
            return super().parse(io.BytesIO(body), media_type, parser_context)
        except RecursionError as error:
            raise ParseError("JSON inválido.") from error
