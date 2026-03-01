import { useState, useMemo } from 'react';
import { BookOpen, Phone, Scale, Shield, Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { HELPLINES, LEGAL_RIGHTS, SELF_DEFENSE_RESOURCES } from '../data/helplines';
import type { Helpline } from '../types';
import styles from './ResourcesPage.module.css';

type Tab = 'helplines' | 'legal' | 'selfdefense' | 'cyber';

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string }> = {
    emergency: { label: 'Emergency', emoji: '🚨' },
    women: { label: 'Women Safety', emoji: '👩' },
    cyber: { label: 'Cyber Crime', emoji: '💻' },
    legal: { label: 'Legal Aid', emoji: '⚖️' },
    'mental-health': { label: 'Mental Health', emoji: '🧠' },
};

function HelplineCard({ h }: { h: Helpline }) {
    const cat = CATEGORY_CONFIG[h.category];
    const isPhone = h.number.match(/^\d/);
    return (
        <div className={styles.helplineCard}>
            <div className={styles.helplineHeader}>
                <div className={styles.helplineCategory}>{cat.emoji}</div>
                <div className={styles.helplineInfo}>
                    <h3 className={styles.helplineName}>{h.name}</h3>
                    <span className={`badge badge-${h.category === 'emergency' ? 'danger' : h.category === 'women' ? 'primary' : h.category === 'cyber' ? 'warning' : 'muted'}`}>
                        {cat.label}
                    </span>
                </div>
                {isPhone ? (
                    <a href={`tel:${h.number}`} className={styles.callBadge} aria-label={`Call ${h.name}`}>
                        <Phone size={14} />
                        {h.number}
                    </a>
                ) : (
                    <div className={styles.numberBadge}>{h.number}</div>
                )}
            </div>
            <p className={styles.helplineDesc}>{h.description}</p>
            <div className={styles.helplineMeta}>
                {h.available24x7 && <span className="badge badge-safe">✅ 24/7</span>}
                {h.isNational && <span className="badge badge-muted">🇮🇳 National</span>}
                <span className={styles.helplineLang}>{h.language.join(' · ')}</span>
            </div>
        </div>
    );
}

