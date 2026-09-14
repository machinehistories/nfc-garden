# Weather Garden

Weather Garden is a collaborative NFC musical installation. Each NFC tag opens
the same site with a different `tag` query parameter. The site asks the visitor
to contribute, calls a shared API, turns live weather into musical rules, and
plays the returned note with Web Audio.

## Experience

- Eight physical tags: Stone, Flower, Cloud, Spiral, Sun, Moon, Rest, Lightning
- Shared 16-step composition across all visitors
- Temperature selects register
- Cloud cover blends the scale from bright to dark
- Wind changes note length
- A live constellation displays recent contributions
- Local demo mode works before the API is deployed

## Project layout

```text
frontend/             GitHub Pages site
worker/               Cloudflare Worker + D1 API
.github/workflows/    GitHub Pages deployment
```

## 1. Preview locally

From the project directory:

```bash
python3 -m http.server 8080 --directory frontend
```

Open:

```text
http://localhost:8080/?tag=flower
```

Until `frontend/config.js` contains a deployed API URL, the site uses
`localStorage`. This is useful for visual and audio testing but is not shared
between devices.

## 2. Deploy the shared API

Install Wrangler and sign in:

```bash
npm install -g wrangler
wrangler login
```

Create the D1 database:

```bash
cd worker
wrangler d1 create weather-garden
```

Copy the returned database ID into `worker/wrangler.toml`, replacing
`REPLACE_WITH_D1_DATABASE_ID`.

Create the database table and deploy:

```bash
wrangler d1 execute weather-garden --remote --file=schema.sql
wrangler deploy
```

Copy the resulting Worker URL into `frontend/config.js`:

```js
window.WEATHER_GARDEN_CONFIG = {
  apiUrl: "https://weather-garden-api.YOUR-SUBDOMAIN.workers.dev",
  installationName: "Weather Garden",
};
```

The default weather location is New York City. Change `WEATHER_LAT` and
`WEATHER_LON` in `worker/wrangler.toml` to the installation coordinates, then
deploy again.

## 3. Publish the front end on GitHub Pages

Create a GitHub repository and push this project. In the repository settings,
open **Pages**, set **Source** to **GitHub Actions**, then run the included
workflow or push to `main`.

If the published URL is:

```text
https://YOURNAME.github.io/weather-garden/
```

the tag URLs are:

```text
https://YOURNAME.github.io/weather-garden/?tag=stone
https://YOURNAME.github.io/weather-garden/?tag=flower
https://YOURNAME.github.io/weather-garden/?tag=cloud
https://YOURNAME.github.io/weather-garden/?tag=spiral
https://YOURNAME.github.io/weather-garden/?tag=sun
https://YOURNAME.github.io/weather-garden/?tag=moon
https://YOURNAME.github.io/weather-garden/?tag=rest
https://YOURNAME.github.io/weather-garden/?tag=lightning
```

Write each URL as a standard URL record using NFC Tools. On iOS, scanning the
tag presents a notification; tapping it opens the contribution page.

## API

### Add a contribution

```http
POST /api/scan
Content-Type: application/json

{"tag":"flower","clientId":"anonymous-random-id"}
```

### Read the current composition

```http
GET /api/state
```

### Health check

```http
GET /api/health
```

## Notes

- Browsers require a user gesture before audio can start, so the visitor taps
  the central contribution button after opening the NFC notification.
- NFC identifiers are intentionally non-secret. Anyone with a tag URL can make
  a contribution.
- The API rate-limits repeat contributions from the same anonymous client.
- No personal information or precise visitor location is collected. Weather is
  based on the fixed installation coordinates configured on the Worker.

