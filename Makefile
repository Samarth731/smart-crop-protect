# Smart Crop Protect: reproduce the data, models and app from scratch.
UV ?= uv

.PHONY: setup data train export mandi web dev test api clean

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

train-leaf:       ## build the leaf image dataset and fine-tune the CNN (vision extra, ~3 GB free disk)
	cd ml && $(UV) sync --extra dev --extra vision
	cd ml && $(UV) run python -m scp_ml.data.leaves
	cd ml && $(UV) run python -m scp_ml.train.leaf_model
	cd ml && $(UV) run python -m scp_ml.export.metrics

mandi:            ## fetch live mandi prices (data.gov.in only answers from India) and publish them
	@test -n "$$DATA_GOV_IN_API_KEY" || { echo 'First run:  read -s DATA_GOV_IN_API_KEY && export DATA_GOV_IN_API_KEY'; exit 1; }
	cd ml && $(UV) run python -m scp_ml.data.mandi
	git add web/public/data/mandi.json
	git diff --cached --quiet -- web/public/data/mandi.json || { git commit -m "data: live mandi prices ($$(date +%Y-%m-%d))" -- web/public/data/mandi.json && git push; }

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
