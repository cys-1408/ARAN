/* ============================================
   ARAN — Central TypeScript Type Definitions
   ============================================ */

/** [latitude, longitude] tuple — standard lat/lng coordinate pair */
export type LatLng = [number, number];

export interface User {
    id: string;
    name: string;
    phone: string;
    email: string;
    language: 'ta' | 'en';
    avatarUrl: string | null;
    joinedAt: string;
}

export interface EmergencyContact {
    id: string;
    name: string;
    phone: string;
    relationship: string;
    isPrimary: boolean;
}

export type SOSTrigger = 'gesture' | 'audio' | 'manual' | 'wearable';
export type AlertStatus = 'active' | 'resolved' | 'cancelled' | 'test';

export interface AlertEvent {
    id: string;
    type: 'sos' | 'test';
    trigger: SOSTrigger;
    timestamp: string;
    location: string;
    status: AlertStatus;
    cancelled: boolean;
    coordinates?: { lat: number; lng: number };
}

export interface SOSState {
    phase: 'idle' | 'detecting' | 'intent-window' | 'confirmed' | 'dispatched' | 'cancelled';
    trigger: SOSTrigger | null;
    confidence: number;
    countdown: number | null;
    startedAt: number | null;
}

export type PostCategory =
    | 'incident'
    | 'risk-zone'
    | 'lighting'
    | 'safety-tip'
    | 'appreciation'
    | 'general';

export interface CommunityPost {
    id: string;
    content: string;
    category: PostCategory;
    locationTag: string | null;
    timestamp: string;
    upvotes: number;
    commentCount: number;
    isAnonymous: boolean;
    author: string;
    severity: 'low' | 'medium' | 'high' | null;
    coordinates?: { lat: number; lng: number };
    comments: Comment[];
}

export interface Comment {
    id: string;
    content: string;
    author: string;
    timestamp: string;
    isAnonymous: boolean;
}

export interface Helpline {
    id: string;
    name: string;
    number: string;
    description: string;
    category: 'emergency' | 'women' | 'cyber' | 'legal' | 'mental-health';
    isNational: boolean;
    available24x7: boolean;
    language: string[];
}

export interface Route {
    id: string;
    name: string;
    type: 'bright-path' | 'fastest' | 'balanced';
    from: string;
    to: string;
    distance: number; // km
    durationMinutes: number;
    safetyScore: number; // 0-100
    liveinessScore: number; // 0-100
    coordinates: [number, number][]; // [lat, lng]
    segments: RouteSegment[];
    pois: PointOfInterest[];
    riskZones: RiskZone[];
}

export interface RouteSegment {
    id: string;
    coordinates: [number, number][];
    liveinessScore: number;
    factors: {
        streetLighting: number;
        commercialDensity: number;
        policeProximity: number;
        crowdReports: number;
        incidentRate: number;
    };
}

export interface PointOfInterest {
    id: string;
    name: string;
    type: 'police' | 'hospital' | 'atm' | 'amma-canteen' | 'pharmacy' | 'cctv';
    coordinates: [number, number];
    is24x7: boolean;
}

export interface RiskZone {
    id: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    coordinates: [number, number][];
    reportCount: number;
    lastReported: string;
}

export interface GuardianVolunteer {
    id: string;
    codeName: string;
    distance: number; // meters
    eta: number; // minutes
    isVerified: boolean;
    organization: string;
    status?: 'alerted' | 'acknowledged' | 'en-route';
    acknowledgedAt?: string;
}

export interface LivelinessIndex {
    overall: number;
    streetLighting: number;
    commercialDensity: number;
    policeProximity: number;
    crowdReports: number;
    incidentRate: number;
}
