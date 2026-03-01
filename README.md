# ARAN (அரண்) - Tamil Nadu Safety Platform

A privacy-first, community-assisted safety infrastructure designed specifically for Tamil Nadu in 2026. ARAN transforms digital safety through proactive resilience technology, moving beyond reactive victim-driven solutions to intelligent, automated, context-aware protection.

## 🛡️ Core Philosophy

**"Proactive Resilience"** - Shifting the burden of safety from reactive responses to intelligent, automated safeguards that work before, during, and after potential incidents.

## 🌟 Key Features

### 🔊 Silent-Edge SOS & Multi-Modal Intelligence
- **Tamil Wake-Word Detection**: Real TensorFlow.js models for "Kapaathunga" recognition
- **International Signal for Help**: Gesture detection using MediaPipe hands
- **Edge-AI**: On-device processing for privacy and speed
- **Multi-Modal Triggers**: Voice + gesture redundancy for emergency activation

### 🗺️ Bright-Path Heuristic Navigation
- **MCDA Safety Scoring**: Multi-criteria decision analysis for route safety
- **Real OSRM Integration**: Multiple routing profiles with safety overlay
- **Community Intelligence**: Crowdsourced safety data and incident reporting
- **Tamil Nadu Facilities**: Police stations, hospitals, Amma Canteens mapping

### 🔒 Zero-Knowledge Privacy
- **Groth16 SNARK Proofs**: Cryptographic location privacy
- **Differential Privacy**: Anonymous community reporting
- **End-to-End Encryption**: Secure guardian communication
- **No Surveillance**: Location data never stored centrally

### 👥 Guardian-Verified Tier System
- **Blue-Badge Guardians**: Verified volunteers and NGO workers
- **Multi-Tier Dispatch**: Community → Guardians → Emergency services
- **Real-Time Coordination**: Live guardian matching and response

### ⌚ Advanced Wearable Integration
- **WebHID API**: Direct hardware integration
- **Heart Rate Variability**: Stress pattern recognition
- **Multi-Device Support**: Garmin, Fitbit, generic HID devices
- **Automated Triggers**: HRV-based emergency detection

### 🏘️ Community Safety Forum
- **Anonymous Reporting**: Incident and risk zone documentation
- **Safety Tips Sharing**: Community knowledge exchange
- **Verified Contributions**: Weighted by community trust scores
- **Real-Time Updates**: Live safety intelligence

## 🏗️ Technical Architecture

### Frontend
- **React 18 + TypeScript**: Modern component architecture
- **Progressive Web App**: Offline-capable, installable
- **Vite**: Fast development and optimized builds
- **CSS Modules**: Scoped styling system

### AI/ML Stack
- **TensorFlow.js**: Browser-based machine learning
- **MediaPipe**: Hand pose detection
- **TFLite**: Quantized models for Tamil phonetic analysis
- **WebAudio API**: Real-time audio processing

### Backend Services
- **Supabase**: Backend-as-a-Service with Edge Functions
- **Twilio**: SMS dispatch integration
- **OSRM**: Open source routing with safety overlays
- **WebHID**: Direct hardware device communication

### Cryptography
- **snarkjs**: Zero-knowledge proof generation
- **circomlib**: Circuit templates for location proofs
- **Web Crypto API**: Browser-native encryption
- **HKDF**: Key derivation for session security

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern browser with WebHID and WebAudio support
- Git for version control

### Installation

```bash
# Clone the repository
git clone https://github.com/cys-1408/ARAN.git
cd ARAN

# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev
```

### Environment Setup
Create `.env.local` file for API endpoints:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_COMMUNITY_HEATMAP_API=your_heatmap_api_endpoint
VITE_GOVT_SAFETY_API=your_government_api_endpoint
```

## 📱 Module Overview

### 1. Safety Landing Page
Mission-centric entry with live Tamil Nadu safety statistics and instant access to emergency tools.

### 2. Silent-Edge SOS Dashboard  
Multi-modal emergency detection with gesture recognition, Tamil wake-words, and wearable integration.

### 3. Bright-Path Navigation
Safety-first routing with community intelligence and real-time risk assessment.

### 4. Community Safety Forum
Anonymous reporting platform with differential privacy for incident documentation.

### 5. Safety Resources Hub
Comprehensive helplines, legal information, and safety awareness content.

### 6. Profile & Emergency Contacts
Privacy-first profile management with emergency contact configuration.

## 🔧 Development

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run e2e` - Run Playwright tests

### Testing
End-to-end tests cover critical safety workflows:
```bash
# Run all tests
npm run e2e

# Run specific test suites
npx playwright test sos.spec.ts
npx playwright test navigation.spec.ts  
npx playwright test dispatch-failure.spec.ts
```

## 🛠️ Backend Services

### Supabase Edge Functions
- **SOS Dispatch**: Emergency notification routing
- **Guardian Matching**: Real-time volunteer coordination
- **Community Moderation**: Content verification workflows

### Twilio Integration
- **SMS Dispatch**: Multi-contact emergency notifications  
- **Voice Calls**: Automated emergency calling
- **Message Templates**: Localized Tamil and English alerts

## 🔐 Privacy & Security

### Data Protection
- **On-Device Processing**: ML models run locally
- **Zero Server Storage**: No permanent location tracking
- **Encrypted Communication**: End-to-end guardian channels
- **Anonymous Reporting**: Differential privacy for community data

### Compliance
- **GDPR Compatible**: Right to deletion and data portability
- **Indian IT Act 2021**: Compliance with local data protection
- **Tamil Nadu Guidelines**: Adherence to state safety protocols

## 🌍 Deployment

### Production Build
```bash
npm run build
# Deploy dist/ folder to your hosting platform
```

### Supported Platforms
- **Vercel**: Optimized for React/Vite deployment
- **Netlify**: JAMstack-friendly hosting
- **Firebase Hosting**: Google Cloud integration
- **GitHub Pages**: Static site deployment

## 👥 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style
- Use TypeScript for type safety
- Follow React best practices
- Maintain CSS Modules for styling
- Include comprehensive JSDoc comments

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Tamil Nadu Government** for safety initiatives and data access
- **OpenStreetMap Community** for comprehensive mapping data
- **TensorFlow.js Team** for enabling browser-based ML
- **Supabase** for backend infrastructure support
- **OSRM Project** for open-source routing capabilities

## 🔗 Links

- **Live Demo**: [aran.app](https://aran.app) (coming soon)
- **Documentation**: [docs.aran.app](https://docs.aran.app) 
- **Community**: [community.aran.app](https://community.aran.app)
- **Bug Reports**: [GitHub Issues](https://github.com/cys-1408/ARAN/issues)

## 📊 Project Status

✅ **Complete Core Implementation** - All 6 modules fully functional  
✅ **Expert-Level Features** - Production-ready algorithms  
✅ **Advanced Privacy** - Zero-knowledge cryptographic proofs  
✅ **Tamil Localization** - Native language support  
🚀 **Ready for Production** - Comprehensive testing and deployment ready

---

**ARAN (அரண்)** - *"Technology should not just connect people — it should protect them."*

Built with ❤️ for Tamil Nadu's safety and empowerment.