const geocodeCache = new Map();
const inFlightRequests = new Map();

function buildCellKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

export function calculateDistanceMeters(a, b) {
  const lat1 = Number(a?.latitude);
  const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function parseNominatimResult(data) {
  const addr = data?.address || {};
  const houseNumber = String(addr.house_number || '').trim();
  const road = String(addr.road || addr.pedestrian || addr.footway || addr.path || '').trim();
  const street = [houseNumber, road].filter(Boolean).join(' ').trim();
  const suburb = String(
    addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || addr.hamlet || '',
  ).trim();
  const city = String(
    addr.city || addr.town || addr.village || addr.municipality || addr.city_district || addr.county || '',
  ).trim();
  const province = String(addr.state || addr.province || '').trim();

  const parts = [];
  if (street) parts.push(street);
  if (suburb && suburb.toLowerCase() !== street.toLowerCase() && suburb.toLowerCase() !== city.toLowerCase()) {
    parts.push(suburb);
  }
  if (city) parts.push(city);
  else if (province) parts.push(province);

  const formattedAddress = parts.join(', ').trim() || String(data?.display_name || '').split(',').slice(0, 3).join(',').trim();
  if (!formattedAddress && !city) return null;

  return {
    address: formattedAddress,
    street,
    suburb,
    city,
    province,
  };
}

function parseBigDataCloudResult(data) {
  const locality = String(data?.locality || '').trim();
  const city = String(data?.city || locality || '').trim();
  const province = String(data?.principalSubdivision || '').trim();
  const parts = [];
  if (locality && locality.toLowerCase() !== city.toLowerCase()) parts.push(locality);
  if (city) parts.push(city);
  else if (province) parts.push(province);
  const address = parts.join(', ').trim();
  if (!address && !city) return null;
  return {
    address,
    street: '',
    suburb: locality,
    city,
    province,
  };
}

export async function reverseGeocodeCoords({ latitude, longitude }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const key = buildCellKey(lat, lon);
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
  }
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const task = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&zoom=18`,
          {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
        );
        if (res.ok) {
          const json = await res.json();
          const parsed = parseNominatimResult(json);
          if (parsed?.address) {
            geocodeCache.set(key, parsed);
            return parsed;
          }
        }
      } finally {
        window.clearTimeout(timeoutId);
      }

      const fallbackRes = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`,
      );
      if (fallbackRes.ok) {
        const fallbackJson = await fallbackRes.json();
        const parsed = parseBigDataCloudResult(fallbackJson);
        if (parsed) {
          geocodeCache.set(key, parsed);
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, task);
  return task;
}

export function formatLiveLocationDisplay({ address, city, latitude, longitude }) {
  const cleanAddress = String(address || '').trim();
  const cleanCity = String(city || '').trim();
  if (cleanAddress) {
    if (cleanCity && !cleanAddress.toLowerCase().includes(cleanCity.toLowerCase())) {
      return `${cleanAddress}, ${cleanCity}`;
    }
    return cleanAddress;
  }

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    return cleanCity ? `${coords} · ${cleanCity}` : coords;
  }

  return cleanCity || 'Live location not available';
}
