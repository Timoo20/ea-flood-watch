import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { alertsUrl, fetchDates, fetchLookup, fetchRasters, fetchSummary, tileUrl } from "./api.js";
import { ALERT_LEVELS, COUNTRIES, INITIAL_VIEW, RASTER_LAYERS } from "./config.js";

const BASEMAP = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors · Rainfall: CHIRPS (UCSB CHC) · Boundaries: geoBoundaries",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const alertColor = ["match", ["get", "alert_level"], ...ALERT_LEVELS.flatMap((a) => [a.level, a.color]), "#cccccc"];

function popupHtml(d) {
  const level = ALERT_LEVELS.find((a) => a.level === d.alert_level);
  const metrics = Object.entries(d.metrics || {})
    .filter(([k]) => k.endsWith("_mean"))
    .map(([k, v]) => `<tr><td>${k.replace("precip_", "").replace("_mean", "")} mean</td><td>${v} mm</td></tr>`)
    .join("");
  return `<strong>${d.name}</strong>, ${COUNTRIES[d.country] || d.country}<br/>
    <span class="badge" style="background:${level?.color || "#ccc"}">${level?.label || "No data"}</span>
    <table>${metrics}</table>`;
}

export default function App() {
  const mapEl = useRef(null);
  const map = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState("");
  const [layerKey, setLayerKey] = useState("precip_3d");
  const [opacity, setOpacity] = useState(0.7);
  const [showDistricts, setShowDistricts] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({ container: mapEl.current, style: BASEMAP, ...INITIAL_VIEW });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(new maplibregl.ScaleControl(), "bottom-right");
    m.on("load", () => {
      m.addSource("districts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "district-fill", type: "fill", source: "districts",
                   paint: { "fill-color": alertColor, "fill-opacity": 0.55 } });
      m.addLayer({ id: "district-line", type: "line", source: "districts",
                   paint: { "line-color": "#555", "line-width": 0.5 } });
      setMapReady(true);
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    fetchDates()
      .then((d) => { setDates(d); setDate(d[0] || ""); })
      .catch((e) => setError(e.message));
  }, []);

  // District alerts + summary for the selected day.
  useEffect(() => {
    if (!mapReady || !date) return;
    map.current.getSource("districts").setData(alertsUrl(date));
    fetchSummary(date).then(setSummary).catch((e) => setError(e.message));
  }, [mapReady, date]);

  // Rainfall raster from TiTiler, placed under the district layer.
  useEffect(() => {
    if (!mapReady || !date) return;
    let cancelled = false;
    const m = map.current;
    fetchRasters(date)
      .then(({ layers }) => {
        if (cancelled) return;
        if (m.getLayer("rain")) m.removeLayer("rain");
        if (m.getSource("rain")) m.removeSource("rain");
        const spec = RASTER_LAYERS.find((l) => l.key === layerKey);
        if (!layers[layerKey]) return setError(`No ${spec.label} layer for ${date}`);
        m.addSource("rain", { type: "raster", tiles: [tileUrl(layers[layerKey], spec.rescale)], tileSize: 256 });
        m.addLayer({ id: "rain", type: "raster", source: "rain", paint: { "raster-opacity": opacity } },
                   "district-fill");
        setError("");
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
    // opacity is applied by its own effect, so it is deliberately not a dependency here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, date, layerKey]);

  useEffect(() => {
    if (mapReady && map.current.getLayer("rain")) map.current.setPaintProperty("rain", "raster-opacity", opacity);
  }, [mapReady, opacity]);

  useEffect(() => {
    if (!mapReady) return;
    const vis = showDistricts ? "visible" : "none";
    ["district-fill", "district-line"].forEach((id) => map.current.setLayoutProperty(id, "visibility", vis));
  }, [mapReady, showDistricts]);

  // Click anywhere: PostGIS point-in-polygon lookup.
  useEffect(() => {
    if (!mapReady || !date) return;
    const m = map.current;
    const onClick = (e) => {
      const { lng, lat } = e.lngLat;
      fetchLookup(lng.toFixed(5), lat.toFixed(5), date)
        .then((d) => new maplibregl.Popup().setLngLat(e.lngLat).setHTML(popupHtml(d)).addTo(m))
        .catch(() => new maplibregl.Popup().setLngLat(e.lngLat).setText("Outside monitored districts").addTo(m));
    };
    m.on("click", onClick);
    return () => m.off("click", onClick);
  }, [mapReady, date]);

  const byCountry = {};
  for (const c of summary?.counts || []) {
    byCountry[c.country] ??= {};
    byCountry[c.country][c.alert_level] = c.districts;
  }

  return (
    <div className="app">
      <aside className="panel">
        <h1>East Africa Flood Watch</h1>
        <p className="sub">Heavy-rainfall alerts by district, from CHIRPS daily rainfall</p>

        <label>Date
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>Rainfall layer
          <select value={layerKey} onChange={(e) => setLayerKey(e.target.value)}>
            {RASTER_LAYERS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
        <label>Layer opacity
          <input type="range" min="0" max="1" step="0.05" value={opacity}
                 onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={showDistricts} onChange={(e) => setShowDistricts(e.target.checked)} />
          Show district alerts
        </label>

        <h2>Alert levels</h2>
        <ul className="legend">
          {ALERT_LEVELS.map((a) => (
            <li key={a.level}><span style={{ background: a.color }} />{a.label}</li>
          ))}
        </ul>

        <h2>Districts on alert</h2>
        <table className="summary">
          <thead><tr><th>Country</th>{ALERT_LEVELS.slice(1).map((a) => <th key={a.level}>L{a.level}</th>)}</tr></thead>
          <tbody>
            {Object.entries(byCountry).map(([iso, counts]) => (
              <tr key={iso}>
                <td>{COUNTRIES[iso] || iso}</td>
                {ALERT_LEVELS.slice(1).map((a) => <td key={a.level}>{counts[a.level] || 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="error">{error}</p>}
        <p className="note">Click the map for district rainfall totals. Demonstration product, not an official warning.</p>
      </aside>
      <div ref={mapEl} className="map" />
    </div>
  );
}
