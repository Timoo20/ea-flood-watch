// Alert levels follow the pipeline's 3-day thresholds (default 50 / 100 / 150 mm).
export const ALERT_LEVELS = [
  { level: 0, label: "No alert", color: "#d9e6d3" },
  { level: 1, label: "Watch (≥ 50 mm in 3 days)", color: "#f6d55c" },
  { level: 2, label: "Warning (≥ 100 mm)", color: "#ed8b2f" },
  { level: 3, label: "Severe (≥ 150 mm)", color: "#c0392b" },
];

// Raster layers produced by the pipeline, with the value range used to stretch the colour map.
export const RASTER_LAYERS = [
  { key: "precip_1d", label: "1-day rainfall", rescale: "0,60" },
  { key: "precip_3d", label: "3-day rainfall", rescale: "0,150" },
  { key: "precip_7d", label: "7-day rainfall", rescale: "0,250" },
  { key: "precip_30d", label: "30-day rainfall", rescale: "0,500" },
];

export const COUNTRIES = {
  BDI: "Burundi", DJI: "Djibouti", ERI: "Eritrea", ETH: "Ethiopia", KEN: "Kenya", RWA: "Rwanda",
  SDN: "Sudan", SOM: "Somalia", SSD: "South Sudan", TZA: "Tanzania", UGA: "Uganda",
};

export const INITIAL_VIEW = { center: [37.5, 4.5], zoom: 4 };
