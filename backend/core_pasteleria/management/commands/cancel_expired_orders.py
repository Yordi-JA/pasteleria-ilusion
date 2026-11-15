"""`manage.py cancel_expired_orders`: cancela los pedidos vencidos y devuelve lo que apartaron (D63, ronda 2).

Pensado para Heroku Scheduler, cada 10 minutos (`python manage.py cancel_expired_orders`). Se puede correr las veces
que sea, incluso dos a la vez: cada pedido se cancela y se reintegra una sola vez.
"""
from django.core.management.base import BaseCommand

from ...services.orders import order_status


class Command(BaseCommand):
    help = (
        "Cancela los apartados con el plazo para pagar cumplido y, si la pastelería fijó las horas para cotizar, las "
        "cotizaciones sin precio. Devuelve la vitrina y el pan que apartaron y borra las imágenes de sus diseños."
    )

    def handle(self, *args, **options):
        cancelled = order_status.cancel_expired_orders()
        self.stdout.write(f"Pedidos cancelados: {cancelled}")
