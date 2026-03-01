/**
 * OSRM Routing Service — Real route calculation via public OSRM API
 * + Nominatim Geocoding for address → coordinates
 *
 * OSRM (Open Source Routing Machine) is the engine behind many production
 * mapping apps. The public demo server at router.project-osrm.org handles
 * OpenStreetMap data worldwide.
 *
 * APIs used:
 *   OSRM Route:  https://router.project-osrm.org/route/v1/{profile}/{coords}
 *   Nominatim:   https://nominatim.openstreetmap.org/search
 *
 * Profile options: 'foot' (walking) | 'bike' | 'driving'
 * ARAN uses 'foot' for maximum safety-route granularity.
 */

import type { LatLng } from '../types';

export interface OSRMRouteSegment {
    coordinates: LatLng[];
    distance: number;   // metres
    duration: number;   // seconds
    name: string;
}

export interface OSRMRoute {
    id: string;
    coordinates: LatLng[];
    distance: number;   // metres
    duration: number;   // seconds
    segments: OSRMRouteSegment[];
    bbox: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
    raw: OSRMRouteAPIResponse;
}

export interface GeocodingResult {
    latitude: number;
    longitude: number;
    displayName: string;
    type: string;
    importance: number;
}

// ---------------------------------------------------------------------------
// Types from OSRM API
// ---------------------------------------------------------------------------

interface OSRMStep {
    distance: number;
    duration: number;
    name: string;
    geometry: GeoJSONGeometry;
}

interface OSRMLeg {
    distance: number;
    duration: number;
    steps: OSRMStep[];
}

interface GeoJSONGeometry {
    type: 'LineString';
    coordinates: [number, number][];  // [lng, lat] per GeoJSON spec
}

interface OSRMRouteAPIResponse {
    code: string;
    routes: Array<{
        distance: number;
        duration: number;
        geometry: GeoJSONGeometry;
        legs: OSRMLeg[];
        weight_name: string;
        weight: number;
    }>;
    waypoints: Array<{
        distance: number;
        name: string;
        location: [number, number];
    }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSRM_PROFILE = 'foot';

const NOMINATIM_HEADERS = {
    // Nominatim ToS requires a valid User-Agent and email for public API use
    'User-Agent': 'ARAN-Safety-App/1.0 (contact@aran.app)',
    'Accept-Language': 'ta,en',
};

// ---------------------------------------------------------------------------
// Nominatim Geocoding
// ---------------------------------------------------------------------------

/**
 * Convert a human-readable address to coordinates.
 * Restricted to India (countrycodes=in) for Tamil Nadu context.
 */
export async function geocodeAddress(query: string): Promise<GeocodingResult[]> {
    const params = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        countrycodes: 'in',
        addressdetails: '1',
        limit: '5',
    });

    const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
        headers: NOMINATIM_HEADERS,
    });

    if (!response.ok) throw new Error(`Nominatim error: HTTP ${response.status}`);

    const data = await response.json() as Array<{
        lat: string; lon: string; display_name: string; type: string; importance: number;
    }>;

    return data.map(r => ({
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
        displayName: r.display_name,
        type: r.type,
        importance: r.importance,
    }));
}

/**
 * Reverse geocode coordinates → nearest address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lng.toString(),
        format: 'jsonv2',
        zoom: '18',
        addressdetails: '1',
    });

    const response = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
        headers: NOMINATIM_HEADERS,
    });

    if (!response.ok) throw new Error(`Reverse geocode failed: HTTP ${response.status}`);
    const data = await response.json() as { display_name: string };
    return data.display_name;
}

// ---------------------------------------------------------------------------
// OSRM Route Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a walking route between two coordinates using the public OSRM API.
 * Returns full GeoJSON geometry with per-step segments.
 */
export async function calculateRoute(
    origin: LatLng,
    destination: LatLng,
): Promise<OSRMRoute> {
    // OSRM expects lng,lat order (GeoJSON convention)
    const coordStr = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
    const params = new URLSearchParams({
        geometries: 'geojson',
        overview: 'full',
        steps: 'true',
        annotations: 'false',
    });

    const url = `${OSRM_BASE}/${OSRM_PROFILE}/${coordStr}?${params}`;
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) throw new Error(`OSRM API error: HTTP ${response.status}`);

    const json = await response.json() as OSRMRouteAPIResponse;

    if (json.code !== 'Ok' || !json.routes.length) {
        throw new Error(`OSRM returned: ${json.code}`);
    }

    const route = json.routes[0];

    // Convert GeoJSON [lng, lat] → our LatLng [lat, lng] format
    const toLatLng = (coord: [number, number]): LatLng => [coord[1], coord[0]];

    const coordinates: LatLng[] = route.geometry.coordinates.map(toLatLng);

    // Build segments from steps
    const segments: OSRMRouteSegment[] = route.legs.flatMap(leg =>
        leg.steps.map(step => ({
            coordinates: step.geometry.coordinates.map(toLatLng),
            distance: step.distance,
            duration: step.duration,
            name: step.name || 'Unnamed road',
        }))
    );

    // Compute bounding box
    const lats = coordinates.map(c => c[0]);
    const lngs = coordinates.map(c => c[1]);
    const bbox: [number, number, number, number] = [
        Math.min(...lats), Math.min(...lngs),
        Math.max(...lats), Math.max(...lngs),
    ];

    return {
        id: `osrm-${Date.now()}`,
        coordinates,
        distance: route.distance,
        duration: route.duration,
        segments,
        bbox,
        raw: json,
    };
}

/**
 * Calculate multiple alternative routes between two points.
 * OSRM supports up to 3 alternatives.
 */
export async function calculateAlternativeRoutes(
    origin: LatLng,
    destination: LatLng,
    maxAlternatives = 2,
): Promise<OSRMRoute[]> {
    const coordStr = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
    const params = new URLSearchParams({
        geometries: 'geojson',
        overview: 'full',
        steps: 'true',
        alternatives: maxAlternatives.toString(),
    });

    const url = `${OSRM_BASE}/${OSRM_PROFILE}/${coordStr}?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`OSRM error: HTTP ${response.status}`);

    const json = await response.json() as OSRMRouteAPIResponse;
    if (json.code !== 'Ok') throw new Error(`OSRM: ${json.code}`);

    const toLatLng = (coord: [number, number]): LatLng => [coord[1], coord[0]];

    return json.routes.map((route, idx) => {
        const coordinates = route.geometry.coordinates.map(toLatLng);
        const segments = route.legs.flatMap(leg =>
            leg.steps.map(step => ({
                coordinates: step.geometry.coordinates.map(toLatLng),
                distance: step.distance,
                duration: step.duration,
                name: step.name || 'Unnamed road',
            }))
        );
        const lats = coordinates.map(c => c[0]);
        const lngs = coordinates.map(c => c[1]);
        return {
            id: `osrm-alt-${idx}-${Date.now()}`,
            coordinates,
            distance: route.distance,
            duration: route.duration,
            segments,
            bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
            raw: json,
        } as OSRMRoute;
    });
}

/**
 * Format distance in a human-readable string
 */
export function formatDistance(metres: number): string {
    if (metres < 1000) return `${Math.round(metres)} m`;
    return `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Format duration in human-readable string
 */
export function formatDuration(seconds: number): string {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remaining = mins % 60;
    return `${hrs}h ${remaining}min`;
}
