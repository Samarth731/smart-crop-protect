# Model cards

Every number here is reproducible with `make data train export` and is regenerated into the app's
[How the AI works](https://samarth731.github.io/smart-crop-protect/ai) page from `ml/reports/*.json`.

---

## District yield forecaster

| | |
|---|---|
| **Task** | Forecast a district's yield for a crop and season, at sowing or at any point in the season |
| **Model** | `sklearn.ensemble.HistGradientBoostingRegressor`, squared error, 350 iterations, 15 leaves, min 200 samples/leaf, L2 = 2 |
| **Output** | log(yield ÷ district normal) → yield with a split-conformal 80 % interval per crop × season stage |
| **Training data** | DES APY (1997–2022) + UPAg (2013–2024) district statistics, 16 crops, harmonised to 4 seasons; NASA POWER monthly weather at 752 district centroids |
| **Rows** | 494,396 (123,599 district-crop-season-years × 4 in-season cut-offs) |
| **Split** | fit 1999–2017 · calibrate intervals 2018–19 · test 2020–24 |
| **Runtime** | browser: 263 KB JSON trees (73 KB gzip) + pure-TS evaluator; API: ONNX |

### Features (79)
* **Baseline (6)**: log of the district's mean yield over its last ≤ 5 reported years, lagged two years; trend
  slope over ≤ 10 years; coefficient of variation; years of history; log cropped area; district vs state level.
* **Climate (3)**: normal season rainfall, temperature and root-zone wetness for the crop's window.
* **Season weather (16)**: log-ratio rainfall, root-zone wetness and hottest-day temperature anomalies for the
  whole window and its early/middle/late thirds; night-temperature anomaly; counts of dry months and heat-stress
  months. Unobserved months take climatology.
* **Context**: fraction of the season observed; one-hot crop, season and state.

### Results (test 2020–24, full season, n = 28,399)

| Metric | Model | District normal | Trend extrapolation |
|---|---|---|---|
| Median absolute % error | **13.7 %** | 14.7 % | 18.4 % |
| MAE of log yield | **0.204** | 0.228 | 0.276 |
| R² of log yield | 0.938 | | |
| 80 % interval coverage | 84 % | | |

| Season observed | At sowing | ⅓ | ⅔ | Full |
|---|---|---|---|---|
| Skill vs normal | 10.5 % | 10.9 % | 10.9 % | 10.3 % |

| Crop | n | Model MdAPE | Normal MdAPE | Skill |
|---|---|---|---|---|
| Cotton | 998 | 20.3 % | 25.2 % | **+28.8 %** |
| Bajra | 992 | 12.3 % | 13.9 % | +14.1 % |
| Maize | 3,834 | 15.4 % | 18.0 % | +13.4 % |
| Rice | 4,536 | 10.3 % | 11.1 % | +12.9 % |
| Groundnut | 1,899 | 14.8 % | 16.8 % | +12.9 % |
| Soybean | 762 | 14.3 % | 17.9 % | +11.4 % |
| Jowar | 1,241 | 21.2 % | 21.8 % | +9.3 % |
| Chickpea | 1,573 | 13.9 % | 14.4 % | +9.2 % |
| Onion | 511 | 16.8 % | 18.2 % | +9.1 % |
| Moong | 1,932 | 19.3 % | 20.7 % | +8.7 % |
| Sugarcane | 1,254 | 8.3 % | 8.9 % | +6.2 % |
| Mustard | 2,037 | 12.7 % | 12.5 % | +5.8 % |
| Pigeon pea | 1,552 | 17.7 % | 17.6 % | +4.4 % |
| Potato | 820 | 15.3 % | 15.4 % | +3.2 % |
| Urad | 2,284 | 15.7 % | 16.8 % | +1.9 % |
| Wheat | 2,174 | 10.1 % | 9.4 % | +1.2 % |

### Ablation (full-season skill vs normal, same protocol)

| Weather representation | Skill |
|---|---|
| None | 9.6 % |
| **District weather (deployed)** | **10.3 %** |
| District + state anchors | 10.2 % |
| State anchors only | 9.7 % |

The first model used ratio rainfall anomalies and a 31-leaf ensemble: full-season skill was 7.9 % and fell when
weather was observed. Diagnosis: (1) year-level national yields track monsoon rain (r = 0.63) and soil moisture
(r = 0.70) but within-year district variation is mostly survey noise; (2) ratio anomalies are skewed and drifted
during the wet 2019–24 monsoons. Symmetric log-ratio anomalies, heavier regularisation and the ablation above
produced the deployed model. Interaction constraints (weather may not interact with state) lowered skill to
9.4–10.2 %, so they were rejected.

### Limitations
* District averages: a single field can deviate widely. Intervals cover district outcomes, not fields.
* Crop-cutting statistics carry sampling error; some states impute (e.g. identical yields across years).
* No pest outbreaks, hail, policy or input-price effects. Weather is reanalysis at the district centroid.
* Potato and onion statistics end in 2022-23; baselines for 2026 lean on older years.

---

## Market price forecaster

| | |
|---|---|
| **Task** | Retail price 1–6 months ahead for 13 commodities, per DoCA price zone and all-India |
| **Model** | Three `HistGradientBoostingRegressor` quantile models (P10, P50, P90) on log price changes, one global model across ~1,700 series |
| **Features** | 1/2/3/6/12-month log returns, deviation from 12-month mean, 12-month volatility, the series' own past seasonal change for the target months (no look-ahead, unit-tested), national-index momentum, horizon, target month, commodity |
| **Calibration** | conformalized quantile regression on 2019–21 origins; smooth aggregate series get a learned blend with "no change" |
| **Test** | every forecast origin from Jan 2022 |

| Horizon | Zone MAPE | Naive | Seasonal naive | Skill | Coverage | Direction accuracy |
|---|---|---|---|---|---|---|
| 1 month | 2.7 % | 3.2 % | 4.9 % | +14 % | 88 % | 79 % |
| 2 months | 3.5 % | 4.5 % | 7.5 % | +22 % | 94 % | 81 % |
| 3 months | 5.5 % | 6.6 % | 10.2 % | +17 % | 93 % | 77 % |
| 6 months | 9.9 % | 13.0 % | 18.3 % | +23 % | 88 % | 69 % |

Market-level series (165 cities to 2023): +2 % at 1 month rising to +25 % at 6 months, 84–88 % coverage.

### Data quality handled
* Market coverage drops from ~165 cities to 5 zones in 2024: the all-India index is **chain-linked** (median
  month-on-month change of markets reporting in both months), so composition changes do not create jumps.
* The source repeats the previous value when a month is not updated (e.g. Jun–Aug 2026 identical in every zone);
  exact repeats are treated as missing and forecasts start from the last real observation.

### Limitations
Retail prices show market direction, not the farm-gate price. Export bans, stock limits and other policy shocks
are not predictable from price history.

---

## Leaf disease classifier

| | |
|---|---|
| **Task** | Name the disease (or "healthy", or "not a leaf") from one photo of a leaf |
| **Model** | MobileNetV3-Large (ImageNet weights) fine-tuned with PyTorch; 37 classes |
| **Classes** | rice 7 · tomato 10 · cotton 5 · groundnut 5 · maize 4 · potato 3 · bell pepper 2 · not-a-leaf 1 |
| **Training data** | Project-AgML mirrors: PlantVillage (maize, potato, tomato, pepper; capped at 1,200 images per class), Indian rice leaf diseases, rice leaf diseases, cotton leaf diseases, groundnut leaf diseases; plus half of the PlantDoc field photos, up-weighted 3× |
| **Images** | 25,866 lab training · 3,232 validation · 3,247 test · 732 field training · 740 field test |
| **Runtime** | browser, ONNX Runtime Web (WebAssembly), int8: **4.75 MB**, ~100 ms per photo on a laptop |

### Training
* Epoch 1 trains only the new classifier on frozen ImageNet features; epochs 2–8 also fine-tune the
  backbone from block 7 onwards (the stem and 112/56/28 px blocks stay frozen) with AdamW and a cosine
  learning rate, label smoothing 0.1 and a class-balanced sampler.
* Augmentation: random resized crops (35–100 % of the image), flips, ±20° rotation, colour jitter, blur.
* Selection: the epoch with the best lab-validation accuracy (98.0 %, epoch 8).
* Calibration: one temperature (T = 0.58) fitted on lab validation; ECE falls from 10.1 % to 0.6 %.
* Built to train on an 8 GB laptop: images are decoded by a thread pool rather than worker processes,
  frozen early blocks keep no activations, and every epoch is checkpointed (`--resume`).

### Results (the shipped int8 model)

| | Lab test, n = 3,247 | **Field photos (PlantDoc), n = 740** |
|---|---|---|
| Accuracy | **97.5 %** | 53.4 % |
| … with the farmer's crop as a prior (as in the app) | 97.5 % | **59.1 %** |
| Top-3 accuracy (crop known) | 99.9 % | 87.6 % |
| Macro F1 (crop known) | 0.970 | 0.596 |
| Calibration error (ECE) | 0.9 % | 22.1 % |
| Answers when ≥ 50 % sure (crop known) | 99.5 % of photos, 97.7 % correct | 86 % of photos, 63 % correct |

| Crop | Lab test | Field, crop known |
|---|---|---|
| Rice | 98.9 % | not in PlantDoc |
| Cotton | 95.7 % | not in PlantDoc |
| Groundnut | 87.9 % | not in PlantDoc |
| Maize | 99.2 % | 72.3 % |
| Tomato | 97.9 % | 52.9 % |
| Potato | 100 % | 52.3 % |
| Bell pepper | 99.5 % | 67.2 % |

Field photos, trading coverage for accuracy (raw classifier):

| Answer only when confidence ≥ | 30 % | 50 % | 70 % | 90 % |
|---|---|---|---|---|
| Share of photos answered | 95 % | 81 % | 62 % | 39 % |
| Accuracy of those answers | 55 % | 61 % | 66 % | 73 % |

### Quantisation
Static QDQ int8 (per-channel weights, uint8 activations) shrinks the model from 17.0 MB to 4.75 MB. Activation
ranges are calibrated on 300 images, half lab validation and half field training photos, with 99.999th
percentile clipping. MobileNetV3's hard-swish and squeeze-excite layers have outlier activations: min/max and
entropy calibration collapsed to 34 % validation accuracy, dynamic quantisation reached 85 %, and keeping the
first convolution and classifier in float doubled the size for no gain. int8 ships only if it loses ≤ 1.5
points on the selection sets (it lost 0.7). Test-set numbers were not used for any choice. The full-precision
network scores 98.0 % on lab test and 59.3 % on field photos with the crop known.

### Limitations
* **Field photos are the honest number.** Lab images (PlantVillage especially) have plain backgrounds and one
  centred leaf; accuracy falls from ~98 % to ~59 % on cluttered field photos.
* PlantDoc is web-scraped: some photos carry watermarks or are mislabelled, so the field figure is somewhat
  pessimistic. It has no rice, cotton or groundnut photos, so those crops are only tested on lab images.
* Calibration holds on lab images only; on field photos the model is over-confident (ECE 22 %). The app
  shows a top-3 list and asks the farmer to check the visible signs before spraying.
* No wheat, mustard or pulse classes in the training data; the symptom checker covers those crops.
* Groundnut is the weakest lab crop (88 %), and its errors are the costly kind: 28 of 37 are early leaf spot
  called *healthy*, whose first lesions are only a few pixels at 256 px. Early and late leaf spot are rarely
  confused with each other (2 errors) and share one "tikka" advisory anyway.

---

## Agronomic engines

| Engine | Method | Reference |
|---|---|---|
| Soil-water balance | FAO-56 single crop coefficient, stage-wise Kc and root depth, SCS runoff, water-stress coefficient | Allen et al. 1998 |
| Soil hydraulics | Field capacity and wilting point from sand, clay, organic matter | Saxton & Rawls 2006 |
| Late blight | Two consecutive days with Tmin ≥ 10 °C and ≥ 6 h RH ≥ 90 % | Hutton criteria, AHDB 2017 |
| Groundnut leaf spot | Hours at RH ≥ 95 % and their mean temperature | Jensen & Boyle 1966 |
| Rusts, blast, blights | Leaf-wetness hours inside each pathogen's temperature band | ICAR/TNAU advisories |
| Spraying | Rain-free 4 h, wind 3–15 km/h at boom height, Delta-T 2–8 °C, < 32 °C | GRDC; Stull 2011 |
| Alerts | Heavy rain 64.5 / 115.6 / 204.5 mm, heat 40/42/45 °C, frost | IMD |
