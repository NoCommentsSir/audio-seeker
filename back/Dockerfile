FROM python:3.11.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq-dev \
    curl \
    gcc

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

COPY back /app/back
COPY db /app/db
COPY scripts /app/scripts
COPY tracks /app/tracks

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "back.app.api:api" , "--host", "0.0.0.0", "--port", "8000"]
