# API Setup Walkthrough

## 🎵 Spotify API - Step by Step

### 1. Create Spotify Developer Account
1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Accept the Developer Terms of Service

### 2. Create a New App
1. Click **"Create App"**
2. Fill out the form:
   ```
   App name: Tempo Playlist Builder
   App description: Creates Spotify playlists based on tempo (BPM)
   Website: http://localhost:3000
   Redirect URI: http://localhost:3000
   Which API/SDKs are you planning to use: Web API
   ```
3. Check the agreement boxes
4. Click **"Save"**

### 3. Configure App Settings
1. Click on your newly created app
2. Click **"Settings"** (top right)
3. In **"Redirect URIs"**:
   - Add: `http://localhost:3000` (for development)
   - Add: `https://yourdomain.com` (for production - replace with your actual domain)
4. Click **"Add"** then **"Save"**

### 4. Get Your Client ID
1. In your app dashboard, you'll see **"Client ID"**
2. Copy this value - you'll paste it into the app's Settings section

### 5. Test the Integration
1. Start your app: `npm run dev`
2. Paste your Client ID in the Settings section
3. Click "Log in with Spotify"
4. You should be redirected to Spotify, then back to your app

---

## 🤖 OpenAI API - Step by Step (Optional)

### 1. Create OpenAI Account
1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Verify your email if needed

### 2. Add Payment Method
1. Go to [Billing](https://platform.openai.com/account/billing)
2. Click **"Add payment method"**
3. Add a credit card (required even for small usage)
4. Consider setting a usage limit (e.g., $5/month)

### 3. Create API Key
1. Go to [API Keys](https://platform.openai.com/api-keys)
2. Click **"Create new secret key"**
3. Give it a name: "Tempo Playlist Builder"
4. Copy the key (starts with `sk-`) immediately - you can't see it again!
5. Paste it into your app's Settings section

### 4. Test the Integration
- After finding some tracks, click "Boost with LLM + Google"
- The app will use OpenAI to suggest similar songs

**Cost Estimate:** About $0.01-0.05 per playlist generation

---

## 🔍 Google Custom Search - Step by Step (Optional)

### 1. Set Up Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Create a new project:
   - Click **"Select a project"** → **"New Project"**
   - Project name: "Tempo Playlist Builder"
   - Click **"Create"**

### 2. Enable Custom Search API
1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search for "Custom Search API"
3. Click on it, then click **"Enable"**

### 3. Create API Key
1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"Create Credentials"** → **"API Key"**
3. Copy the API key (starts with `AIza`)
4. Click **"Restrict Key"** for security:
   - API restrictions: Select "Custom Search API"
   - Click **"Save"**

### 4. Create Custom Search Engine
1. Go to [Custom Search Engine](https://cse.google.com/)
2. Click **"Add"** or **"Get Started"**
3. In "Sites to search": enter `*` (asterisk - to search the entire web)
4. Click **"Create"**
5. Go to **"Control Panel"**
6. Click **"Basics"** tab
7. Copy the **"Search engine ID"** (this is your CX value)

### 5. Configure in App
1. Paste the API key in "Google API Key" field
2. Paste the Search engine ID in "Google Custom Search CX" field

**Cost:** Free for 100 searches/day, then $5 per 1000 queries

---

## 🚀 Production Deployment

### 1. Update Spotify App for Production
1. Go back to your Spotify app settings
2. Add your production URL to Redirect URIs:
   - Example: `https://myapp.vercel.app`
   - Must match exactly where your app is hosted

### 2. Environment Variables (if using)
```bash
# Create .env file (optional - settings work in app UI too)
VITE_SPOTIFY_CLIENT_ID=your_client_id
VITE_OPENAI_API_KEY=sk-your_openai_key
VITE_GOOGLE_API_KEY=AIza_your_google_key
VITE_GOOGLE_CX=your_search_engine_id
```

### 3. Build and Deploy
```bash
npm run build
# Upload dist/ folder to your hosting service
```

---

## ⚠️ Security Notes

### Do's ✅
- **Use HTTPS** in production
- **Restrict API keys** to specific APIs
- **Set spending limits** on OpenAI
- **Monitor usage** regularly
- **Rotate keys** periodically

### Don'ts ❌
- **Don't commit API keys** to version control
- **Don't share keys** publicly
- **Don't use client secret** (not needed with PKCE)
- **Don't ignore rate limits**

---

## 🐛 Common Setup Issues

### Spotify Issues
**"Invalid redirect URI"**
- Make sure the redirect URI in your app exactly matches what's in Spotify settings
- Include the protocol: `http://localhost:3000` not just `localhost:3000`

**"Invalid client_id"**
- Double-check you copied the Client ID correctly
- Make sure there are no extra spaces

### OpenAI Issues
**"Insufficient quota"**
- Add a payment method to your OpenAI account
- Even free tier requires a credit card

**"Rate limit exceeded"**
- You're making too many requests - wait a minute and try again

### Google Issues
**"API key not valid"**
- Make sure you enabled the Custom Search API
- Check that your API key is restricted to Custom Search API

**"Search engine not found"**
- Verify your Search Engine ID (CX) is correct
- Make sure your custom search engine is set to search the entire web (`*`)

---

## 📞 Getting Help

1. **Check the Activity Log** in the app for detailed error messages
2. **Open browser DevTools** (F12) and check the Console tab
3. **Verify API quotas** in respective dashboards:
   - [Spotify Dashboard](https://developer.spotify.com/dashboard)
   - [OpenAI Usage](https://platform.openai.com/usage)
   - [Google Cloud Console](https://console.cloud.google.com/)

Happy playlist building! 🎵
