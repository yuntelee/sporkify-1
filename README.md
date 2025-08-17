s# Spotify Tempo Playlist Builder

A React application that creates Spotify playlists based on tempo (BPM) ranges with optional AI-powered suggestions.

## 🎵 Features

- **Spotify Integration**: OAuth2 with PKCE (no client secret needed)
- **Tempo Filtering**: Find tracks within specific BPM ranges using Spotify's Audio Features API
- **Multiple Sources**: Search through your saved tracks and playlists
- **AI Enhancement**: Optional OpenAI integration for similar song suggestions
- **Google Search**: Optional Google Custom Search for additional track discovery
- **Playlist Creation**: Automatically create and populate new Spotify playlists

## 🚀 Quick Start

### Prerequisites

1. **Spotify Developer Account**: Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. **Node.js**: Version 16 or higher
3. **Optional APIs**:
   - OpenAI API key for AI suggestions
   - Google Custom Search API for web-based suggestions

### Installation

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Access the app**: Open http://localhost:3000 in your browser

## 🔧 API Setup Guide

### 1. Spotify API Setup

#### Step 1: Create a Spotify App
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the details:
   - **App name**: "Tempo Playlist Builder" (or any name)
   - **App description**: "Creates playlists based on tempo"
   - **Website**: `http://127.0.0.1:3000` (for development)
   - **Redirect URI**: `http://127.0.0.1:3000` (CRITICAL: Must be IP address, not localhost)
   - **API/SDKs**: Check "Web API"

#### Step 2: Configure Your App
1. After creating the app, click on it to open settings
2. Click "Edit Settings"
3. Add Redirect URIs:
   - For development: `http://127.0.0.1:3000` ⚠️ **Note: Use IP address, not localhost**
   - For production: Your actual domain (e.g., `https://yourdomain.com`)
4. Save settings
5. Copy your **Client ID** (you'll need this in the app)

#### Required Spotify Scopes
The app requests these permissions:
- `user-read-email`: Read user's email
- `playlist-read-private`: Read private playlists
- `playlist-modify-private`: Create/modify private playlists
- `playlist-modify-public`: Create/modify public playlists
- `user-library-read`: Read saved tracks

### 2. OpenAI API Setup (Optional)

#### Step 1: Get API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create account or sign in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

#### Step 2: Setup Billing
1. Go to [Billing](https://platform.openai.com/account/billing)
2. Add payment method
3. Consider setting usage limits

**Cost Estimate**: ~$0.01-0.05 per playlist generation

### 3. Google Custom Search API Setup (Optional)

#### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable "Custom Search API":
   - Go to [API Library](https://console.cloud.google.com/apis/library)
   - Search "Custom Search API"
   - Click "Enable"

#### Step 2: Get API Key
1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" → "API Key"
3. Copy the key (starts with `AIza`)
4. Restrict the key to "Custom Search API" for security

#### Step 3: Create Custom Search Engine
1. Go to [Custom Search Engine](https://cse.google.com/)
2. Click "Add" or "Create"
3. In "Sites to search", enter: `*` (to search entire web)
4. Create the search engine
5. Go to "Control Panel" → "Basics"
6. Copy the "Search engine ID" (this is your CX)

**Cost**: Free tier includes 100 searches/day, then $5 per 1000 queries

## 🎛️ How to Use

### Basic Workflow

1. **Enter API Keys**: In the Settings section, add your Spotify Client ID
2. **Login**: Click "Log in with Spotify"
3. **Select Sources**: 
   - Check "Include Saved Tracks" to search your liked songs
   - Click "Load My Playlists" and select playlists to search
4. **Set Tempo Range**: Enter min/max BPM (e.g., 120-140 for moderate tempo)
5. **Find Songs**: Click "Find Matching Songs"
6. **Optional Enhancement**: Click "Boost with LLM + Google" for AI suggestions
7. **Create Playlist**: Enter name and click "Create Playlist"

### Tempo Guidelines
- **60-90 BPM**: Slow ballads, chill music
- **90-120 BPM**: Medium tempo, pop, folk
- **120-140 BPM**: Dance, pop, rock
- **140-180 BPM**: Fast dance, electronic, punk
- **180+ BPM**: Very fast electronic, metal

## 🔒 Security & Privacy

### Data Storage
- **Tokens**: Stored in browser's localStorage
- **Settings**: Stored locally, never sent to external servers
- **No Backend**: All API calls made directly from browser

### Token Management
- Uses OAuth2 with PKCE (Proof Key for Code Exchange)
- No client secret required (more secure for client-side apps)
- Automatic token refresh
- Tokens expire after 1 hour

### Best Practices
1. **Restrict API Keys**: Limit Google API key to Custom Search only
2. **Use HTTPS**: In production, always use HTTPS
3. **Monitor Usage**: Check API usage in respective dashboards
4. **Rotate Keys**: Periodically regenerate API keys

## 🛠️ Development

### Project Structure
```
src/
├── App.jsx          # Main application component
├── main.jsx         # React entry point
└── index.css        # Tailwind CSS imports
```

### Key Functions
- **Spotify Auth**: PKCE OAuth2 flow
- **Audio Features**: Batch fetching of track tempo data
- **LLM Integration**: OpenAI chat completions for suggestions
- **Google Search**: Custom search for finding similar tracks

### Build for Production
```bash
npm run build
```

### Environment Variables
Create `.env` file (optional, settings are stored in localStorage):
```env
VITE_SPOTIFY_CLIENT_ID=your_client_id
VITE_OPENAI_API_KEY=your_openai_key
VITE_GOOGLE_API_KEY=your_google_key
VITE_GOOGLE_CX=your_search_engine_id
```

## 🐛 Troubleshooting

### Common Issues

#### "Invalid redirect URI"
- **Cause**: Redirect URI in app doesn't match Spotify app settings, or using localhost (no longer allowed)
- **Fix**: Use `http://127.0.0.1:3000` in both your Spotify app settings and access your app at this URL

#### "Invalid client"
- **Cause**: Wrong or missing Client ID
- **Fix**: Copy Client ID exactly from Spotify Dashboard

#### "Insufficient scope"
- **Cause**: App doesn't have required permissions
- **Fix**: Re-authenticate to grant all required scopes

#### "Token expired"
- **Cause**: Refresh token is invalid or expired
- **Fix**: Clear localStorage and re-authenticate

#### "Rate limited"
- **Cause**: Too many API requests
- **Fix**: App includes rate limiting, but you can add delays

### Debugging Tips
1. **Check Console**: Open browser DevTools for error messages
2. **Check Network**: Monitor API calls in Network tab
3. **Clear Storage**: Clear localStorage if having auth issues
4. **Check Status**: Use Activity Log in app for detailed status

## 📊 API Limits & Costs

### Spotify API
- **Rate Limit**: ~100 requests per minute
- **Cost**: Free
- **Limits**: Standard rate limiting applies

### OpenAI API
- **Model**: gpt-4o-mini (cost-effective)
- **Cost**: ~$0.0001 per request
- **Rate Limit**: Depends on your tier

### Google Custom Search
- **Free Tier**: 100 searches/day
- **Paid**: $5 per 1000 additional queries
- **Rate Limit**: 10 queries per second

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

MIT License - feel free to use and modify!

---

**Need Help?** Check the Activity Log in the app for detailed error messages and status updates.
