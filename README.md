# East Africa Flood Watch

A web map of heavy-rainfall alerts for the Greater Horn of Africa. It shows district-level alert levels and
rainfall rasters produced daily by [igad-rainfall-pipeline](https://github.com/Timoo20/igad-rainfall-pipeline).

- **Front end:** React + MapLibre GL (the open-source fork of Mapbox GL JS). It has a date picker, 1/3/7/30-day
  rainfall layers, an alert choropleth, a per-country summary, and click-anywhere district lookup.
- **API:** FastAPI on PostGIS. GeoJSON is built in the database (`json_build_object`, `ST_AsGeoJSON`), and point
  lookups use `ST_Intersects`.
- **Raster tiles:** [TiTiler](https://developmentseed.org/titiler/) serves the pipeline's Cloud-Optimised GeoTIFFs
  as dynamic XYZ tiles. The API finds each day's files through the pipeline's **STAC** catalogue.
- **Delivery:** Docker Compose for the full stack, and GitHub Actions for integration tests against a real PostGIS
  service container, lint, front-end build and container images pushed to GHCR.

```mermaid
flowchart LR
    P[igad-rainfall-pipeline<br/>Prefect] -->|alerts, stats| DB[(PostGIS)]
    P -->|COG + STAC| FS[/products volume/]
    DB --> API[FastAPI]
    FS --> API
    FS --> T[TiTiler]
    API --> W[React + MapLibre<br/>behind nginx]
    T --> W
```

## Run it

Clone both repositories side by side:

```bash
git clone https://github.com/Timoo20/igad-rainfall-pipeline
git clone https://github.com/Timoo20/ea-flood-watch && cd ea-flood-watch

docker compose up -d postgis
docker compose --profile pipeline run --rm pipeline --date 2026-06-30 --no-validate   # load one day
docker compose up -d --build
```

Then open http://localhost:3000. The API docs are at http://localhost:8000/docs.

For front-end development, run `cd web && npm install && npm run dev`. Vite proxies `/api` and `/tiles` to the
Compose services.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/dates` | Days with alert data, latest first |
| `GET /api/alerts?date=&country=` | District alert levels as GeoJSON (`application/geo+json`) |
| `GET /api/lookup?lon=&lat=&date=` | The district that contains a point, its alert level and rainfall totals |
| `GET /api/districts/{id}/timeseries?metric=precip_3d_mean&days=90` | One district's rainfall time series |
| `GET /api/summary?date=` | Number of districts at each alert level, per country |
| `GET /api/rasters?date=` | That day's COG layers, read from the STAC Item |
| `GET /health` | Liveness, including a database check |

Query parameters are validated (for example, `metric` must match `precip_<N>d_(mean|p90|max)`), and every SQL
statement is parameterised.

## Tests

```bash
docker compose up -d postgis
cd api && pip install -r requirements.txt pytest httpx
export DATABASE_URL=postgresql://hazards:hazards@localhost:5432/hazards
python -c "from tests.test_api import seed; seed()" && pytest -q
```

CI runs the same steps against a `postgis/postgis` service container.

## Next steps

- Serve district boundaries as vector tiles (`ST_AsMVT`) instead of GeoJSON when using ADM2 for the whole region.
- Expose the same layers over OGC services (GeoServer WMS/WFS) for national hydromet services' GIS clients.
- Add Helm charts and ArgoCD for Kubernetes delivery.

Data: CHIRPS (UCSB Climate Hazards Center), geoBoundaries, and © OpenStreetMap contributors. This is a
demonstration product, not an official warning service.
