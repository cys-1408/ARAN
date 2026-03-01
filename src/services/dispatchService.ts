/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { EmergencyContact } from '../types';

export interface DispatchPayload {
    contacts: EmergencyContact[];
    userName: string;
    latitude: number | null;
    longitude: number | null;
    trigger: string;
    commitmentHash?: string;
    deviceId?: string;
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DispatchResult {
    stage: string;
    success: boolean;
    messageId?: string;
    guardianId?: string;
    twilioSid?: string;
    error?: string;
    timestamp: string;
}

export interface GuardianDispatch {
    guardianId: string;
    location: { lat: number; lng: number };
    estimatedArrival: number; // minutes
    verification: {
        badgeId: string;
        organizationType: 'ngo' | 'private_security' | 'community_leader' | 'volunteer';
        verificationScore: number; // 0-1
    };
}

export interface SMSNotificationStatus {
    messageId: string;
    status: 'queued' | 'sent' | 'delivered' | 'failed';
    recipient: string;
    sentAt: string;
    deliveredAt?: string;
    errorCode?: string;
}

interface BackendDispatchRequest {
    contacts: Array<{ name: string; phone: string; relationship: string }>;
    userName: string;
    location: {
        latitude: number | null;
        longitude: number | null;
        mapsLink: string;
        address?: string;
    };
    trigger: string;
    timestamp: string;
    commitmentHash?: string;
    deviceMetadata: {
        userAgent: string;
        ip?: string;
        deviceId?: string;
    };
    urgencyLevel: string;
    app: string;
    idempotencyKey: string;
}

interface SupabaseConfig {
    url: string;
    anonKey: string;
}

interface TwilioConfig {
    accountSid: string;
    authToken: string;
    fromNumber: string;
}

const SUPABASE_CONFIG: SupabaseConfig = {
    url: import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'
};

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;
const MAX_NAME = 80;
const MAX_REL = 40;
const DISPATCH_TIMEOUT = 15000; // 15 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

class EnhancedDispatchService {
    private supabase: SupabaseClient;
    private fallbackEndpoint: string;
    
    constructor() {
        this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        this.fallbackEndpoint = import.meta.env.VITE_SOS_ENDPOINT || '/api/sos-dispatch';
    }

    async dispatchEmergency(payload: DispatchPayload): Promise<DispatchResult[]> {
        const validation = this.validateDispatchPayload(payload);
        if (!validation.valid) {
            return [{ 
                stage: 'validation', 
                success: false, 
                error: validation.reason,
                timestamp: new Date().toISOString()
            }];
        }

        const results: DispatchResult[] = [];
        const idempotencyKey = crypto.randomUUID();
        
        try {
            // Stage 1: Immediate SMS dispatch via Supabase Edge Function
            const smsResult = await this.dispatchViaSMS(validation.normalized, idempotencyKey);
            results.push(smsResult);

            // Stage 2: Guardian-Verified Tier (parallel to SMS)
            const guardianResult = await this.dispatchToGuardians(validation.normalized, idempotencyKey);
            results.push(guardianResult);

            // Stage 3: Emergency services integration (if critical)
            if (payload.urgencyLevel === 'critical') {
                const emergencyResult = await this.notifyEmergencyServices(validation.normalized, idempotencyKey);
                results.push(emergencyResult);
            }

            // Stage 4: Log incident for analysis
            await this.logIncident(validation.normalized, results, idempotencyKey);

        } catch (error) {
            results.push({
                stage: 'dispatch_error',
                success: false,
                error: `Emergency dispatch failed: ${(error as Error).message}`,
                timestamp: new Date().toISOString()
            });
        }

        return results;
    }

