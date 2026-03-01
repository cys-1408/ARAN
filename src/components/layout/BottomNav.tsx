import { NavLink } from 'react-router-dom';
import { Home, Siren, MapPin, Users, BookOpen, User } from 'lucide-react';
import styles from './BottomNav.module.css';

interface NavItem {
    to: string;
    icon: typeof Home;
    label: string;
    highlight?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/sos', icon: Siren, label: 'SOS', highlight: true },
    { to: '/navigate', icon: MapPin, label: 'Navigate' },
    { to: '/community', icon: Users, label: 'Community' },
    { to: '/resources', icon: BookOpen, label: 'Resources' },
    { to: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
    return (
        <nav className={styles.nav} aria-label="Bottom navigation">
            {NAV_ITEMS.map(({ to, icon: Icon, label, highlight }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                        [styles.item, isActive ? styles.itemActive : '', highlight ? styles.itemHighlight : ''].join(' ')
                    }
                    aria-label={label}
                >
                    <div className={styles.iconWrap}>
                        <Icon size={22} strokeWidth={1.8} />
                    </div>
                    <span className={styles.label}>{label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
