FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PORT=8080
ENV PADDLE_OCR_BASE_DIR=/tmp/.paddleocr
ENV HOME=/tmp

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

RUN mkdir -p /tmp/.paddleocr /tmp/.cache

COPY sitecustomize.py ./sitecustomize.py
RUN cp ./sitecustomize.py /usr/local/lib/python3.11/site-packages/sitecustomize.py
COPY app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
