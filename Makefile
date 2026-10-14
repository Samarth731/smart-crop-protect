# Smart Crop Protect: reproduce the data, models and app from scratch.
UV ?= uv

.PHONY: setup data train export web dev test api clean

setup:            ## install Python (ml, api) and Node dependencies
	cd ml && $(UV) sync --extra dev
	cd api && $(UV) venv && $(UV) pip install -e ".[dev]"
	cd web && npm ci

data:             ## download raw data, geocode districts, fetch NASA POWER weather, harmonise yields
	cd ml && $(UV) run python -m scp_ml.data.download
	cd ml && $(UV) run python -m scp_ml.data.geo
	cd ml && $(UV) run python -m scp_ml.data.weather
	cd ml && $(UV) run python -m scp_ml.data.apy

train:            ## train + evaluate the yield and price models (writes ml/reports, web/public/models)
	cd ml && $(UV) run python -m scp_ml.train.yield_model
	cd ml && $(UV) run python -m scp_ml.train.price_model

train-leaf:       ## fine-tune the leaf disease CNN (needs the vision extra and ~3 GB free disk)
	cd ml && $(UV) sync --extra vision && $(UV) run python -m scp_ml.train.leaf_model

export:           ## write web data shards, golden test fixtures and model-card metrics
	cd ml && $(UV) run python -m scp_ml.export.web_data
	cd ml && $(UV) run python -m scp_ml.export.metrics

dev:              ## run the web app locally
	cd web && npm run dev

api:              ## run the model-serving API locally
	cd api && .venv/bin/uvicorn app.main:app --reload

test:             ## all test suites
	cd ml && $(UV) run pytest -q
	cd api && .venv/bin/python -m pytest -q
	cd web && npm test

web:              ## production build of the PWA
	cd web && npm run build

clean:
	rm -rf web/dist ml/.pytest_cache api/.pytest_cache
