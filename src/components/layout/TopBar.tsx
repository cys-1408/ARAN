import { Link, useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';
import styles from './TopBar.module.css';

export function TopBar() {
    const location = useLocation();

    return (
        <header className={styles.topbar} role="banner">
            <div className={styles.inner}>
                <Link to="/" className={styles.brand} aria-label="ARAN Home">
                    <div className={styles.brandIcon}>
                        <Shield size={20} fill="currentColor" />
                    </div>
                    <div className={styles.brandText}>
                        <span className={styles.brandEn}>ARAN</span>
                        <span className={styles.brandTa}>அரண்</span>
                    </div>
                </Link>

                <nav className={styles.desktopNav} aria-label="Main navigation">
                    <NavLink to="/" label="Home" current={location.pathname} />
                    <NavLink to="/sos" label="SOS" current={location.pathname} highlight />
                    <NavLink to="/navigate" label="Navigate" current={location.pathname} />
                    <NavLink to="/community" label="Community" current={location.pathname} />
                    <NavLink to="/resources" label="Resources" current={location.pathname} />
                    <NavLink to="/profile" label="Profile" current={location.pathname} />
                </nav>

                <div className={styles.rightSlot}>
                    <div className={styles.statusIndicator} title="Service Active">
                        <span className="status-dot active"></span>
                        <span className={styles.statusLabel}>Secure</span>
                    </div>
                </div>
            </div>
        </header>
    );
}

function NavLink({ to, label, current, highlight }: { to: string; label: string; current: string; highlight?: boolean }) {
    const isActive = current === to || (to !== '/' && current.startsWith(to));
    return (
        <Link
            to={to}
            className={[
                styles.navLink,
                isActive ? styles.navLinkActive : '',
                highlight ? styles.navLinkHighlight : '',
            ].join(' ')}
        >
            {label}
        </Link>
    );
}
