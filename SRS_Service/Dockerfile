# SRS Service — FastAPI requirements/UML pipeline (§10.4 containerization)
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# faiss-cpu / pdf libs ship wheels. If a transitive dep needs a compiler on a
# future bump, add build-essential here.
COPY requirements_srs.txt ./
RUN python -m pip install --upgrade pip && \
    pip install -r requirements_srs.txt

COPY . .

EXPOSE 8001
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001"]
