"""Integration tests against a PostGIS database seeded with tests/seed.sql (CI provides one)."""
import os

import psycopg
import pytest
from fastapi.testclient import TestClient

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set (needs seeded PostGIS)")


@pytest.fixture(scope="module")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_dates_latest_first(client):
    assert client.get("/api/dates").json()[:2] == ["2026-04-30", "2026-04-29"]


def test_alerts_geojson(client):
    r = client.get("/api/alerts", params={"country": "ken"})
    fc = r.json()
    assert r.headers["content-type"].startswith("application/geo+json")
    assert fc["type"] == "FeatureCollection" and fc["date"] == "2026-04-30"
    levels = {f["properties"]["name"]: f["properties"]["alert_level"] for f in fc["features"]}
    assert levels == {"Nairobi": 2, "Garissa": 0}
    assert fc["features"][0]["geometry"]["type"] == "MultiPolygon"


def test_lookup_point_in_district(client):
    body = client.get("/api/lookup", params={"lon": 36.82, "lat": -1.29}).json()
    assert body["name"] == "Nairobi" and body["alert_level"] == 2
    assert body["metrics"] == {"precip_3d_mean": 98.2}
    assert client.get("/api/lookup", params={"lon": 0, "lat": 0}).status_code == 404


def test_timeseries_and_validation(client):
    body = client.get("/api/districts/KEN-1/timeseries").json()
    assert [p["value"] for p in body["series"]] == [55.0, 98.2]
    bad = client.get("/api/districts/KEN-1/timeseries", params={"metric": "x; DROP TABLE"})
    assert bad.status_code == 422


def test_summary(client):
    counts = client.get("/api/summary", params={"date": "2026-04-30"}).json()["counts"]
    assert {(c["alert_level"], c["districts"]) for c in counts} == {(0, 1), (2, 1)}


def seed():  # used by CI: python -c "from tests.test_api import seed; seed()"
    with open(os.path.join(os.path.dirname(__file__), "seed.sql")) as f, psycopg.connect(DATABASE_URL) as conn:
        conn.execute(f.read())
