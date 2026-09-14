const TAG_RULES = {
  stone: { degree: 0, octave: -1, velocity: 72, duration: 1.1 },
  flower: { degree: 2, octave: 0, velocity: 86, duration: 0.65 },
  cloud: { degree: 4, octave: 0, velocity: 68, duration: 1.8 },
  spiral: { degree: 3, octave: 0, velocity: 78, duration: 0.9 },
  sun: { degree: 5, octave: 1, velocity: 96, duration: 0.55 },
  moon: { degree: 1, octave: -1, velocity: 64, duration: 1.35 },
  rest: { degree: 0, octave: 0, velocity: 0, duration: 0.5 },
  lightning: { degree: 6, octave: 1, velocity: 116, duration: 0.13 },
};

const SCALES = {
  bright: { name: "D Lydian", root: 50, intervals: [0, 2, 4, 6, 7, 9, 11] },
  open: { name: "D Dorian", root: 50, intervals: [0, 2, 3, 5, 7, 9, 10] },
  dark: { name: "D Aeolian", root: 50, intervals: [0, 2, 3, 5, 7, 8, 10] },
};

let weatherCache = null;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return json({ ok: true }, 200, cors);
      if (url.pathname === "/api/state" && request.method === "GET") {
        return json(await getState(env), 200, cors);
      }
      if (url.pathname === "/api/scan" && request.method === "POST") {
        return json(await addScan(request, env), 201, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      console.error(error);
      return json({ error: "The garden is temporarily resting." }, 500, cors);
    }
  },
};

async function addScan(request, env) {
  const body = await request.json();
  const tag = String(body.tag || "").toLowerCase();
  const clientId = String(body.clientId || "anonymous").slice(0, 100);
  if (!TAG_RULES[tag]) return { error: "Unknown musical object." };

  const recent = await env.DB.prepare(
    "SELECT created_at FROM scans WHERE installation = ? AND client_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(env.INSTALLATION_ID, clientId).first();
  if (recent && Date.now() - Date.parse(recent.created_at) < 1200) {
    throw new Error("Contribution rate exceeded");
  }

  const weather = await getWeather(env);
  const scale = chooseScale(weather.cloudCover);
  const rule = TAG_RULES[tag];
  const previous = await env.DB.prepare(
    "SELECT note FROM scans WHERE installation = ? AND note IS NOT NULL ORDER BY created_at DESC LIMIT 1"
  ).bind(env.INSTALLATION_ID).first();
  const tagCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM scans WHERE installation = ? AND tag = ?"
  ).bind(env.INSTALLATION_ID, tag).first();
  const temperatureOctave = weather.temperatureC < 5 ? -1 : weather.temperatureC > 27 ? 1 : 0;
  let note = tag === "rest" ? null : scale.root + scale.intervals[rule.degree] + 12 * (rule.octave + temperatureOctave);
  if (tag === "spiral" && previous?.note != null) note = Math.max(36, previous.note - 5);
  if (note != null && tag !== "spiral") {
    const variations = [0, 2, 7, 12, 7, 4];
    note += variations[Number(tagCount?.count || 0) % variations.length];
  }
  note = note == null ? null : Math.max(24, Math.min(96, note));
  const duration = Math.max(0.09, Math.min(2.4, rule.duration + weather.windKph / 80));
  const event = {
    id: crypto.randomUUID(), tag, note, velocity: rule.velocity, duration,
    createdAt: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO scans
    (id, installation, tag, note, velocity, duration, client_id, scale, temperature_c, cloud_cover, wind_kph, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.id, env.INSTALLATION_ID, tag, note, rule.velocity, duration, clientId,
    scale.name, weather.temperatureC, weather.cloudCover, weather.windKph, event.createdAt
  ).run();

  const state = await getState(env, weather);
  return { ...state, event };
}

async function getState(env, suppliedWeather = null) {
  const weather = suppliedWeather || await getWeather(env);
  const scale = chooseScale(weather.cloudCover);
  const eventsResult = await env.DB.prepare(
    `SELECT id, tag, note, velocity, duration, created_at AS createdAt
     FROM scans WHERE installation = ? ORDER BY created_at DESC LIMIT 16`
  ).bind(env.INSTALLATION_ID).all();
  const visitors = await env.DB.prepare(
    `SELECT COUNT(DISTINCT client_id) AS count FROM scans
     WHERE installation = ? AND created_at >= datetime('now', '-24 hours')`
  ).bind(env.INSTALLATION_ID).first();
  return {
    installation: env.INSTALLATION_ID,
    scale: scale.name,
    weather,
    visitorCount: Number(visitors?.count || 0),
    events: (eventsResult.results || []).reverse(),
  };
}

function chooseScale(cloudCover) {
  if (cloudCover < 30) return SCALES.bright;
  if (cloudCover > 72) return SCALES.dark;
  return SCALES.open;
}

async function getWeather(env) {
  if (weatherCache && weatherCache.expires > Date.now()) return weatherCache.value;
  const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
  endpoint.searchParams.set("latitude", env.WEATHER_LAT);
  endpoint.searchParams.set("longitude", env.WEATHER_LON);
  endpoint.searchParams.set("current", "temperature_2m,cloud_cover,wind_speed_10m");
  endpoint.searchParams.set("wind_speed_unit", "kmh");
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Weather service unavailable");
  const data = await response.json();
  const current = data.current || {};
  const cloudCover = Number(current.cloud_cover ?? 50);
  const value = {
    temperatureC: Number(current.temperature_2m ?? 18),
    cloudCover,
    windKph: Number(current.wind_speed_10m ?? 8),
    summary: cloudCover < 30 ? "Clear and bright" : cloudCover > 72 ? "Clouded and dark" : "Open sky",
    observedAt: current.time || new Date().toISOString(),
  };
  weatherCache = { value, expires: Date.now() + 10 * 60 * 1000 };
  return value;
}

function corsHeaders(env, request) {
  const requested = request.headers.get("Origin") || "*";
  const allowed = env.ALLOWED_ORIGIN === "*" ? "*" : env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : requested === allowed ? requested : allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
