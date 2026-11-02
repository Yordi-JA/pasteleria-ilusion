web: cd backend && gunicorn config.wsgi --worker-tmp-dir /dev/shm --access-logfile -
release: cd backend && python manage.py migrate --noinput && python manage.py createcachetable
