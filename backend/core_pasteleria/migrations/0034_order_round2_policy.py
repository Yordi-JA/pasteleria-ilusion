"""Ronda 2 de la API de pedidos (D63, 14 de noviembre de 2026).

`PolicySettings.quote_expiry_hours` queda vacío (PENDIENTE, lo decidió el usuario): la `0032` le puso 24, una cifra
que la pastelería no dio. Se quita y se vuelve a agregar para que la fila existente quede vacía sin una migración de
datos; ningún despliegue tiene todavía la `0032`. Cambian además los textos de ayuda del tope de pedidos sin pagar (las
cotizaciones tienen su propio tope) y del total del diseño.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core_pasteleria", "0033_seed_decoration_accepts_color"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="policysettings",
            name="policysettings_order_limits_positive",
        ),
        migrations.RemoveField(
            model_name="policysettings",
            name="quote_expiry_hours",
        ),
        migrations.AddField(
            model_name="policysettings",
            name="quote_expiry_hours",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text=(
                    "Vacío es PENDIENTE: un pedido en pausa por cotización no vence. Con un valor, el pedido que sigue "
                    "sin precio se cancela pasadas estas horas y devuelve su lapso."
                ),
                null=True,
                verbose_name="horas para cotizar un pedido",
            ),
        ),
        migrations.AlterField(
            model_name="policysettings",
            name="max_unpaid_orders_per_customer",
            field=models.PositiveSmallIntegerField(
                db_default=2,
                default=2,
                help_text=(
                    "Cuántos pedidos apartados sin pagar puede tener un cliente a la vez. Los que esperan cotización "
                    "tienen su propio tope. Propuesto: 2; la pastelería puede ajustarlo."
                ),
                verbose_name="pedidos sin pagar por cliente",
            ),
        ),
        migrations.AlterField(
            model_name="cakedesign",
            name="total",
            field=models.DecimalField(
                decimal_places=2,
                help_text=(
                    "Sin el depósito de la base. Con una decoración por cotizar, sin la decoración hasta que la "
                    "pastelería le pone precio."
                ),
                max_digits=10,
                verbose_name="total",
            ),
        ),
        migrations.AddConstraint(
            model_name="policysettings",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("payment_window_minutes__gt", 0),
                    ("max_unpaid_orders_per_customer__gt", 0),
                    ("max_days_ahead__gt", 0),
                    ("max_pieces_per_line__gt", 0),
                    ("max_pieces_per_order__gt", 0),
                    ("max_quote_orders_per_customer__gt", 0),
                    ("max_unpaid_showcase_pieces__gt", 0),
                ),
                name="policysettings_order_limits_positive",
                violation_error_message="Los topes de los pedidos deben ser más de 0.",
            ),
        ),
        migrations.AddConstraint(
            model_name="policysettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("quote_expiry_hours__isnull", True), ("quote_expiry_hours__gt", 0), _connector="OR"),
                name="policysettings_quote_expiry_positive",
                violation_error_message="Las horas para cotizar deben ser más de 0, o vacías (PENDIENTE).",
            ),
        ),
    ]
