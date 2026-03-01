import { useState, useRef } from 'react';
import { User, Phone, Mail, Camera, Plus, Trash2, Clock, Shield, Bell, Heart, MapPin, Edit3, Check } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { EmergencyContact } from '../types';
import styles from './ProfilePage.module.css';

function ContactForm({ onSave, onCancel, initial }: {
    onSave: (c: EmergencyContact) => void;
    onCancel: () => void;
    initial?: Partial<EmergencyContact>;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [phone, setPhone] = useState(initial?.phone ?? '');
    const [relationship, setRelationship] = useState(initial?.relationship ?? '');
    const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);

    const handleSave = () => {
        if (!name.trim() || !phone.trim()) return;
        onSave({
            id: initial?.id ?? `ec-${Date.now()}`,
            name: name.trim(),
            phone: phone.trim(),
            relationship: relationship.trim(),
            isPrimary,
        });
    };

    return (
        <div className={styles.contactForm}>
            <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            <input type="tel" placeholder="+91 XXXXX XXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
            <input type="text" placeholder="Relationship (e.g. Mother, Friend)" value={relationship} onChange={e => setRelationship(e.target.value)} />
            <label className={styles.primaryLabel}>
                <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
                <span>Mark as Primary contact</span>
            </label>
            <div className={styles.formActions}>
                <button className="btn btn-primary" onClick={handleSave}><Check size={16} /> Save</button>
                <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}

export function ProfilePage() {
    const { state, dispatch } = useApp();
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState(state.user?.name ?? '');
    const [addingContact, setAddingContact] = useState(false);
    const [editingContactId, setEditingContactId] = useState<string | null>(null);

    const handleSaveName = () => {
        if (nameInput.trim()) {
            dispatch({ type: 'UPDATE_USER', payload: { name: nameInput.trim() } });
        }
        setEditingName(false);
    };

    const handleAddContact = (contact: EmergencyContact) => {
        dispatch({ type: 'ADD_CONTACT', payload: contact });
        setAddingContact(false);
    };

    const handleUpdateContact = (contact: EmergencyContact) => {
        dispatch({ type: 'UPDATE_CONTACT', payload: contact });
        setEditingContactId(null);
    };

    const handleRemoveContact = (id: string) => {
        if (state.emergencyContacts.length <= 2) {
            alert('Minimum 2 emergency contacts required for SOS activation.');
            return;
        }
        dispatch({ type: 'REMOVE_CONTACT', payload: id });
    };

    const togglePref = (key: keyof typeof state.safetyPreferences) => {
        dispatch({ type: 'TOGGLE_PREFERENCE', payload: key });
    };

    const PREF_ITEMS = [
        { key: 'audioMonitoring' as const, label: 'Audio Monitoring', icon: Bell, desc: 'Listen for "Kapaathunga" and stress patterns' },
        { key: 'gestureDetection' as const, label: 'Gesture Detection', icon: User, desc: 'TF.js International Signal for Help detection' },
        { key: 'autoSOS' as const, label: 'Auto-SOS (No Window)', icon: Shield, desc: 'Skip 5-second window — immediate dispatch' },
        { key: 'wearableSync' as const, label: 'Wearable Sync', icon: Heart, desc: 'Use heart-rate data for SOS confidence boost' },
        { key: 'shareLocationOnSOS' as const, label: 'Share Location on SOS', icon: MapPin, desc: 'Send ZKP-encrypted location to emergency contacts' },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <h1 className={styles.title}><User size={26} /> My Safety Profile</h1>

                {/* Profile Card */}
                <div className={`glass-card ${styles.profileCard}`}>
                    <div className={styles.profileAvatar}>
                        <div className={styles.avatarCircle}>
                            {(state.user?.name ?? 'U').charAt(0).toUpperCase()}
                        </div>
                    </div>

                    <div className={styles.profileInfo}>
                        {editingName ? (
                            <div className={styles.nameEditRow}>
                                <input
                                    type="text"
                                    value={nameInput}
                                    onChange={e => setNameInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                                    autoFocus
                                    className={styles.nameInput}
                                    id="profile-name-input"
                                />
                                <button className="btn btn-primary" onClick={handleSaveName}><Check size={16} /></button>
                            </div>
                        ) : (
                            <div className={styles.nameRow}>
                                <h2 className={styles.profileName}>{state.user?.name ?? 'Guest User'}</h2>
                                <button className={`btn btn-ghost ${styles.editBtn}`} onClick={() => setEditingName(true)} id="edit-name-btn">
                                    <Edit3 size={14} />
                                </button>
                            </div>
                        )}

                        <div className={styles.profileMeta}>
                            <span className="badge badge-safe">
                                <Shield size={12} /> Guardian-Level User
                            </span>
                            <span className={styles.joinedDate}>
                                <Clock size={12} />
                                Member since {new Date(state.user?.joinedAt ?? '').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>

                <div className={styles.grid}>
                    {/* Emergency Contacts */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}><Phone size={18} /> Emergency Contacts</h2>
                            <span className="badge badge-muted">Min. 2 required</span>
                        </div>

                        <div className={styles.contactsList}>
                            {state.emergencyContacts.map((contact) => (
                                editingContactId === contact.id ? (
                                    <ContactForm
                                        key={contact.id}
                                        initial={contact}
                                        onSave={handleUpdateContact}
                                        onCancel={() => setEditingContactId(null)}
                                    />
                                ) : (
                                    <div key={contact.id} className={styles.contactItem}>
                                        <div className={styles.contactAvatar}>{contact.name.charAt(0)}</div>
                                        <div className={styles.contactInfo}>
                                            <span className={styles.contactName}>
                                                {contact.name}
                                                {contact.isPrimary && <span className="badge badge-primary" style={{ marginLeft: 6, fontSize: '10px' }}>Primary</span>}
                                            </span>
                                            <span className={styles.contactSub}>{contact.relationship} · {contact.phone}</span>
                                        </div>
                                        <div className={styles.contactActions}>
                                            <button className="btn btn-ghost" onClick={() => setEditingContactId(contact.id)} aria-label="Edit contact">
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => handleRemoveContact(contact.id)}
                                                aria-label="Remove contact"
                                                style={{ color: 'var(--color-danger)' }}
                                                disabled={state.emergencyContacts.length <= 2}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            ))}
                        </div>

                        {addingContact ? (
                            <ContactForm onSave={handleAddContact} onCancel={() => setAddingContact(false)} />
                        ) : (
                            <button
                                className="btn btn-outline"
                                onClick={() => setAddingContact(true)}
                                style={{ width: '100%', marginTop: 'var(--space-4)' }}
                                id="add-contact-btn"
                            >
                                <Plus size={16} /> Add Contact
                            </button>
                        )}
                    </section>

                    {/* Safety Preferences */}
                    <section className={`glass-card ${styles.card}`}>
                        <h2 className={styles.cardTitle}><Shield size={18} /> Safety Preferences</h2>
                        <div className={styles.prefList}>
                            {PREF_ITEMS.map(({ key, label, icon: Icon, desc }) => (
                                <div key={key} className={styles.prefItem}>
                                    <div className={styles.prefIcon}><Icon size={16} /></div>
                                    <div className={styles.prefInfo}>
                                        <span className={styles.prefLabel}>{label}</span>
                                        <span className={styles.prefDesc}>{desc}</span>
                                    </div>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={state.safetyPreferences[key] as boolean}
                                            onChange={() => togglePref(key)}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>
                            ))}
                        </div>

                        <div className={styles.privacySection}>
                            <div className={styles.privacyHeader}>
                                <Shield size={14} className={styles.privacyIcon} />
                                <span>Privacy & Data</span>
                            </div>
                            <div className={styles.zkpBadge}>
                                <div className={styles.zkpDot} />
                                <div>
                                    <span className={styles.zkpTitle}>Zero-Knowledge Proof Active</span>
                                    <span className={styles.zkpDesc}>Your precise location is never stored. SOS events share a one-time encrypted key, blind to the server.</span>
                                </div>
                            </div>
                            <div className={styles.blurRadiusRow}>
                                <span className={styles.blurLabel}>Location Blur Radius</span>
                                <span className={styles.blurValue}>{state.safetyPreferences.locationBlurRadius} km</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${state.safetyPreferences.locationBlurRadius * 100}%` }} />
                            </div>
                        </div>
                    </section>

                    {/* Alert History */}
                    <section className={`glass-card ${styles.card} ${styles.historyCard}`}>
                        <h2 className={styles.cardTitle}><Clock size={18} /> Alert History</h2>
                        <div className={styles.historyList}>
                            {state.alertHistory.length === 0 ? (
                                <div className={styles.emptyHistory}>No alerts recorded yet. Stay safe!</div>
                            ) : (
                                state.alertHistory.map((alert) => (
                                    <div key={alert.id} className={styles.historyItem}>
                                        <div className={[
                                            styles.historyDot,
                                            alert.status === 'resolved' ? styles.historyDotResolved : '',
                                            alert.type === 'test' ? styles.historyDotTest : '',
                                        ].join(' ')} />
                                        <div className={styles.historyInfo}>
                                            <span className={styles.historyType}>
                                                {alert.type === 'test' ? '🔬 Test SOS' : `🆘 SOS — ${alert.trigger}`}
                                            </span>
                                            <span className={styles.historyLocation}><MapPin size={10} /> {alert.location}</span>
                                        </div>
                                        <div className={styles.historyRight}>
                                            <span className={styles.historyTime}>
                                                {new Date(alert.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className={`badge ${alert.cancelled ? 'badge-muted' :
                                                    alert.status === 'resolved' ? 'badge-safe' :
                                                        alert.type === 'test' ? 'badge-warning' : 'badge-danger'
                                                }`}>
                                                {alert.cancelled ? 'Cancelled' : alert.status}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
