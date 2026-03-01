/**
 * useRouting — React hook for real-time route calculation via OSRM
 * 
 * Combines the user's live GPS position (useGeolocation) with real OSRM
 * API calls to calculate safe walking routes to a destination.
 */

import { useState, useCallback, useRef } from 'react';
import type { LatLng } from '../types';
import {
    calculateAlternativeRoutes,
    geocodeAddress,
    reverseGeocode,
    formatDistance,
    formatDuration,
    type OSRMRoute,
    type GeocodingResult,
} from '../services/osrmRouting';
import { applyTemporalAdjustment, fetchCommunityHeatmap, computeOSRMSafetyFromHeatmap } from '../services/brightPath';

export interface ScoredRoute {
    route: OSRMRoute;
    safetyScore: number;
    liveinessIndex: ReturnType<typeof computeOSRMSafetyFromHeatmap>;
    distanceLabel: string;
    durationLabel: string;
    isBrightPath: boolean;
}

export interface RoutingState {
    isLoading: boolean;
    error: string | null;
    routes: ScoredRoute[];
    geocodeResults: GeocodingResult[];
    currentLocation: string | null;
    destinationQuery: string;
    origin: LatLng | null;
    destination: LatLng | null;
}

export function useRouting(currentPosition: LatLng | null) {
    const [state, setState] = useState<RoutingState>({
        isLoading: false,
        error: null,
        routes: [],
        geocodeResults: [],
        currentLocation: null,
        destinationQuery: '',
        origin: currentPosition,
        destination: null,
    });

    const abortRef = useRef<AbortController | null>(null);

    /**
     * Geocode the destination query and present suggestions
     */
    const searchDestination = useCallback(async (query: string) => {
        if (query.length < 3) {
            setState(s => ({ ...s, geocodeResults: [], destinationQuery: query }));
            return;
        }
        setState(s => ({ ...s, destinationQuery: query, isLoading: true, error: null }));
        try {
            const results = await geocodeAddress(query);
            setState(s => ({ ...s, geocodeResults: results, isLoading: false }));
        } catch (err) {
            setState(s => ({ ...s, error: (err as Error).message, isLoading: false }));
        }
    }, []);

    /**
     * Compute routes from current GPS position to the selected destination
     */
    const computeRoutes = useCallback(async (destination: LatLng) => {
        const origin = currentPosition;
        if (!origin) {
            setState(s => ({ ...s, error: 'Could not determine your current location. Enable GPS.' }));
            return;
        }

        abortRef.current?.abort();
        abortRef.current = new AbortController();

        setState(s => ({ ...s, isLoading: true, error: null, destination, geocodeResults: [] }));

        try {
            // Resolve current location name in parallel with route calculation
            const [routes, locationName] = await Promise.all([
                calculateAlternativeRoutes(origin, destination, 2),
                reverseGeocode(origin[0], origin[1]).catch(() => 'Your location'),
            ]);

            // Score each route using Bright-Path heuristics
            const heatmaps = await Promise.all(routes.map((route) => fetchCommunityHeatmap(route)));
            const scored: ScoredRoute[] = routes.map((route, idx) => {
                const liveinessIndex = computeOSRMSafetyFromHeatmap(route, heatmaps[idx] ?? null);
                const rawSafety = liveinessIndex.overall;

                const safetyScore = applyTemporalAdjustment(rawSafety);

                return {
                    route,
                    safetyScore,
                    liveinessIndex,
                    distanceLabel: formatDistance(route.distance),
                    durationLabel: formatDuration(route.duration),
                    isBrightPath: idx === 0 && safetyScore >= 65,
                };
            });

            // Sort: brightest path first
            scored.sort((a, b) => b.safetyScore - a.safetyScore);
            if (scored.length > 0) scored[0].isBrightPath = scored[0].safetyScore >= 65;

            setState(s => ({
                ...s,
                isLoading: false,
                routes: scored,
                origin,
                destination,
                currentLocation: locationName,
                error: null,
            }));
        } catch (err) {
            setState(s => ({
                ...s,
                isLoading: false,
                error: `Route calculation failed: ${(err as Error).message}`,
            }));
        }
    }, [currentPosition]);

    const clearRoutes = useCallback(() => {
        setState(s => ({ ...s, routes: [], destination: null, geocodeResults: [], error: null }));
    }, []);

    return { state, searchDestination, computeRoutes, clearRoutes };
}
