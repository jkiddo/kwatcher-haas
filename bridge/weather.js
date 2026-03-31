/**
 * Fetches weather from OpenWeatherMap + air quality from WAQI,
 * encodes 6 days (today + 5 forecast) for the K-WATCH.
 */

const { encodeWeather } = require('./ble/protocol');

const OWM_BASE = 'http://api.openweathermap.org/data/2.5';
const WAQI_BASE = 'https://api.waqi.info';

/**
 * Fetch weather + air quality and return encoded packets for the watch.
 * @param {object} config
 * @returns {Buffer[]} Array of encoded weather packets (up to 6 days)
 */
async function fetchAndEncodeWeather(config) {
  if (!config.owmApiKey || !config.owmLat || !config.owmLon) {
    throw new Error('OWM_API_KEY, OWM_LAT, and OWM_LON must be configured');
  }

  const { owmApiKey: key, waqiToken, owmLat: lat, owmLon: lon } = config;

  // Fetch all data in parallel
  const [current, forecast, waqi, uvi] = await Promise.all([
    fetchJson(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`),
    fetchJson(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${key}`),
    waqiToken
      ? fetchJson(`${WAQI_BASE}/feed/geo:${lat};${lon}/?token=${waqiToken}`).catch(() => null)
      : null,
    fetchJson(`${OWM_BASE}/uvi?lat=${lat}&lon=${lon}&appid=${key}`).catch(() => null),
  ]);

  // Extract AQI and PM2.5 from WAQI
  let currentAqi = 0, currentPm25 = 0;
  if (waqi && waqi.status === 'ok' && waqi.data) {
    currentAqi = waqi.data.aqi || 0;
    currentPm25 = waqi.data.iaqi?.pm25?.v || 0;
  }

  // UV index from OWM
  const uvIndex = uvi && uvi.value != null ? Math.round(uvi.value) : 0;

  // Today from current weather
  const days = [{
    temp: current.main.temp,
    tempMin: current.main.temp_min,
    tempMax: current.main.temp_max,
    conditionId: current.weather[0].id,
    uvIndex,
    pm25: Math.round(currentPm25),
    aqi: Math.round(currentAqi),
  }];

  // Group 3-hour forecast into daily summaries
  const dailyForecasts = groupForecastByDay(forecast.list);

  for (let i = 0; i < Math.min(dailyForecasts.length, 5); i++) {
    days.push({
      ...dailyForecasts[i],
      uvIndex: 0,
      pm25: Math.round(currentPm25),  // WAQI only gives current, reuse for forecast
      aqi: Math.round(currentAqi),
    });
  }

  console.log(`[WEATHER] Today: ${Math.round(days[0].temp)}°C, condition=${days[0].conditionId}, AQI=${days[0].aqi}, PM2.5=${days[0].pm25}, UV=${days[0].uvIndex}`);

  return days.map((day, i) => {
    day.index = i;
    return encodeWeather(day);
  });
}

function groupForecastByDay(list) {
  const byDate = {};
  for (const item of list) {
    const date = item.dt_txt.split(' ')[0];
    if (!byDate[date]) {
      byDate[date] = { temps: [], tempMins: [], tempMaxs: [], conditions: [] };
    }
    byDate[date].temps.push(item.main.temp);
    byDate[date].tempMins.push(item.main.temp_min);
    byDate[date].tempMaxs.push(item.main.temp_max);
    byDate[date].conditions.push(item.weather[0].id);
  }

  // Skip today (covered by current weather), take next 5 days
  const dates = Object.keys(byDate).slice(1, 6);
  return dates.map(date => {
    const d = byDate[date];
    return {
      temp: Math.round(avg(d.temps)),
      tempMin: Math.round(Math.min(...d.tempMins)),
      tempMax: Math.round(Math.max(...d.tempMaxs)),
      conditionId: mostFrequent(d.conditions),
    };
  });
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function mostFrequent(arr) {
  const counts = {};
  let max = 0, result = arr[0];
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > max) { max = counts[v]; result = v; }
  }
  return result;
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText} (${url.split('?')[0]})`);
  return resp.json();
}

module.exports = { fetchAndEncodeWeather };
