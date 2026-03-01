import type { GuardianVolunteer } from '../types';

interface GuardianSeed {
    id: string;
    codeName: string;
    organization: string;
    lat: number;
    lng: number;
}

const GUARDIAN_POOL: GuardianSeed[] = [
    { id: 'g-7a2f', codeName: 'Guardian-7A2F', organization: 'Night Shift Volunteers TN', lat: 12.9046, lng: 80.2281 },
    { id: 'g-2c9d', codeName: 'Guardian-2C9D', organization: 'SafeStreets NGO', lat: 12.9008, lng: 80.2165 },
    { id: 'g-9b14', codeName: 'Guardian-9B14', organization: 'Women Safe Transit Collective', lat: 12.9112, lng: 80.2238 },
    { id: 'g-cbe1', codeName: 'Guardian-CBE1', organization: 'Coimbatore Community Watch', lat: 11.0153, lng: 76.9687 },
    { id: 'g-cbe2', codeName: 'Guardian-CBE2', organization: 'Blue Shield TN', lat: 11.0098, lng: 76.9624 },
];

function toRadians(value: number) {
    return value * (Math.PI / 180);
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
    const R = 6371e3;
    const dLat = toRadians(bLat - aLat);
    const dLng = toRadians(bLng - aLng);
    const aa = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function findNearbyGuardians(
    latitude: number | null,
    longitude: number | null,
    limit = 3
): GuardianVolunteer[] {
    if (latitude === null || longitude === null) return [];

    return GUARDIAN_POOL
        .map((guardian) => {
            const distance = Math.round(haversineMeters(latitude, longitude, guardian.lat, guardian.lng));
            const eta = Math.max(2, Math.round(distance / 80));
            return {
                id: guardian.id,
                codeName: guardian.codeName,
                organization: guardian.organization,
                distance,
                eta,
                isVerified: true,
                status: 'alerted' as const,
            };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
}

export async function routeSOSAlertToGuardians(
    latitude: number | null,
    longitude: number | null,
    limit = 3
): Promise<GuardianVolunteer[]> {
    const guardians = findNearbyGuardians(latitude, longitude, limit);
    if (!guardians.length) return [];

    await new Promise((resolve) => setTimeout(resolve, 400));
    return guardians.map((guardian, idx) => ({
        ...guardian,
        status: idx === 0 ? 'en-route' : 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
    }));
}
