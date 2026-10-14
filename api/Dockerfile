FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SCP_ASSETS=/srv/assets
COPY api/pyproject.toml ./
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" numpy onnxruntime pillow python-multipart
COPY api/app ./app
# models and data shards produced by the ML pipeline
COPY web/public/models ./assets/models
COPY web/public/data ./assets/data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
