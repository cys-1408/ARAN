import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { User, EmergencyContact, AlertEvent, CommunityPost } from '../types';

/* ---------- State Shape ---------- */
interface AppState {
    user: User | null;
    emergencyContacts: EmergencyContact[];
    alertHistory: AlertEvent[];
    communityPosts: CommunityPost[];
    isSOSActive: boolean;
    sosStartTime: number | null;
    safetyPreferences: {
        audioMonitoring: boolean;
        gestureDetection: boolean;
        autoSOS: boolean;
        wearableSync: boolean;
        locationBlurRadius: number; // in km
        shareLocationOnSOS: boolean;
    };
}

/* ---------- Action Types ---------- */
type AppAction =
    | { type: 'SET_USER'; payload: User }
    | { type: 'UPDATE_USER'; payload: Partial<User> }
    | { type: 'ADD_CONTACT'; payload: EmergencyContact }
    | { type: 'UPDATE_CONTACT'; payload: EmergencyContact }
    | { type: 'REMOVE_CONTACT'; payload: string }
    | { type: 'TRIGGER_SOS' }
    | { type: 'CANCEL_SOS' }
    | { type: 'ADD_ALERT'; payload: AlertEvent }
    | { type: 'ADD_POST'; payload: CommunityPost }
    | { type: 'TOGGLE_PREFERENCE'; payload: keyof AppState['safetyPreferences'] }
    | { type: 'UPVOTE_POST'; payload: string }
    | { type: 'LOAD_STATE'; payload: Partial<AppState> };

/* ---------- Initial State ---------- */
const INITIAL_STATE: AppState = {
    user: {
        id: 'u-1',
        name: 'Guest User',
        phone: '',
        email: '',
        language: 'ta',
        avatarUrl: null,
        joinedAt: new Date('2026-01-15').toISOString(),
    },
    emergencyContacts: [
        { id: 'ec-1', name: 'Amma', phone: '+91 98765 43210', relationship: 'Mother', isPrimary: true },
        { id: 'ec-2', name: 'Kavitha', phone: '+91 87654 32109', relationship: 'Friend', isPrimary: false },
    ],
    alertHistory: [
        { id: 'a-1', type: 'sos', trigger: 'gesture', timestamp: new Date('2026-02-28T22:15:00').toISOString(), location: 'OMR, Chennai', status: 'resolved', cancelled: false },
        { id: 'a-2', type: 'sos', trigger: 'audio', timestamp: new Date('2026-02-14T20:30:00').toISOString(), location: 'T-Nagar, Chennai', status: 'resolved', cancelled: true },
        { id: 'a-3', type: 'test', trigger: 'manual', timestamp: new Date('2026-01-20T10:00:00').toISOString(), location: 'Coimbatore', status: 'test', cancelled: false },
    ],
    communityPosts: [],
    isSOSActive: false,
    sosStartTime: null,
    safetyPreferences: {
        audioMonitoring: true,
        gestureDetection: true,
        autoSOS: false,
        wearableSync: false,
        locationBlurRadius: 0.3,
        shareLocationOnSOS: true,
    },
};

/* ---------- Reducer ---------- */
function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'LOAD_STATE':
            return { ...state, ...action.payload };
        case 'SET_USER':
            return { ...state, user: action.payload };
        case 'UPDATE_USER':
            return { ...state, user: state.user ? { ...state.user, ...action.payload } : state.user };
        case 'ADD_CONTACT':
            return { ...state, emergencyContacts: [...state.emergencyContacts, action.payload] };
        case 'UPDATE_CONTACT':
            return {
                ...state,
                emergencyContacts: state.emergencyContacts.map(c =>
                    c.id === action.payload.id ? action.payload : c
                ),
            };
        case 'REMOVE_CONTACT':
            return {
                ...state,
                emergencyContacts: state.emergencyContacts.filter(c => c.id !== action.payload),
            };
        case 'TRIGGER_SOS':
            return { ...state, isSOSActive: true, sosStartTime: Date.now() };
        case 'CANCEL_SOS':
            return { ...state, isSOSActive: false, sosStartTime: null };
        case 'ADD_ALERT':
            return { ...state, alertHistory: [action.payload, ...state.alertHistory] };
        case 'ADD_POST':
            return { ...state, communityPosts: [action.payload, ...state.communityPosts] };
        case 'UPVOTE_POST':
            return {
                ...state,
                communityPosts: state.communityPosts.map(p =>
                    p.id === action.payload ? { ...p, upvotes: p.upvotes + 1 } : p
                ),
            };
        case 'TOGGLE_PREFERENCE':
            return {
                ...state,
                safetyPreferences: {
                    ...state.safetyPreferences,
                    [action.payload]: !state.safetyPreferences[action.payload as keyof typeof state.safetyPreferences],
                },
            };
        default:
            return state;
    }
}

/* ---------- Context ---------- */
interface AppContextValue {
    state: AppState;
    dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);

    // Persist to localStorage
    useEffect(() => {
        const stored = localStorage.getItem('aran-state');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                dispatch({ type: 'LOAD_STATE', payload: parsed });
            } catch { /* ignore malformed data */ }
        }
    }, []);

    useEffect(() => {
        const toStore = {
            user: state.user,
            emergencyContacts: state.emergencyContacts,
            safetyPreferences: state.safetyPreferences,
            alertHistory: state.alertHistory.slice(0, 50),
        };
        localStorage.setItem('aran-state', JSON.stringify(toStore));
    }, [state.user, state.emergencyContacts, state.safetyPreferences, state.alertHistory]);

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
