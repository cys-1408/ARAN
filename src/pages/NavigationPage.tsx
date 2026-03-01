import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, Marker, Popup } from 'react-leaflet';
import { LatLngTuple, divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Shield, Clock, Zap, Info, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import { MOCK_ROUTES, COIMBATORE_ROUTES } from '../data/mockRoutes';
import { useGeolocation } from '../hooks/useGeolocation';
import { useRouting } from '../hooks/useRouting';
import type { Route, PointOfInterest } from '../types';
import {
    computeRouteLiveliness, getSegmentColor, getSafetyLabel,
    applyTemporalAdjustment, generateVirtualShadowingLink, getTravelSafetyTips
} from '../services/brightPath';
import styles from './NavigationPage.module.css';

const POI_ICONS: Record<string, string> = {
    police: '🚔', hospital: '🏥', atm: '🏧',
    'amma-canteen': '🍲', pharmacy: '💊', cctv: '📹'
};

function createPoiIcon(type: string) {
    return divIcon({
        html: `<div class="${styles.mapPoiIcon}">${POI_ICONS[type] || '📍'}</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });
}

function ScoreBar({ value, label, colored = false }: { value: number; label: string; colored?: boolean }) {
    const color = colored ? (value >= 70 ? 'var(--color-safe)' : value >= 50 ? 'var(--color-warning)' : 'var(--color-danger)') : 'var(--color-primary)';
    return (
        <div className={styles.scoreBar}>
            <span className={styles.scoreBarLabel}>{label}</span>
            <div className="progress-bar" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${value}%`, background: color }} />
            </div>
            <span className={styles.scoreBarValue} style={{ color }}>{value}</span>
        </div>
    );
}

