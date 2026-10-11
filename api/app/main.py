"""East Africa Flood Watch API: district rainfall alerts from PostGIS and raster layers from STAC."""
from __future__ import annotations

import datetime as dt
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://hazards:hazards@localhost:5432/hazards")
STAC_DIR = Path(os.environ.get("STAC_DIR", "/data/stac"))
# Path prefix TiTiler sees for COG files (the products volume is mounted there).
COG_ROOT = os.environ.get("COG_ROOT", "/data/cog")

pool: ConnectionPool | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global pool
    pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, kwargs={"row_factory": dict_row}, open=True)
    yield
    pool.close()


app = FastAPI(title="East Africa Flood Watch API", version="0.1.0", lifespan=lifespan)


def get_conn():
    with pool.connection() as conn:
        yield conn


Conn = Annotated[object, Depends(get_conn)]


def latest_date(conn) -> dt.date:
    row = conn.execute("SELECT max(date) AS d FROM rainfall_alerts").fetchone()
    if not row or row["d"] is None:
        raise HTTPException(404, "No alert data loaded yet; run the rainfall pipeline first")
    return row["d"]


@app.get("/health")
def health(conn: Conn):
    conn.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/api/dates")
def dates(conn: Conn, limit: Annotated[int, Query(le=366)] = 60):
    rows = conn.execute("SELECT DISTINCT date FROM rainfall_alerts ORDER BY date DESC LIMIT %s", (limit,))
    return [str(r["date"]) for r in rows]


@app.get("/api/alerts")
def alerts(conn: Conn, date: dt.date | None = None, country: Annotated[str | None, Query(max_length=3)] = None):
    """District alert levels for one day as a GeoJSON FeatureCollection (built in PostGIS)."""
    date = date or latest_date(conn)
    row = conn.execute(
        """
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'date', %(date)s::text,
            'features', coalesce(json_agg(json_build_object(
                'type', 'Feature',
                'id', b.shape_id,
                'geometry', ST_AsGeoJSON(b.geom, 4)::json,
                'properties', json_build_object(
                    'shape_id', b.shape_id, 'name', b.name, 'country', b.country_iso3,
                    'alert_level', a.alert_level, 'precip_3d_p90', a.precip_3d_p90)
            )), '[]'::json)
        ) AS fc
        FROM admin_boundaries b
        JOIN rainfall_alerts a ON a.shape_id = b.shape_id AND a.date = %(date)s
        WHERE %(country)s::text IS NULL OR b.country_iso3 = upper(%(country)s)
        """,
        {"date": date, "country": country},
    ).fetchone()
    return JSONResponse(row["fc"], media_type="application/geo+json",
                        headers={"Cache-Control": "public, max-age=300"})


@app.get("/api/lookup")
def lookup(conn: Conn, lon: Annotated[float, Query(ge=-180, le=180)], lat: Annotated[float, Query(ge=-90, le=90)],
           date: dt.date | None = None):
    """Which district contains this point, and what is its rainfall situation?"""
    date = date or latest_date(conn)
    row = conn.execute(
        """
        SELECT b.shape_id, b.name, b.country_iso3 AS country, a.alert_level, a.precip_3d_p90,
               (SELECT json_object_agg(s.metric, s.value) FROM rainfall_stats s
                 WHERE s.shape_id = b.shape_id AND s.date = %(date)s) AS metrics
        FROM admin_boundaries b
        LEFT JOIN rainfall_alerts a ON a.shape_id = b.shape_id AND a.date = %(date)s
        WHERE ST_Intersects(b.geom, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326))
        LIMIT 1
        """,
        {"lon": lon, "lat": lat, "date": date},
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Point is outside the monitored districts")
    return {"date": str(date), **row}


@app.get("/api/districts/{shape_id}/timeseries")
def timeseries(conn: Conn, shape_id: str,
               metric: Annotated[str, Query(pattern=r"^precip_\d+d_(mean|p90|max)$")] = "precip_3d_mean",
               days: Annotated[int, Query(le=3650)] = 90):
    rows = conn.execute(
        """SELECT date, value FROM rainfall_stats
           WHERE shape_id = %s AND metric = %s AND date > (SELECT max(date) FROM rainfall_stats) - %s::int
           ORDER BY date""",
        (shape_id, metric, days),
    ).fetchall()
    return {"shape_id": shape_id, "metric": metric, "series": [{"date": str(r["date"]), "value": r["value"]}
                                                                for r in rows]}


@app.get("/api/summary")
def summary(conn: Conn, date: dt.date | None = None):
    """Number of districts at each alert level, per country."""
    date = date or latest_date(conn)
    rows = conn.execute(
        """SELECT b.country_iso3 AS country, a.alert_level, count(*) AS districts
           FROM rainfall_alerts a JOIN admin_boundaries b USING (shape_id)
           WHERE a.date = %s GROUP BY 1, 2 ORDER BY 1, 2""",
        (date,),
    ).fetchall()
    return {"date": str(date), "counts": rows}


@app.get("/api/rasters")
def rasters(date: dt.date):
    """Raster layers for a day, read from the pipeline's STAC catalogue, as paths TiTiler can open."""
    item_path = STAC_DIR / f"chirps-gha-{date:%Y%m%d}" / f"chirps-gha-{date:%Y%m%d}.json"
    if not item_path.exists():
        raise HTTPException(404, f"No STAC item for {date}")
    item = json.loads(item_path.read_text())
    layers = {}
    for key, asset in item["assets"].items():
        href = asset["href"]
        layers[key] = href if href.startswith("http") else f"{COG_ROOT}/{Path(href).name}"
    return {"date": str(date), "stac_item": item["id"], "layers": layers}
