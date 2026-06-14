FROM python:3.11.9-slim as builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

FROM python:3.11.9-slim as runner

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq5 \
    && groupadd --system appgroup \
    && useradd --system --gid appgroup --home-dir /app appuser \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY back /app/back
COPY db /app/db
COPY scripts /app/scripts
COPY tracks /app/tracks

RUN chown -R appuser:appgroup /app

ENV PYTHONPATH=/app
EXPOSE 8000

USER appuser

CMD ["uvicorn", "back.app.api:api" , "--host", "0.0.0.0", "--port", "8000"]
