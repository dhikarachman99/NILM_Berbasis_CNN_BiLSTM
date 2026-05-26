# Hugging Face Spaces (Docker SDK) — NILM ML service
# https://huggingface.co/docs/hub/spaces-sdks-docker

FROM python:3.11-slim-bookworm

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY ml_service/requirements.txt /code/ml_service/requirements.txt
RUN pip install --no-cache-dir -r /code/ml_service/requirements.txt

COPY ml_service /code/ml_service
COPY src/nilm_models_v9 /code/src/nilm_models_v9

ENV NILM_MODEL_DIR=src/nilm_models_v9
ENV NILM_DEPLOY_TARGET=huggingface
ENV NILM_PRELOAD_MODEL=1
ENV PORT=7860
ENV CORS_ORIGINS=*

WORKDIR /code/ml_service
EXPOSE 7860

# HF Spaces expect port 7860; --preload loads TensorFlow once at startup
CMD gunicorn --preload --bind 0.0.0.0:7860 --workers 1 --threads 2 --timeout 180 app:app
