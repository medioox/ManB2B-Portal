"""Gunicorn tuned for bursty B2B traffic: threaded workers, bounded queue, graceful recycling."""
import multiprocessing
import os

bind = "0.0.0.0:8000"
workers = int(os.environ.get("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "gthread"
threads = int(os.environ.get("GUNICORN_THREADS", 4))
backlog = 2048
timeout = 60
graceful_timeout = 30
keepalive = 5
max_requests = 2000          # recycle workers to cap memory growth
max_requests_jitter = 200
accesslog = "-"
errorlog = "-"
forwarded_allow_ips = "*"
