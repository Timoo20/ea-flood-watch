-- Minimal fixture matching the igad-rainfall-pipeline schema: two Kenyan districts, one day.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE admin_boundaries (shape_id text PRIMARY KEY, name text NOT NULL, country_iso3 char(3) NOT NULL,
                               geom geometry(MultiPolygon, 4326) NOT NULL);
CREATE TABLE rainfall_stats (date date, shape_id text REFERENCES admin_boundaries, metric text,
                             value double precision, PRIMARY KEY (date, shape_id, metric));
CREATE TABLE rainfall_alerts (date date, shape_id text REFERENCES admin_boundaries, alert_level smallint,
                              precip_3d_p90 double precision, PRIMARY KEY (date, shape_id));
INSERT INTO admin_boundaries VALUES
  ('KEN-1', 'Nairobi', 'KEN', ST_Multi(ST_MakeEnvelope(36.6, -1.45, 37.1, -1.15, 4326))),
  ('KEN-2', 'Garissa', 'KEN', ST_Multi(ST_MakeEnvelope(38.5, -2.0, 41.5, 1.5, 4326)));
INSERT INTO rainfall_alerts VALUES ('2026-04-30', 'KEN-1', 2, 112.4), ('2026-04-30', 'KEN-2', 0, 8.1),
                                   ('2026-04-29', 'KEN-1', 1, 64.0);
INSERT INTO rainfall_stats VALUES ('2026-04-30', 'KEN-1', 'precip_3d_mean', 98.2),
                                  ('2026-04-29', 'KEN-1', 'precip_3d_mean', 55.0),
                                  ('2026-04-30', 'KEN-2', 'precip_3d_mean', 5.5);
