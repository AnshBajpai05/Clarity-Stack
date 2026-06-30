# UML-Clarity backend — FastAPI + server-side LLM proxy (/api/llm) (§10.4)
#
# Holds NVIDIA_API_KEY / NVIDIA_API_KEY_2 server-side (§1.6 — keys never reach
# the browser); the UML UI calls this proxy, not the vendor directly.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements_uml_backend.txt ./
RUN python -m pip install --upgrade pip && \
    pip install -r requirements_uml_backend.txt

COPY . .

EXPOSE 8005
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
