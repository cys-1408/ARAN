import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { AppShell } from './components/layout/AppShell';
import { LandingPage } from './pages/LandingPage';
import { SOSPage } from './pages/SOSPage';
import { NavigationPage } from './pages/NavigationPage';
import { CommunityPage } from './pages/CommunityPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
    return (
        <AppProvider>
            <BrowserRouter>
                <AppShell>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/sos" element={<SOSPage />} />
                        <Route path="/navigate" element={<NavigationPage />} />
                        <Route path="/community" element={<CommunityPage />} />
                        <Route path="/resources" element={<ResourcesPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AppShell>
            </BrowserRouter>
        </AppProvider>
    );
}