function LegalAccordion() {
    const [open, setOpen] = useState<string | null>(null);
    return (
        <div className={styles.accordionList}>
            {LEGAL_RIGHTS.map((r) => (
                <div
                    key={r.id}
                    className={[styles.accordionItem, open === r.id ? styles.accordionOpen : ''].join(' ')}
                >
                    <button
                        className={styles.accordionHeader}
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                        aria-expanded={open === r.id}
                    >
                        <span className={styles.accordionEmoji}>{r.icon}</span>
                        <div className={styles.accordionTitleBlock}>
                            <span className={styles.accordionTitle}>{r.title}</span>
                            <span className="badge badge-muted">{r.law}</span>
                        </div>
                        {open === r.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {open === r.id && (
                        <div className={styles.accordionBody}>
                            <p className={styles.accordionDesc}>{r.description}</p>
                            <div className={styles.actionSteps}>
                                <h4 className={styles.actionStepsTitle}>Action Steps:</h4>
                                <ol className={styles.actionStepsList}>
                                    {r.actionSteps.map((step, i) => <li key={i}>{step}</li>)}
                                </ol>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export function ResourcesPage() {
    const [activeTab, setActiveTab] = useState<Tab>('helplines');
    const [search, setSearch] = useState('');
    const [helplineFilter, setHelplineFilter] = useState<string>('all');

    const filteredHelplines = useMemo(() => {
        let list = HELPLINES;
        if (helplineFilter !== 'all') list = list.filter(h => h.category === helplineFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(h => h.name.toLowerCase().includes(q) || h.description.toLowerCase().includes(q) || h.number.includes(q));
        }
        return list;
    }, [search, helplineFilter]);

    const TABS = [
        { id: 'helplines' as Tab, label: '📞 Helplines', icon: Phone },
        { id: 'legal' as Tab, label: '⚖️ Legal Rights', icon: Scale },
        { id: 'selfdefense' as Tab, label: '💪 Self Defense', icon: Shield },
        { id: 'cyber' as Tab, label: '💻 Cyber Safety', icon: BookOpen },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}><BookOpen size={26} /> Safety Resources & Helplines</h1>
                    <p className={styles.subtitle}>Knowledge is your first line of defense — national helplines, legal rights, and cyber safety</p>
                </div>

                <div className={styles.tabs}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={[styles.tab, activeTab === tab.id ? styles.tabActive : ''].join(' ')}
                            onClick={() => setActiveTab(tab.id)}
                            id={`tab-${tab.id}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'helplines' && (
                    <div>
                        <div className={styles.helplineControls}>
                            <div className={styles.searchWrap}>
                                <Search size={16} className={styles.searchIcon} />
                                <input
                                    type="search"
                                    placeholder="Search helplines..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className={styles.searchInput}
                                    id="helpline-search"
                                />
                            </div>
                            <div className={styles.filterChips}>
                                {(['all', ...Object.keys(CATEGORY_CONFIG)] as string[]).map(cat => (
                                    <button
                                        key={cat}
                                        className={[styles.chip, helplineFilter === cat ? styles.chipActive : ''].join(' ')}
                                        onClick={() => setHelplineFilter(cat)}
                                    >
                                        {cat === 'all' ? 'All' : `${CATEGORY_CONFIG[cat].emoji} ${CATEGORY_CONFIG[cat].label}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className={styles.helplineGrid}>
                            {filteredHelplines.map(h => <HelplineCard key={h.id} h={h} />)}
                        </div>
                    </div>
                )}

                {activeTab === 'legal' && (
                    <div>
                        <div className={styles.sectionIntro}>
                            <Shield size={18} className={styles.introIcon} />
                            <div>
                                <h2 className={styles.introTitle}>Know Your Rights</h2>
                                <p className={styles.introText}>
                                    Simplified explanations of laws protecting women in India. Tap any section to expand.
                                </p>
                            </div>
                        </div>
                        <LegalAccordion />
                    </div>
                )}

                {activeTab === 'selfdefense' && (
                    <div>
                        <div className={styles.sectionIntro}>
                            <Shield size={18} className={styles.introIcon} />
                            <div>
                                <h2 className={styles.introTitle}>Self-Defense Techniques</h2>
                                <p className={styles.introText}>
                                    Awareness and preparation are your strongest tools. The goal is always to create distance and reach safety.
                                </p>
                            </div>
                        </div>
                        <div className={styles.selfDefenseGrid}>
                            {SELF_DEFENSE_RESOURCES.map((sd) => (
                                <div key={sd.id} className={styles.sdCard}>
                                    <div className={styles.sdEmoji}>{sd.icon}</div>
                                    <div className={styles.sdContent}>
                                        <div className={styles.sdMeta}>
                                            <h3 className={styles.sdTitle}>{sd.title}</h3>
                                            <span className={`badge badge-${sd.difficulty === 'Beginner' ? 'safe' : 'warning'}`}>{sd.difficulty}</span>
                                            <span className={`badge badge-${sd.effectiveness === 'Maximum' || sd.effectiveness === 'Very High' ? 'primary' : 'muted'}`}>{sd.effectiveness}</span>
                                        </div>
                                        <p className={styles.sdDesc}>{sd.description}</p>
                                        <p className={styles.sdSituation}>
                                            <Shield size={12} className={styles.sdSituationIcon} />
                                            Situation: {sd.situation}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'cyber' && (
                    <div className={styles.cyberContent}>
                        <div className={styles.sectionIntro}>
                            <Shield size={18} className={styles.introIcon} />
                            <div>
                                <h2 className={styles.introTitle}>Cybercrime Reporting Guide</h2>
                                <p className={styles.introText}>Step-by-step guide to report online harassment, fraud, and abuse.</p>
                            </div>
                        </div>

                        <div className={styles.cyberSteps}>
                            {[
                                { step: '1', title: 'Preserve Evidence', desc: 'Screenshot all messages, URLs, profiles, and timestamps before reporting. Do not delete or block yet.', icon: '📸' },
                                { step: '2', title: 'Report on Cybercrime Portal', desc: 'Visit cybercrime.gov.in or call helpline 1930. Select "Report other cyber crimes" for harassment/morphing.', icon: '🌐' },
                                { step: '3', title: 'File an FIR', desc: 'Visit your local police station or cyber crime cell. You can also file online through your state police portal.', icon: '📋' },
                                { step: '4', title: 'Report to Platforms', desc: 'Report content to WhatsApp, Facebook, Instagram, or other platforms for emergency content removal.', icon: '📣' },
                                { step: '5', title: 'Seek Legal Aid', desc: 'Contact NALSA (15100) for free legal representation. Documentation of your complaint strengthens your case.', icon: '⚖️' },
                            ].map((s) => (
                                <div key={s.step} className={styles.cyberStep}>
                                    <div className={styles.cyberStepNum}>{s.step}</div>
                                    <div className={styles.cyberStepContent}>
                                        <h3 className={styles.cyberStepTitle}>{s.icon} {s.title}</h3>
                                        <p className={styles.cyberStepDesc}>{s.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.cyberLinks}>
                            <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer" className={`btn btn-outline ${styles.cyberLink}`}>
                                <ExternalLink size={14} /> cybercrime.gov.in
                            </a>
                            <a href="tel:1930" className={`btn btn-danger ${styles.cyberLink}`}>
                                <Phone size={14} /> Call 1930 (Cybercrime Helpline)
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
