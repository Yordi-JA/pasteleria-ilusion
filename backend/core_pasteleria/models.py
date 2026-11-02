"""Tablas y relaciones del dominio (ORM sobre PostgreSQL)."""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower


class UserManager(BaseUserManager):
    """Crea usuarios identificados por correo, sin username."""

    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email):
        """Quita espacios y pasa todo el correo a minúsculas.

        Django solo pasa el dominio a minúsculas; aquí también la parte local,
        para que `Ana@x.com` y `ana@x.com` sean la misma cuenta.
        """
        return super().normalize_email((email or "").strip()).lower()

    def get_by_natural_key(self, email):
        # Es lo que usa el inicio de sesión: debe normalizar igual que al guardar.
        return super().get_by_natural_key(self.normalize_email(email))

    def _create(self, email, password, **extra_fields):
        email = self.normalize_email(email)
        if not email:
            raise ValueError("El correo es obligatorio.")
        user = self.model(email=email, **extra_fields)
        # Con password=None queda sin contraseña usable (cuentas de Google).
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields["is_staff"] is not True:
            raise ValueError("Un superusuario debe tener is_staff=True.")
        if extra_fields["is_superuser"] is not True:
            raise ValueError("Un superusuario debe tener is_superuser=True.")
        return self._create(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Cuenta del cliente (Google o correo y contraseña) y del personal.

    El correo único es el identificador; no hay username. Las cuentas de
    Google pueden no tener contraseña usable.
    """

    email = models.EmailField("correo", unique=True)
    is_active = models.BooleanField("activo", default=True)
    is_staff = models.BooleanField("es personal", default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"
        constraints = [
            # Última defensa en la base: vale aunque se salte save()
            # (bulk_create, update, SQL directo).
            models.UniqueConstraint(Lower("email"), name="user_email_ci_unique"),
        ]

    def __str__(self):
        return self.email

    def clean(self):
        super().clean()
        # Antes de validate_unique, para que el admin detecte duplicados que
        # solo difieren en mayúsculas.
        self.email = type(self).objects.normalize_email(self.email)

    def save(self, *args, **kwargs):
        self.email = type(self).objects.normalize_email(self.email)
        super().save(*args, **kwargs)
