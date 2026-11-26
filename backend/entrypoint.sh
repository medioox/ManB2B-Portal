#!/bin/sh
set -e
# Role is selected by the first argument so one image serves web / worker / beat / migrate.
case "$1" in
  web)
    python manage.py collectstatic --noinput >/dev/null
    exec gunicorn config.wsgi:application -c gunicorn.conf.py
    ;;
  worker)
    exec celery -A config worker -l info -Q "${CELERY_QUEUES:-default,notifications,integrations,reports}" \
      --concurrency "${CELERY_CONCURRENCY:-4}" --max-tasks-per-child 500
    ;;
  beat)
    exec celery -A config beat -l info
    ;;
  migrate)
    python manage.py migrate --noinput
    ;;
  seed)
    python manage.py migrate --noinput
    python manage.py seed_demo
    ;;
  *)
    exec "$@"
    ;;
esac
