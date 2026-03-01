import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Shield, MapPin, Users, Phone, Siren, Eye, Mic,
    TrendingUp, AlertTriangle, Clock, ArrowRight, ChevronRight
} from 'lucide-react';
import styles from './LandingPage.module.css';

// Time-aware safety statistics (mock data)
function getSafetyStats() {
    const now = new Date();
    const hour = now.getHours();
    const isNight = hour >= 21 || hour < 6;
    return {
        activeSessions: 1247 + Math.floor(Math.random() * 50),
        safeRoutes: 38291,
        communityAlerts: isNight ? 14 : 6,
        guardiansOnline: isNight ? 234 : 189,
        incidentsReported: 2847,
        citiesActive: 12,
    };
}

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
    const [count, setCount] = useState(0);
    const ref = useRef(false);

    useEffect(() => {
        if (ref.current) return;
        ref.current = true;
        const duration = 1800;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            current = Math.min(target, Math.round(increment * step));
            setCount(current);
            if (step >= steps) clearInterval(timer);
        }, duration / steps);
        return () => clearInterval(timer);
    }, [target]);

    return <span>{count.toLocaleString('en-IN')}{suffix}</span>;
}

const QUICK_TOOLS = [
    {
        id: 'sos',
        icon: Siren,
        label: 'Silent SOS',
        labelTa: 'அவசர SOS',
        description: 'Trigger emergency alert silently',
        to: '/sos',
        color: 'danger',
        highlight: true,
    },
    {
        id: 'navigate',
        icon: MapPin,
        label: 'Safe Route',
        labelTa: 'பாதுகாப்பான வழி',
        description: 'Get the safest route',
        to: '/navigate',
        color: 'safe',
    },
    {
        id: 'community',
        icon: Users,
        label: 'Community',
        labelTa: 'சமூகம்',
        description: 'Report & read alerts',
        to: '/community',
        color: 'primary',
    },
    {
        id: 'resources',
        icon: Phone,
        label: 'Helplines',
        labelTa: 'உவி இடங்கள்',
        description: 'Emergency numbers',
        to: '/resources',
        color: 'accent',
    },
];

const FEATURE_CARDS = [
    {
        icon: '🤚',
        title: 'Hand Gesture SOS',
        description: 'The International Signal for Help detected by on-device AI — no button press needed.',
        badge: 'Edge AI',
    },
    {
        icon: '🎙️',
        title: '"Kapaathunga" Wake-Word',
        description: 'Tamil voice activation triggers silent SOS. All audio processed entirely on-device.',
        badge: 'On-Device',
    },
    {
        icon: '🛤️',
        title: 'Bright-Path Navigation',
        description: 'Routes scored by Liveliness Index — street lighting, crowd reports, police proximity.',
        badge: 'MCDA',
    },
    {
        icon: '🔒',
        title: 'Zero-Knowledge Privacy',
        description: 'Your location is never stored. During SOS, only trusted contacts receive it via ZKP.',
        badge: 'ZKP',
    },
    {
        icon: '🛡️',
        title: 'Guardian Network',
        description: 'Blue-Badge verified volunteers provide immediate community assistance.',
        badge: 'Community',
    },
    {
        icon: '📳',
        title: 'Haptic Handshake',
        description: '5-second intent window with unique vibration pattern prevents false SOS triggers.',
        badge: 'Anti-False',
    },
];

const TESTIMONIALS = [
    {
        text: 'ARAN-க்கு நன்றி, late night OMR-ல travel பண்ணும்போது இப்போது confident-ஆ feel பண்றேன். Bright Path route என் confidence-ஐ மிகவும் அதிகரித்தது.',
        name: 'Kavitha S.',
        role: 'Software Engineer, Chennai',
        avatar: 'K',
    },
    {
        text: 'The community forum helped me avoid a poorly-lit stretch near Coimbatore bus stand. Women helping women — this is what ARAN is about.',
        name: 'Meena R.',
        role: 'Teacher, Coimbatore',
        avatar: 'M',
    },
    {
        text: 'As a night-shift nurse, ARAN\'s safe route feature and the guardian network give me real peace of mind. The haptic verification is brilliant.',
        name: 'Lakshmi P.',
        role: 'Staff Nurse, Madurai',
        avatar: 'L',
    },
];