    private async dispatchViaSMS(payload: DispatchPayload, idempotencyKey: string): Promise<DispatchResult> {
        try {
            // Use Supabase Edge Function for SMS dispatch
            const { data, error } = await this.supabase.functions.invoke('sos-sms-dispatch', {
                body: {
                    contacts: payload.contacts.map(c => ({
                        name: c.name,
                        phone: c.phone,
                        relationship: c.relationship
                    })),
                    message: this.buildEmergencyMessage(payload),
                    urgencyLevel: payload.urgencyLevel,
                    location: {
                        latitude: payload.latitude,
                        longitude: payload.longitude,
                        mapsLink: this.buildMapsLink(payload.latitude, payload.longitude)
                    },
                    idempotencyKey
                }
            });

            if (error) {
                throw new Error(`Supabase SMS dispatch failed: ${error.message}`);
            }

            return {
                stage: 'sms_dispatch',
                success: true,
                messageId: data.messageId,
                twilioSid: data.twilioSid,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            // Fallback to direct Twilio integration
            return await this.fallbackTwilioDispatch(payload, idempotencyKey);
        }
    }

    private async fallbackTwilioDispatch(payload: DispatchPayload, idempotencyKey: string): Promise<DispatchResult> {
        try {
            const response = await fetch('/api/twilio-sms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    recipients: payload.contacts.map(c => c.phone),
                    message: this.buildEmergencyMessage(payload),
                    urgencyLevel: payload.urgencyLevel
                }),
                signal: AbortSignal.timeout(DISPATCH_TIMEOUT)
            });

