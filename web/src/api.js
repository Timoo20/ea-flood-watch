async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

export const fetchDates = () => getJson("/api/dates");
export const fetchSummary = (date) => getJson(`/api/summary?date=${date}`);
export const fetchRasters = (date) => getJson(`/api/rasters?date=${date}`);
export const fetchLookup = (lon, lat, date) => getJson(`/api/lookup?lon=${lon}&lat=${lat}&date=${date}`);
export const alertsUrl = (date) => `/api/alerts?date=${date}`;

// TiTiler dynamic tiles for a COG path, coloured with a blue ramp.
export function tileUrl(cogPath, rescale) {
  const params = new URLSearchParams({ url: cogPath, rescale, colormap_name: "blues", nodata: "-9999" });
  return `${window.location.origin}/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?${params}`;
}
