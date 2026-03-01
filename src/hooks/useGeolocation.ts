import { useState, useEffect, useCallback } from 'react';

export interface GeolocationState {
    position: GeolocationPosition | null;
    error: GeolocationPositionError | null;
    isLoading: boolean;
    // Privacy: blurred position for community features
    blurredLat: number | null;
    blurredLng: number | null;
}

interface UseGeolocationOptions {
    enabled?: boolean;
    watch?: boolean;
    blur?: boolean;
    blurRadiusKm?: number;
}

const DEFAULT_BLUR_RADIUS_KM = 0.3; // Default ~300m radius blur

function blurCoordinate(value: number, radiusKm: number): number {
    const MAX_DEGREES = radiusKm / 111.32;
    return value + (Math.random() * 2 - 1) * MAX_DEGREES;
}

export function useGeolocation(enabledOrOptions: boolean | UseGeolocationOptions = true, watch = false) {
    const options: UseGeolocationOptions = typeof enabledOrOptions === 'boolean'
        ? { enabled: enabledOrOptions, watch }
        : (enabledOrOptions ?? {});
    const isEnabled = options.enabled ?? true;
    const shouldWatch = options.watch ?? false;
    const shouldBlur = options.blur ?? true;
    const blurRadiusKm = options.blurRadiusKm ?? DEFAULT_BLUR_RADIUS_KM;

    const [state, setState] = useState<GeolocationState>({
        position: null,
        error: null,
        isLoading: false,
        blurredLat: null,
        blurredLng: null,
    });

    const updatePosition = useCallback((pos: GeolocationPosition) => {
        const blurredLat = shouldBlur ? blurCoordinate(pos.coords.latitude, blurRadiusKm) : pos.coords.latitude;
        const blurredLng = shouldBlur ? blurCoordinate(pos.coords.longitude, blurRadiusKm) : pos.coords.longitude;
        setState({
            position: pos,
            error: null,
            isLoading: false,
            blurredLat,
            blurredLng,
        });
    }, [shouldBlur, blurRadiusKm]);

    const onError = useCallback((err: GeolocationPositionError) => {
        setState(prev => ({ ...prev, error: err, isLoading: false }));
    }, []);

    useEffect(() => {
        if (!isEnabled || !navigator.geolocation) return;
        setState(prev => ({ ...prev, isLoading: true }));

        const opts: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 };

        if (shouldWatch) {
            const id = navigator.geolocation.watchPosition(updatePosition, onError, opts);
            return () => navigator.geolocation.clearWatch(id);
        } else {
            navigator.geolocation.getCurrentPosition(updatePosition, onError, opts);
        }
    }, [isEnabled, shouldWatch, updatePosition, onError]);

    return state;
}