            if (!response.ok) {
                throw new Error(`Twilio SMS dispatch failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return {
                stage: 'twilio_fallback',
                success: true,
                twilioSid: result.sid,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                stage: 'sms_dispatch',
                success: false,
                error: `SMS dispatch completely failed: ${(error as Error).message}`,
                timestamp: new Date().toISOString()
            };
        }
    }

    private async dispatchToGuardians(payload: DispatchPayload, idempotencyKey: string): Promise<DispatchResult> {
        try {
            // Query nearby verified guardians from Supabase
            const guardiansResult = await this.findNearbyGuardians(
                payload.latitude,
                payload.longitude,
                payload.urgencyLevel
            );

            if (guardiansResult.length === 0) {
                return {
                    stage: 'guardian_dispatch',
                    success: false,
                    error: 'No verified guardians found in area',
                    timestamp: new Date().toISOString()
                };
            }

            // Dispatch to the best-matched guardian
            const topGuardian = guardiansResult[0];
            
            const { data, error } = await this.supabase.functions.invoke('guardian-notification', {
                body: {
                    guardianId: topGuardian.guardianId,
                    incident: {
                        location: { lat: payload.latitude, lng: payload.longitude },
                        trigger: payload.trigger,
                        urgencyLevel: payload.urgencyLevel,
                        userName: payload.userName,
                        timestamp: new Date().toISOString()
                    },
                    idempotencyKey
                }
            });

            if (error) {
                throw new Error(`Guardian dispatch failed: ${error.message}`);
            }

            return {
                stage: 'guardian_dispatch',
                success: true,
                guardianId: topGuardian.guardianId,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                stage: 'guardian_dispatch',
                success: false,
                error: `Guardian notification failed: ${(error as Error).message}`,
                timestamp: new Date().toISOString()
            };
        }
    }

    private async findNearbyGuardians(
        latitude: number | null,
        longitude: number | null,
        urgencyLevel: string
    ): Promise<GuardianDispatch[]> {
        if (!latitude || !longitude) {
            return [];
        }

        try {
            // Query Supabase for verified guardians within radius
            const radiusKm = urgencyLevel === 'critical' ? 5 : 3;
            
            const { data: guardians, error } = await this.supabase
                .from('verified_guardians')
                .select(`
                    id,
                    location,
                    badge_id,
                    organization_type,
                    verification_score,
                    available,
                    last_active
                `)
                .eq('available', true)
                .gte('verification_score', 0.7)
                .gte('last_active', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Active in last 30 min
                .limit(5);

            if (error) {
                console.warn('Failed to query guardians:', error);
                return [];
            }

            return (guardians || [])
                .map(g => {
                    const distance = this.calculateDistance(
                        latitude,
                        longitude,
                        g.location.lat,
                        g.location.lng
                    );
                    const estimatedArrival = Math.ceil(distance * 2); // 2 minutes per km estimate
                    
                    return {
                        guardianId: g.id,
                        location: g.location,
                        estimatedArrival,
                        verification: {
                            badgeId: g.badge_id,
                            organizationType: g.organization_type,
                            verificationScore: g.verification_score
                        }
                    };
                })
                .filter(g => {
                    const maxDistance = urgencyLevel === 'critical' ? radiusKm : radiusKm * 0.8;
                    const distance = this.calculateDistance(
                        latitude,
                        longitude,
                        g.location.lat,
                        g.location.lng
                    );
                    return distance <= maxDistance;
                })
                .sort((a, b) => {
                    // Sort by verification score and proximity
                    const scoreA = a.verification.verificationScore;
                    const scoreB = b.verification.verificationScore;
                    if (Math.abs(scoreA - scoreB) > 0.1) {
                        return scoreB - scoreA; // Higher score first
                    }
                    return a.estimatedArrival - b.estimatedArrival; // Closer first
                });

        } catch (error) {
            console.warn('Guardian query failed:', error);
            return [];
        }
    }

    private async notifyEmergencyServices(
        payload: DispatchPayload,
        idempotencyKey: string
    ): Promise<DispatchResult> {
        try {
            // Integration with Tamil Nadu Police Kavalan App API (when available)
            // For now, we'll use a relay service that forwards to emergency numbers
            
            const emergencyPayload = {
                type: 'women_safety_emergency',
                location: {
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    address: await this.reverseGeocode(payload.latitude, payload.longitude)
                },
                incident: {
                    trigger: payload.trigger,
                    timestamp: new Date().toISOString(),
                    urgencyLevel: payload.urgencyLevel
                },
                reporter: {
                    name: payload.userName,
                    app: 'ARAN'
                },
                idempotencyKey
            };

            // Send via Supabase Edge Function that handles emergency service integration
            const { data, error } = await this.supabase.functions.invoke('emergency-services-relay', {
                body: emergencyPayload
            });

            if (error) {
                throw new Error(`Emergency services notification failed: ${error.message}`);
            }

            return {
                stage: 'emergency_services',
                success: true,
                messageId: data.reportId,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                stage: 'emergency_services',
                success: false,
                error: `Emergency services notification failed: ${(error as Error).message}`,
                timestamp: new Date().toISOString()
            };
        }
    }

    private async logIncident(
        payload: DispatchPayload,
        results: DispatchResult[],
        idempotencyKey: string
    ): Promise<void> {
        try {
            await this.supabase.from('emergency_incidents').insert({
                id: idempotencyKey,
                user_name: payload.userName,
                trigger_type: payload.trigger,
                urgency_level: payload.urgencyLevel,
                location: payload.latitude && payload.longitude ? {
                    lat: payload.latitude,
                    lng: payload.longitude
                } : null,
                commitment_hash: payload.commitmentHash,
                device_id: payload.deviceId,
                dispatch_results: results,
                created_at: new Date().toISOString()
            });
        } catch (error) {
            console.warn('Failed to log incident:', error);
            // Don't fail the entire dispatch if logging fails
        }
    }

    private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLng = this.degreesToRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private degreesToRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private async reverseGeocode(lat: number | null, lng: number | null): Promise<string> {
        if (!lat || !lng) return 'Location unavailable';
        
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`,
                { signal: AbortSignal.timeout(5000) }
            );
            
            if (!response.ok) throw new Error('Geocoding failed');
            
            const data = await response.json();
            return data.features?.[0]?.place_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch {
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }

    private buildMapsLink(lat: number | null, lng: number | null): string {
        if (lat === null || lng === null) return 'https://google.com/maps';
        return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    }

    private buildEmergencyMessage(payload: DispatchPayload): string {
        const mapsLink = this.buildMapsLink(payload.latitude, payload.longitude);
        const triggerLabels: Record<string, string> = {
            gesture: 'Hand gesture signal for help',
            audio: '"Kapaathunga" wake-word or stress detected',
            manual: 'Manual button pressed',
            wearable: 'Elevated heart rate detected',
            panic: 'Panic button activated'
        };

        const urgencyPrefix = payload.urgencyLevel === 'critical' ? 'CRITICAL ' : '';
        
        return (
            `${urgencyPrefix}EMERGENCY ALERT - ARAN\n\n` +
            `Person: ${payload.userName}\n` +
            `Trigger: ${triggerLabels[payload.trigger] ?? payload.trigger}\n` +
            `Urgency: ${payload.urgencyLevel.toUpperCase()}\n` +
            `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
            `Location: ${mapsLink}\n\n` +
            `Please call immediately or dispatch help.\n` +
            (payload.commitmentHash ? `ZKP Ref: ${payload.commitmentHash.slice(0, 24)}...\n` : '') +
            `\n--- ARAN Safety App (Tamil Nadu) ---`
        );
    }

    private sanitizeContact(contact: EmergencyContact): EmergencyContact {
        const name = contact.name.trim().slice(0, MAX_NAME);
        const relationship = (contact.relationship || '').trim().slice(0, MAX_REL);
        const phone = contact.phone.replace(/\s+/g, '');
        
        return {
            id: contact.id || crypto.randomUUID(),
            name,
            relationship: relationship || 'Contact',
            phone,
            isPrimary: contact.isPrimary || false
        };
    }

    private validateDispatchPayload(payload: DispatchPayload): 
        { valid: true; normalized: DispatchPayload } | { valid: false; reason: string } {
        
        if (!payload || typeof payload !== 'object') {
            return { valid: false, reason: 'Invalid payload object' };
        }
        
        if (!Array.isArray(payload.contacts) || payload.contacts.length < 1) {
            return { valid: false, reason: 'No emergency contacts provided' };
        }
        
        if (typeof payload.userName !== 'string' || !payload.userName.trim()) {
            return { valid: false, reason: 'User name missing or invalid' };
        }
        
        if (typeof payload.trigger !== 'string' || !payload.trigger.trim()) {
            return { valid: false, reason: 'Trigger type missing or invalid' };
        }

        if (!payload.urgencyLevel || !['low', 'medium', 'high', 'critical'].includes(payload.urgencyLevel)) {
            return { valid: false, reason: 'Invalid urgency level' };
        }

        const normalizedContacts = payload.contacts
            .map(contact => this.sanitizeContact(contact))
            .filter(contact => {
                return contact.name.length > 0 && PHONE_PATTERN.test(contact.phone);
            });

        if (normalizedContacts.length === 0) {
            return { valid: false, reason: 'No valid emergency contacts with E.164 phone numbers' };
        }

        return {
            valid: true,
            normalized: {
                ...payload,
                contacts: normalizedContacts,
                userName: payload.userName.trim().slice(0, MAX_NAME),
                trigger: payload.trigger.trim(),
                deviceId: payload.deviceId || this.generateDeviceId()
            }
        };
    }

    private generateDeviceId(): string {
        // Generate a stable device ID based on browser fingerprint
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('ARAN Device ID', 2, 2);
        }
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL()
        ].join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return 'aran_' + Math.abs(hash).toString(36);
    }

    async getSMSStatus(messageId: string): Promise<SMSNotificationStatus | null> {
        try {
            const { data, error } = await this.supabase
                .from('sms_notifications')
                .select('*')
                .eq('message_id', messageId)
                .single();

            if (error || !data) return null;

            return {
                messageId: data.message_id,
                status: data.status,
                recipient: data.recipient,
                sentAt: data.sent_at,
                deliveredAt: data.delivered_at,
                errorCode: data.error_code
            };
        } catch {
            return null;
        }
    }

    async retryDispatch(originalPayload: DispatchPayload, failedStages: string[]): Promise<DispatchResult[]> {
        const results: DispatchResult[] = [];
        const idempotencyKey = crypto.randomUUID();

        for (const stage of failedStages) {
            try {
                let result: DispatchResult;
                
                switch (stage) {
                    case 'sms_dispatch':
                        result = await this.dispatchViaSMS(originalPayload, idempotencyKey);
                        break;
                    case 'guardian_dispatch':
                        result = await this.dispatchToGuardians(originalPayload, idempotencyKey);
                        break;
                    case 'emergency_services':
                        result = await this.notifyEmergencyServices(originalPayload, idempotencyKey);
                        break;
                    default:
                        result = {
                            stage,
                            success: false,
                            error: `Unknown retry stage: ${stage}`,
                            timestamp: new Date().toISOString()
                        };
                }
                
                results.push(result);
            } catch (error) {
                results.push({
                    stage,
                    success: false,
                    error: `Retry failed: ${(error as Error).message}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return results;
    }
}

// Export singleton instance
export const dispatchService = new EnhancedDispatchService();

// Legacy compatibility exports
export async function dispatchSOS(payload: DispatchPayload): Promise<DispatchResult[]> {
    // Add default urgency level for backward compatibility
    const normalizedPayload = {
        ...payload,
        urgencyLevel: payload.urgencyLevel || 'high' as const
    };
    return await dispatchService.dispatchEmergency(normalizedPayload);
}

export function buildMapsLink(lat: number | null, lng: number | null): string {
    if (lat === null || lng === null) return 'https://google.com/maps';
    return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function buildEmergencyMessage(payload: DispatchPayload): string {
    const mapsLink = buildMapsLink(payload.latitude, payload.longitude);
    const triggerLabel: Record<string, string> = {
        gesture: 'Hand gesture signal for help',
        audio: '"Kapaathunga" wake-word or stress detected',
        manual: 'Manual button pressed',
        wearable: 'Elevated heart rate detected',
    };
    return (
        `EMERGENCY ALERT - ARAN\n\n` +
        `Person: ${payload.userName}\n` +
        `Trigger: ${triggerLabel[payload.trigger] ?? payload.trigger}\n` +
        `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
        `Location: ${mapsLink}\n\n` +
        `Please call immediately or dispatch help.\n` +
        (payload.commitmentHash ? `ZKP Ref: ${payload.commitmentHash.slice(0, 24)}...` : '')
    );
}

function sanitizeContact(contact: EmergencyContact) {
    const name = contact.name.trim().slice(0, MAX_NAME);
    const relationship = (contact.relationship || '').trim().slice(0, MAX_REL);
    const phone = contact.phone.replace(/\s+/g, '');
    return { name, relationship, phone, isPrimary: contact.isPrimary };
}

function validateDispatchPayload(payload: DispatchPayload): { valid: true; normalized: DispatchPayload } | { valid: false; reason: string } {
    if (!payload || typeof payload !== 'object') return { valid: false, reason: 'Invalid payload object' };
    if (!Array.isArray(payload.contacts) || payload.contacts.length < 1) return { valid: false, reason: 'No emergency contacts' };
    if (typeof payload.userName !== 'string' || !payload.userName.trim()) return { valid: false, reason: 'User name missing' };
    if (typeof payload.trigger !== 'string' || !payload.trigger.trim()) return { valid: false, reason: 'Trigger missing' };

    const normalizedContacts = payload.contacts
        .map(sanitizeContact)
        .filter((c) => c.name.length > 0 && PHONE_PATTERN.test(c.phone))
        .map((c) => ({
            id: crypto.randomUUID(),
            name: c.name,
            phone: c.phone,
            relationship: c.relationship || 'Contact',
            isPrimary: c.isPrimary,
        })) as EmergencyContact[];

    if (!normalizedContacts.length) return { valid: false, reason: 'No valid E.164 contact numbers' };

    return {
        valid: true,
        normalized: {
            ...payload,
            contacts: normalizedContacts,
            userName: payload.userName.trim().slice(0, MAX_NAME),
            trigger: payload.trigger.trim(),
        },
    };
}

function computeIdempotencyKey(payload: DispatchPayload) {
    const contacts = payload.contacts
        .map((c) => `${c.name}|${c.phone}|${c.relationship}`)
        .sort()
        .join(';');
    const core = `${payload.userName}|${payload.trigger}|${payload.latitude ?? 'x'}|${payload.longitude ?? 'x'}|${contacts}|${payload.commitmentHash ?? ''}`;
    const bytes = new TextEncoder().encode(core);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
        hash = (hash * 31 + bytes[i]) >>> 0;
    }
    return `aran-${Date.now()}-${hash.toString(16)}`;
}

async function dispatchNotification(payload: DispatchPayload): Promise<DispatchResult> {
    if (!('Notification' in window)) {
        return { stage: 'notification', success: false, error: 'Notification API not available' };
    }
    try {
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission !== 'granted') return { stage: 'notification', success: false, error: 'Notification permission denied' };

        new Notification('ARAN SOS DISPATCHED', {
            body: `Emergency alert sent to ${payload.contacts.length} contacts.`,
            icon: '/aran-icon.svg',
            badge: '/aran-icon.svg',
            tag: 'aran-sos',
            requireInteraction: true,
        });
        if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300]);
        return { stage: 'notification', success: true };
    } catch (error) {
        return { stage: 'notification', success: false, error: (error as Error).message };
    }
}

async function dispatchSMS(payload: DispatchPayload): Promise<DispatchResult[]> {
    const message = buildEmergencyMessage(payload);
    const results: DispatchResult[] = [];
    for (const contact of payload.contacts) {
        try {
            const smsBody = encodeURIComponent(message);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const sep = isIOS ? '&' : '?';
            const a = document.createElement('a');
            a.href = `sms:${contact.phone}${sep}body=${smsBody}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            if (contact.isPrimary) a.click();
            document.body.removeChild(a);
            results.push({ stage: `sms:${contact.name}`, success: true });
        } catch (error) {
            results.push({ stage: `sms:${contact.name}`, success: false, error: (error as Error).message });
        }
    }
    return results;
}

async function dispatchWebShare(payload: DispatchPayload): Promise<DispatchResult> {
    if (!navigator.share) return { stage: 'web-share', success: false, error: 'Web Share API not supported' };
    try {
        await navigator.share({
            title: 'ARAN Emergency Alert',
            text: buildEmergencyMessage(payload),
            url: buildMapsLink(payload.latitude, payload.longitude),
        });
        return { stage: 'web-share', success: true };
    } catch (error) {
        const message = (error as Error).message || '';
        if (message.includes('AbortError')) return { stage: 'web-share', success: true, error: 'Share dismissed' };
        return { stage: 'web-share', success: false, error: message };
    }
}

async function dispatchToBackend(payload: DispatchPayload, idempotencyKey: string): Promise<DispatchResult> {
    if (!BACKEND_ENDPOINT) return { stage: 'backend', success: false, error: 'VITE_SOS_ENDPOINT not configured' };

    const requestBody: BackendDispatchRequest = {
        contacts: payload.contacts.map((c) => ({ name: c.name, phone: c.phone, relationship: c.relationship || 'Contact' })),
        userName: payload.userName,
        location: {
            latitude: payload.latitude,
            longitude: payload.longitude,
            mapsLink: buildMapsLink(payload.latitude, payload.longitude),
        },
        trigger: payload.trigger,
        timestamp: new Date().toISOString(),
        commitmentHash: payload.commitmentHash,
        app: 'aran-safety-v1',
        idempotencyKey,
    };

    const attempts = [0, 1_000, 2_500];
    let lastError = 'Unknown backend error';
    for (let i = 0; i < attempts.length; i++) {
        if (attempts[i] > 0) await wait(attempts[i]);
        try {
            const response = await fetch(BACKEND_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-idempotency-key': idempotencyKey,
                    ...(import.meta.env.VITE_SOS_API_KEY ? { 'x-api-key': import.meta.env.VITE_SOS_API_KEY } : {}),
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(12_000),
            });

            if (response.ok) return { stage: 'backend', success: true };
            const text = await response.text().catch(() => '');
            lastError = `HTTP ${response.status}: ${text}`;
            if (response.status < 500) break;
        } catch (error) {
            lastError = (error as Error).message;
        }
    }
    return { stage: 'backend', success: false, error: lastError };
}

function dispatchEmail(payload: DispatchPayload): DispatchResult {
    try {
        const subject = encodeURIComponent('ARAN Emergency SOS Alert');
        const body = encodeURIComponent(buildEmergencyMessage(payload));
        const a = document.createElement('a');
        a.href = `mailto:?subject=${subject}&body=${body}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return { stage: 'email', success: true };
    } catch (error) {
        return { stage: 'email', success: false, error: (error as Error).message };
    }
}


