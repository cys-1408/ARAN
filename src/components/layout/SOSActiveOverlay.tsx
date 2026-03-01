import { Phone, MapPin, X, CheckCircle2, Shield, Link2, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { divIcon, type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EmergencyContact, GuardianVolunteer } from '../../types';
import styles from './SOSActiveOverlay.module.css';

interface Props {
    contacts: EmergencyContact[];
    guardians: GuardianVolunteer[];
    commitmentHex?: string;
    shadowLink?: string;
    latitude: number | null;
    longitude: number | null;
    onDismiss: () => void;
}

const NEARBY_SERVICES = [
    { name: 'Sholinganallur Police Station', type: 'police', distance: '0.4 km', phone: '044-24501234', eta: '~4 min', coords: [12.9059, 80.2275] as LatLngTuple },
    { name: 'Apollo Hospital OMR', type: 'hospital', distance: '1.2 km', phone: '044-28290000', eta: '~8 min', coords: [12.9007, 80.2247] as LatLngTuple },
];

function buildServiceIcon(type: 'police' | 'hospital') {
    const badge = type === 'police' ? '🚔' : '🏥';
    return divIcon({
        html: `<div class="${styles.mapServiceIcon}">${badge}</div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

export function SOSActiveOverlay({ contacts, guardians, commitmentHex, shadowLink, latitude, longitude, onDismiss }: Props) {
    const [copied, setCopied] = useState(false);
    const mapCenter: LatLngTuple = latitude !== null && longitude !== null ? [latitude, longitude] : [12.9049, 80.2220];
    const mapsUrl = latitude !== null && longitude !== null
        ? `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`
        : null;

    const guardianList = useMemo(
        () => guardians.length ? guardians : [{ id: 'fallback', codeName: 'Guardian-Standby', organization: 'Blue Shield TN', distance: 500, eta: 5, isVerified: true, status: 'alerted' as const }],
        [guardians]
    );

    const handleCopyHash = async () => {
        if (!commitmentHex) return;
        await navigator.clipboard.writeText(commitmentHex);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-label="SOS Active">
            <div className={styles.panel}>
                <div className={styles.header}>
                    <div className={styles.headerIcon}>
                        <Shield size={28} />
                    </div>
                    <div>
                        <h2 className={styles.title}>SOS Dispatched</h2>
                        <p className={styles.subtitle}>Emergency contacts and nearby blue-badge guardians have been alerted</p>
                    </div>
                </div>

                <div className={styles.statusZone}>
                    <div className={styles.statusBar}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span>
                            {latitude !== null
                                ? `GPS: ${latitude.toFixed(5)}, ${longitude?.toFixed(5)}`
                                : 'Location unavailable - contacts alerted without coordinates'}
                        </span>
                        {mapsUrl && (
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapsLink}>
                                <MapPin size={12} /> Open Map
                            </a>
                        )}
                    </div>

                    {commitmentHex && (
                        <div className={styles.zkpBadge} title="SHA-256 location commitment - verifiable by trusted contacts only">
                            <div className={styles.zkpDot} />
                            <div className={styles.zkpContent}>
                                <span className={styles.zkpLabel}>ZKP Commitment Hash</span>
                                <code className={styles.zkpHash}>{commitmentHex.slice(0, 32)}...</code>
                            </div>
                            <button className={styles.copyBtn} onClick={handleCopyHash} aria-label="Copy commitment hash" title="Copy full hash">
                                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                    )}

                    {shadowLink && (
                        <div className={styles.shadowLinkRow}>
                            <Link2 size={12} />
                            <span className={styles.shadowLinkText}>{shadowLink.slice(0, 52)}...</span>
                            <button className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(shadowLink)} aria-label="Copy shadow link">
                                <Copy size={12} />
                            </button>
                        </div>
                    )}
                </div>

                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Emergency Zone Map</h3>
                    <div className={styles.mapWrap}>
                        <MapContainer center={mapCenter} zoom={15} className={styles.map} attributionControl={false} zoomControl={false}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {latitude !== null && longitude !== null && (
                                <CircleMarker center={[latitude, longitude]} radius={8} pathOptions={{ color: '#ef4444', fillOpacity: 0.7 }}>
                                    <Popup>Your live SOS location</Popup>
                                </CircleMarker>
                            )}
                            {NEARBY_SERVICES.map((service) => (
                                <Marker key={service.name} position={service.coords} icon={buildServiceIcon(service.type as 'police' | 'hospital')}>
                                    <Popup>{service.name}</Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                </section>

                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Contacts Notified</h3>
                    <div className={styles.contacts}>
                        {contacts.map((c) => (
                            <div key={c.id} className={styles.contactCard}>
                                <div className={styles.contactAvatar}>{c.name.charAt(0).toUpperCase()}</div>
                                <div className={styles.contactInfo}>
                                    <span className={styles.contactName}>{c.name}</span>
                                    <span className={styles.contactRel}>{c.relationship}</span>
                                </div>
                                <div className={styles.contactStatus}>
                                    <span className="status-dot active"></span>
                                    <span>Alerted</span>
                                </div>
                                <a href={`tel:${c.phone}`} className={styles.callBtn} aria-label={`Call ${c.name}`}>
                                    <Phone size={16} />
                                </a>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Nearest Emergency Services</h3>
                    <div className={styles.services}>
                        {NEARBY_SERVICES.map((s) => (
                            <div key={s.name} className={styles.serviceCard}>
                                <MapPin size={16} className={s.type === 'police' ? styles.policeIcon : styles.hospitalIcon} />
                                <div className={styles.serviceInfo}>
                                    <span className={styles.serviceName}>{s.name}</span>
                                    <span className={styles.serviceMeta}>{s.distance} | ETA {s.eta}</span>
                                </div>
                                <a href={`tel:${s.phone}`} className={styles.serviceCallBtn}>
                                    <Phone size={14} />
                                </a>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Guardian-Verified Tier</h3>
                    <div className={styles.guardians}>
                        {guardianList.map((guardian) => (
                            <div key={guardian.id} className={styles.guardianCard}>
                                <div className={styles.guardianBadge}>🛡️</div>
                                <div className={styles.guardianInfo}>
                                    <span className={styles.guardianCode}>{guardian.codeName}</span>
                                    <span className={styles.guardianMeta}>
                                        {guardian.organization} | {(guardian.distance / 1000).toFixed(1)} km | ETA {guardian.eta} min
                                    </span>
                                </div>
                                <div className={styles.guardianStatus}>
                                    <span className="status-dot active"></span>
                                    {guardian.status ?? 'alerted'}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <div className={styles.dismiss}>
                    <button className="btn btn-outline" onClick={onDismiss} id="sos-dismiss-btn">
                        <X size={16} />
                        I'm Safe - Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
}