export function LandingPage() {
    const stats = getSafetyStats();
    const now = new Date();
    const hour = now.getHours();
    const isNight = hour >= 21 || hour < 6;

    return (
        <div className={styles.page}>
            {/* Hero Section */}
            <section className={styles.hero}>
                <div className={styles.heroBg} aria-hidden="true">
                    <div className={styles.heroBgOrb1} />
                    <div className={styles.heroBgOrb2} />
                    <div className={styles.heroBgOrb3} />
                    <div className={styles.heroGrid} />
                </div>

                <div className={styles.heroContent}>
                    <div className={styles.heroBadge}>
                        <span className="status-dot active"></span>
                        <span>அரண் Platform — Active in Tamil Nadu</span>
                    </div>

                    <h1 className={styles.heroTitle}>
                        <span className={styles.heroTitleTa}>பெண்களின் பாதுகாப்பு</span>
                        <span className={styles.heroTitleEn}>
                            AI-Powered Safety
                            <br />
                            <span className="gradient-text">Ecosystem</span>
                        </span>
                    </h1>

                    <p className={styles.heroSubtitle}>
                        Privacy-first, Edge-AI safety platform built for Tamil Nadu's women.
                        Silent SOS, safe route navigation, community intelligence — all on your device.
                    </p>

                    {isNight && (
                        <div className={styles.nightAlert}>
                            <Clock size={16} />
                            <span>Night Mode Active — Enhanced monitoring recommended after 9pm</span>
                        </div>
                    )}

                    <div className={styles.heroCTA}>
                        <Link to="/sos" className={`btn btn-danger ${styles.btnHero}`} id="hero-sos-cta">
                            <Siren size={20} />
                            Open SOS Dashboard
                        </Link>
                        <Link to="/navigate" className={`btn btn-outline ${styles.btnHeroSecondary}`}>
                            <MapPin size={18} />
                            Plan Safe Route
                            <ArrowRight size={16} />
                        </Link>
                    </div>

                    <div className={styles.heroMeta}>
                        <div className={styles.metaItem}>
                            <Eye size={14} />
                            <span>Mission: Proactive Resilience</span>
                        </div>
                        <div className={styles.metaItem}>
                            <Shield size={14} />
                            <span>Zero data leaves your device</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Live Safety Statistics */}
            <section className={styles.statsSection}>
                <div className={styles.container}>
                    <div className={styles.sectionHeader}>
                        <div className={styles.sectionBadge}>
                            <TrendingUp size={14} />
                            Live Statistics
                        </div>
                        <h2 className={styles.sectionTitle}>Platform Activity Right Now</h2>
                        <p className={styles.sectionSub}>Real-time safety data across Tamil Nadu (mock data)</p>
                    </div>

                    <div className={styles.statsGrid}>
                        {[
                            { label: 'Active Sessions', value: stats.activeSessions, icon: '👩', suffix: '' },
                            { label: 'Safe Routes Planned', value: stats.safeRoutes, icon: '🛤️', suffix: '+' },
                            { label: 'Guardians Online', value: stats.guardiansOnline, icon: '🛡️', suffix: '' },
                            { label: 'Community Alerts', value: stats.communityAlerts, icon: '⚠️', suffix: ' live' },
                            { label: 'Incidents Reported', value: stats.incidentsReported, icon: '📋', suffix: '' },
                            { label: 'Cities Active', value: stats.citiesActive, icon: '🏙️', suffix: '' },
                        ].map((stat) => (
                            <div key={stat.label} className={styles.statCard}>
                                <div className={styles.statIcon}>{stat.icon}</div>
                                <div className={styles.statValue}>
                                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                                </div>
                                <div className={styles.statLabel}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Quick Access Tools */}
            <section className={styles.quickSection}>
                <div className={styles.container}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Quick Access</h2>
                        <p className={styles.sectionSub}>Critical tools — one tap away</p>
                    </div>
                    <div className={styles.quickGrid}>
                        {QUICK_TOOLS.map(({ id, icon: Icon, label, labelTa, description, to, color, highlight }) => (
                            <Link key={id} to={to} className={[styles.quickCard, highlight ? styles.quickCardHighlight : ''].join(' ')} id={`quick-tool-${id}`}>
                                <div className={[styles.quickIcon, styles[`quickIcon_${color}`]].join(' ')}>
                                    <Icon size={26} />
                                </div>
                                <div className={styles.quickText}>
                                    <span className={styles.quickLabel}>{label}</span>
                                    <span className={styles.quickLabelTa}>{labelTa}</span>
                                    <span className={styles.quickDesc}>{description}</span>
                                </div>
                                <ChevronRight size={18} className={styles.quickArrow} />
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Feature Cards */}
            <section className={styles.featuresSection}>
                <div className={styles.container}>
                    <div className={styles.sectionHeader}>
                        <div className={styles.sectionBadge}>
                            <Shield size={14} />
                            Technology
                        </div>
                        <h2 className={styles.sectionTitle}>Built Different</h2>
                        <p className={styles.sectionSub}>Expert safety tech that works when it matters most</p>
                    </div>
                    <div className={styles.featureGrid}>
                        {FEATURE_CARDS.map((f) => (
                            <div key={f.title} className={styles.featureCard}>
                                <div className={styles.featureEmoji}>{f.icon}</div>
                                <span className={`badge badge-primary ${styles.featureBadge}`}>{f.badge}</span>
                                <h3 className={styles.featureTitle}>{f.title}</h3>
                                <p className={styles.featureDesc}>{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Alert Banner */}
            <section className={styles.container}>
                <div className={styles.alertBanner}>
                    <div className={styles.alertIcon}>
                        <AlertTriangle size={22} />
                    </div>
                    <div className={styles.alertContent}>
                        <strong>Community Alert — Active in your area</strong>
                        <p>Reports of poor street lighting near Sholinganallur signal. Prefer Bright Path routes after 9pm.</p>
                    </div>
                    <Link to="/community" className={`btn btn-outline ${styles.alertBtn}`}>
                        View <ChevronRight size={14} />
                    </Link>
                </div>
            </section>

            {/* Testimonials */}
            <section className={styles.testimonialSection}>
                <div className={styles.container}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Voices From the Community</h2>
                    </div>
                    <div className={styles.testimonialGrid}>
                        {TESTIMONIALS.map((t) => (
                            <div key={t.name} className={styles.testimonialCard}>
                                <p className={styles.testimonialText}>"{t.text}"</p>
                                <div className={styles.testimonialAuthor}>
                                    <div className={styles.testimonialAvatar}>{t.avatar}</div>
                                    <div>
                                        <span className={styles.testimonialName}>{t.name}</span>
                                        <span className={styles.testimonialRole}>{t.role}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom CTA */}
            <section className={styles.bottomCTA}>
                <div className={styles.container}>
                    <div className={styles.ctaInner}>
                        <h2 className={styles.ctaTitle}>
                            Technology should not just connect people —<br />
                            <span className="gradient-text">it should protect them.</span>
                        </h2>
                        <p className={styles.ctaDesc}>ARAN (அரண்) means "fortress" in Tamil. Your digital fortress, always on.</p>
                        <div className={styles.ctaActions}>
                            <Link to="/profile" className="btn btn-primary" id="hero-setup-cta">
                                Set Up My Profile
                            </Link>
                            <Link to="/sos" className="btn btn-outline">
                                Learn About SOS →
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
