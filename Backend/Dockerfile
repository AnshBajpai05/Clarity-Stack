# Core Backend — FastAPI (§10.4 containerization)
#
# NOTE: requirements_backend.txt pins the full runtime incl. torch/transformers
# (the optional DistilBERT signal classifier). The image is therefore large
# (~2GB). The model code is lazy, so a slimmer image is possible later by
# splitting ML deps; kept full here for a faithful, reproducible runtime.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# psycopg2-binary / cryptography / grpcio ship wheels, so no compiler is needed.
COPY requirements_backend.txt ./
RUN python -m pip install --upgrade pip && \
    pip install -r requirements_backend.txt

COPY . .

# Alembic is the single source of truth (§2.3). compose sets
# RUN_MIGRATIONS_ON_STARTUP=1 so a fresh Postgres is migrated to head on boot.
ENV RUN_MIGRATIONS_ON_STARTUP=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