export function NavigationPage() {
    // Keep focus on Tamil Nadu — default center will be user's location when available
    const [selectedCity, setSelectedCity] = useState<'tamilnadu' | 'chennai' | 'coimbatore'>('tamilnadu');
        const [currentAddress, setCurrentAddress] = useState<string | null>(null);
        const [nearbyPois, setNearbyPois] = useState<Array<PointOfInterest & { distanceMeters: number }>>([]);
    const [activeRoute, setActiveRoute] = useState<string>('r-bright');
    const [showTips, setShowTips] = useState(true);
    const [shadowingLink, setShadowingLink] = useState<string | null>(null);

    const { position } = useGeolocation({ watch: true, blur: false });
    const currentPosition = position ? [position.coords.latitude, position.coords.longitude] as [number, number] : null;
    const { state: routingState, computeRoutes } = useRouting(currentPosition);

    useEffect(() => {
        if (!currentPosition) return;
        // If the user selects a named city, compute a route to that city center.
        const destination = selectedCity === 'coimbatore'
            ? ([11.0176, 76.9558] as [number, number])
            : selectedCity === 'chennai'
                ? ([12.9152, 80.2298] as [number, number])
                : null;
        if (destination) computeRoutes(destination);
    }, [selectedCity, currentPosition, computeRoutes]);

    // Haversine distance in meters
    function computeDistanceMeters(a: [number, number], b: [number, number]) {
        const toRad = (v: number) => v * Math.PI / 180;
        const R = 6371000; // meters
        const dLat = toRad(b[0] - a[0]);
        const dLon = toRad(b[1] - a[1]);
        const lat1 = toRad(a[0]);
        const lat2 = toRad(b[0]);
        const sinDlat = Math.sin(dLat / 2);
        const sinDlon = Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon), Math.sqrt(1 - (sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon)));
        return Math.round(R * c);
    }

    // Reverse geocode current position to a readable address (Nominatim)
    useEffect(() => {
        if (!currentPosition) return;
        let mounted = true;
        (async () => {
            try {
                const [lat, lon] = currentPosition;
                const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
                const r = await fetch(url, { headers: { 'User-Agent': 'ARAN-App/1.0 (contact@aran.app)' } });
                if (!r.ok) throw new Error('Reverse geocode failed');
                const data = await r.json();
                if (!mounted) return;
                setCurrentAddress(data.display_name || `${data.address?.city || data.address?.town || data.address?.village || ''}`);
            } catch (err) {
                console.warn('Reverse geocode failed', err);
                if (mounted) setCurrentAddress(null);
            }
        })();
        return () => { mounted = false; };
    }, [currentPosition]);

    // Query Overpass API for nearby safe POIs (police, hospital, pharmacy, atm)
    useEffect(() => {
        if (!currentPosition) return;
        let mounted = true;
        (async () => {
            try {
                const [lat, lon] = currentPosition;
                const radius = 2500; // meters
                // Overpass QL: find nodes/ways/relations with amenity in the set around the user
                const q = `[
out:json][timeout:15];(
  node(around:${radius},${lat},${lon})[amenity~"^(police|hospital|pharmacy|atm)$"];
  way(around:${radius},${lat},${lon})[amenity~"^(police|hospital|pharmacy|atm)$"];
  relation(around:${radius},${lat},${lon})[amenity~"^(police|hospital|pharmacy|atm)$"];
);out center 20;`;
                const resp = await fetch('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `data=${encodeURIComponent(q)}`,
                });
                if (!resp.ok) throw new Error('Overpass query failed');
                const json = await resp.json();
                if (!mounted) return;
                const elems = Array.isArray(json.elements) ? json.elements : [];
                const pois = elems.map((el: any) => {
                    const tags = el.tags || {};
                    const amen = tags.amenity || 'cctv';
                    const latEl = el.lat ?? el.center?.lat;
                    const lonEl = el.lon ?? el.center?.lon;
                    const id = `${el.type}-${el.id}`;
                    const name = tags.name || `${amen.charAt(0).toUpperCase() + amen.slice(1)}`;
                    const type = (amen === 'police' || amen === 'hospital' || amen === 'pharmacy' || amen === 'atm') ? amen : 'cctv';
                    const coords: [number, number] = [latEl, lonEl];
                    const dist = computeDistanceMeters([lat, lon], coords);
                    return {
                        id,
                        name,
                        type,
                        coordinates: coords,
                        is24x7: /24\/?7|24 hours|always/i.test(tags.opening_hours || tags.service || ''),
                        distanceMeters: dist,
                    } as PointOfInterest & { distanceMeters: number };
                }).filter((p: any) => Number.isFinite(p.coordinates[0]) && Number.isFinite(p.coordinates[1]));
                // sort by distance and keep top 20
                pois.sort((a: any, b: any) => a.distanceMeters - b.distanceMeters);
                setNearbyPois(pois.slice(0, 20));
            } catch (err) {
                console.warn('Nearby POI fetch failed', err);
                if (mounted) setNearbyPois([]);
            }
        })();
        return () => { mounted = false; };
    }, [currentPosition]);

    const liveRoutes = useMemo<Route[]>(() => {
        if (!routingState.routes.length) return [];
        return routingState.routes.map((scored, index) => ({
            id: scored.route.id,
            name: index === 0 ? 'Live Bright Path' : `Live Alternative ${index}`,
            type: scored.isBrightPath ? 'bright-path' : 'balanced',
            from: routingState.currentLocation ?? 'Current Location',
            to: selectedCity === 'chennai' ? 'OMR Destination' : 'Coimbatore Destination',
            distance: Number((scored.route.distance / 1000).toFixed(2)),
            durationMinutes: Math.round(scored.route.duration / 60),
            safetyScore: scored.safetyScore,
            liveinessScore: scored.liveinessIndex.overall,
            coordinates: scored.route.coordinates,
            segments: scored.route.segments.map((segment, segIndex) => ({
                id: `${scored.route.id}-seg-${segIndex}`,
                coordinates: segment.coordinates,
                liveinessScore: scored.liveinessIndex.overall,
                factors: {
                    streetLighting: scored.liveinessIndex.streetLighting,
                    commercialDensity: scored.liveinessIndex.commercialDensity,
                    policeProximity: scored.liveinessIndex.policeProximity,
                    crowdReports: scored.liveinessIndex.crowdReports,
                    incidentRate: scored.liveinessIndex.incidentRate,
                },
            })),
            pois: [],
            riskZones: [],
        }));
    }, [routingState.routes, routingState.currentLocation, selectedCity]);

    useEffect(() => {
        if (liveRoutes.length > 0) {
            setActiveRoute(liveRoutes[0].id);
        }
    }, [liveRoutes]);

    const routes = liveRoutes.length > 0 ? liveRoutes : (selectedCity === 'chennai' ? MOCK_ROUTES : COIMBATORE_ROUTES);
    const selected = routes.find(r => r.id === activeRoute) ?? routes[0];
    const liveinessIndex = useMemo(() => computeRouteLiveliness(selected), [selected]);
    const adjustedSafetyScore = useMemo(() => applyTemporalAdjustment(selected.safetyScore), [selected]);
    const { label: safetyLabel, level: safetyLevel } = getSafetyLabel(adjustedSafetyScore);
    const tips = useMemo(() => getTravelSafetyTips(new Date().getHours(), selected.type), [selected.type]);

    // Tamil Nadu approximate bounds and default center
    const TN_BOUNDS: [[number, number], [number, number]] = [[8.0, 76.0], [13.5, 80.6]];
    const tamilNaduCenter: LatLngTuple = [11.0, 78.7];
    const mapCenter: LatLngTuple = currentPosition ? [currentPosition[0], currentPosition[1]] : tamilNaduCenter;

    const handleGenerateShadowLink = () => {
        const link = generateVirtualShadowingLink(selected.id, 'ec-1');
        setShadowingLink(link);
    };

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleRow}>
                    <h1 className={styles.title}>
                        <MapPin size={26} className={styles.titleIcon} />
                        Bright-Path Navigation
                    </h1>
                    <div className={styles.citySelector}>
                        {(['chennai', 'coimbatore'] as const).map(city => (
                            <button
                                key={city}
                                className={[styles.cityBtn, selectedCity === city ? styles.cityBtnActive : ''].join(' ')}
                                onClick={() => { setSelectedCity(city); setActiveRoute(city === 'chennai' ? 'r-bright' : 'r-cbe-bright'); }}
                            >
                                {city === 'chennai' ? '🏙️ Chennai OMR' : '🏭 Coimbatore'}
                            </button>
                        ))}
                    </div>
                </div>
                <p className={styles.subtitle}>
                    MCDA Liveliness Index • Street-lighting • Police proximity • Crowd reports
                </p>
            </div>

            <div className={styles.layout}>
                {/* Map */}
                <div className={styles.mapWrapper}>
                    <MapContainer
                        center={mapCenter}
                        zoom={13}
                        className={styles.map}
                        zoomControl={true}
                        attributionControl={false}
                        maxBounds={TN_BOUNDS}
                        maxBoundsViscosity={0.8}
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution="© OpenStreetMap"
                        />

                        {/* Route Polylines */}
                        {routes.map((route) => (
                            <Polyline
                                key={route.id}
                                positions={route.coordinates as LatLngTuple[]}
                                pathOptions={{
                                    color: route.id === activeRoute
                                        ? (route.type === 'bright-path' ? '#10b981' : '#ef4444')
                                        : 'rgba(255,255,255,0.2)',
                                    weight: route.id === activeRoute ? 5 : 2,
                                    dashArray: route.type === 'fastest' ? '8,4' : undefined,
                                    opacity: route.id === activeRoute ? 1 : 0.4,
                                }}
                                eventHandlers={{ click: () => setActiveRoute(route.id) }}
                            />
                        ))}

                        {/* Segment Safety Gradient for active route */}
                        {selected.segments.map((seg) => (
                            <Polyline
                                key={seg.id}
                                positions={seg.coordinates as LatLngTuple[]}
                                pathOptions={{
                                    color: getSegmentColor(seg.liveinessScore),
                                    weight: 6,
                                    opacity: 0.75,
                                }}
                            />
                        ))}

                        {/* Risk Zones */}
                        {selected.riskZones.map((rz) => (
                            <Polygon
                                key={rz.id}
                                positions={rz.coordinates as LatLngTuple[]}
                                pathOptions={{
                                    color: rz.severity === 'high' ? '#ef4444' : rz.severity === 'medium' ? '#f97316' : '#fbbf24',
                                    fillOpacity: 0.2,
                                    weight: 1.5,
                                    dashArray: '4,4',
                                }}
                            >
                                <Popup>
                                    <div style={{ minWidth: 180 }}>
                                        <strong style={{ color: '#f87171' }}>⚠️ Risk Zone</strong>
                                        <p style={{ marginTop: 4, fontSize: '12px' }}>{rz.description}</p>
                                        <small style={{ color: '#888' }}>{rz.reportCount} community reports</small>
                                    </div>
                                </Popup>
                            </Polygon>
                        ))}

                        {/* POI Markers */}
                        {selected.pois.map((poi) => (
                            <Marker
                                key={poi.id}
                                position={poi.coordinates as LatLngTuple}
                                icon={createPoiIcon(poi.type)}
                            >
                                <Popup>
                                    <div style={{ minWidth: 160 }}>
                                        <strong>{poi.name}</strong>
                                        <p style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>
                                            {poi.is24x7 ? '✅ Open 24/7' : '⏰ Check hours'}
                                        </p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* Nearby safe places discovered via OSM Overpass */}
                        {nearbyPois.map((poi) => (
                            <Marker
                                key={poi.id}
                                position={poi.coordinates as LatLngTuple}
                                icon={createPoiIcon(poi.type)}
                            >
                                <Popup>
                                    <div style={{ minWidth: 180 }}>
                                        <strong>{poi.name}</strong>
                                        <div style={{ marginTop: 6, fontSize: 13 }}>{poi.type} • {(poi.distanceMeters / 1000).toFixed(2)} km</div>
                                        <p style={{ fontSize: '12px', color: '#888', marginTop: 6 }}>{poi.is24x7 ? '✅ Open 24/7' : '⏰ Check hours'}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* Current location marker + address */}
                        {currentPosition && (
                            <Marker position={currentPosition as LatLngTuple}>
                                <Popup>
                                    <div style={{ minWidth: 200 }}>
                                        <strong>You are here</strong>
                                        <div style={{ marginTop: 6, fontSize: 13 }}>{currentAddress ?? 'Resolving address...'}</div>
                                    </div>
                                </Popup>
                            </Marker>
                        )}
                    </MapContainer>

                    {/* Map Overlay Legend */}
                    <div className={styles.mapLegend}>
                        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#10b981' }} />Safe</div>
                        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#fbbf24' }} />Moderate</div>
                        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#f97316' }} />Risky</div>
                        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#ef4444' }} />Danger</div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className={styles.sidebar}>
                    {/* Route Selector */}
                    <div className={styles.routeSelector}>
                        {routes.map((route) => {
                            const li = computeRouteLiveliness(route);
                            const adj = applyTemporalAdjustment(route.safetyScore);
                            const { label: sl, level } = getSafetyLabel(adj);
                            return (
                                <button
                                    key={route.id}
                                    className={[styles.routeCard, activeRoute === route.id ? styles.routeCardActive : ''].join(' ')}
                                    onClick={() => setActiveRoute(route.id)}
                                >
                                    <div className={styles.routeCardHeader}>
                                        <span className={styles.routeName}>{route.name}</span>
                                        <span className={`badge badge-${level === 'safe' ? 'safe' : level === 'moderate' ? 'warning' : 'danger'}`}>{sl}</span>
                                    </div>
                                    <div className={styles.routeMeta}>
                                        <span><Clock size={12} /> {route.durationMinutes} min</span>
                                        <span><MapPin size={12} /> {route.distance} km</span>
                                        <span><Shield size={12} /> Safety {adj}</span>
                                    </div>
                                    <div className={styles.routeScoreBar}>
                                        <div
                                            className={styles.routeScoreFill}
                                            style={{
                                                width: `${adj}%`,
                                                background: level === 'safe' ? '#10b981' : level === 'moderate' ? '#fbbf24' : '#ef4444',
                                            }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Liveliness Index */}
                    {/* Nearby Safe Places */}
                    <div className={`glass-card ${styles.liveinessCard}`} style={{ marginBottom: 12 }}>
                        <h3 className={styles.liveinessTitle}>📍 Nearby Safe Places</h3>
                        {nearbyPois.length === 0 ? (
                            <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>No nearby safe places found within 2.5 km.</p>
                        ) : (
                            <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                                {nearbyPois.map((p) => (
                                    <li key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <strong>{p.name}</strong>
                                                <div style={{ fontSize: 12, color: '#aaa' }}>{p.type}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 600 }}>{(p.distanceMeters / 1000).toFixed(2)} km</div>
                                                <div style={{ fontSize: 12, color: '#aaa' }}>{p.is24x7 ? '24/7' : ''}</div>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className={`glass-card ${styles.liveinessCard}`}>
                        <h3 className={styles.liveinessTitle}>
                            <Shield size={16} /> Liveliness Index
                            <span className={`badge badge-${safetyLevel === 'safe' ? 'safe' : safetyLevel === 'moderate' ? 'warning' : 'danger'}`} style={{ marginLeft: 'auto' }}>
                                {safetyLabel} — {adjustedSafetyScore}%
                            </span>
                        </h3>
                        <div className={styles.scores}>
                            <ScoreBar value={liveinessIndex.streetLighting} label="Street Lighting" colored />
                            <ScoreBar value={liveinessIndex.commercialDensity} label="Commercial Hubs" colored />
                            <ScoreBar value={liveinessIndex.policeProximity} label="Police Proximity" colored />
                            <ScoreBar value={liveinessIndex.crowdReports} label="Crowd Reports" colored />
                            <ScoreBar value={liveinessIndex.incidentRate} label="Incident Safety" colored />
                        </div>
                        <div className={styles.weightNote}>
                            <Info size={12} />
                            MCDA weights: Lighting 30% · Commercial 25% · Police 20% · Crowd 15% · Incidents 10%
                        </div>
                    </div>

                    {/* Virtual Shadowing */}
                    <div className={`glass-card ${styles.shadowCard}`}>
                        <h3 className={styles.shadowTitle}>
                            <Link2 size={16} />
                            Virtual Shadowing
                        </h3>
                        <p className={styles.shadowDesc}>
                            Share a temporary encrypted journey link with a trusted contact. Link auto-expires when you arrive.
                        </p>
                        {!shadowingLink ? (
                            <button className="btn btn-primary" onClick={handleGenerateShadowLink} style={{ width: '100%' }} id="gen-shadow-link-btn">
                                Generate Ephemeral Link
                            </button>
                        ) : (
                            <div className={styles.shadowLinkBox}>
                                <div className={styles.shadowLinkValue}>{shadowingLink.substring(0, 48)}...</div>
                                <div className={styles.shadowLinkMeta}>
                                    <span className="badge badge-safe">🔒 ZKP Encrypted</span>
                                    <span className="badge badge-warning">⏳ Expires in 3h</span>
                                </div>
                                <button className="btn btn-outline" onClick={() => setShadowingLink(null)} style={{ width: '100%', marginTop: 8 }}>
                                    Revoke Link
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Safety Tips */}
                    <div className={`glass-card ${styles.tipsCard}`}>
                        <button
                            className={styles.tipsHeader}
                            onClick={() => setShowTips(!showTips)}
                            aria-expanded={showTips}
                        >
                            <span className={styles.tipsTitle}>🛡️ Travel Safety Tips</span>
                            {showTips ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {showTips && (
                            <ul className={styles.tipsList}>
                                {tips.map((tip, i) => (
                                    <li key={i} className={styles.tipItem}>{tip}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
