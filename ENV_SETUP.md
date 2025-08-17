# Environment Variables Setup

This file contains your API keys and configuration. Fill in your actual values:

## Required Settings

### Spotify API
1. Go to https://developer.spotify.com/dashboard
2. Create or select your app
3. Copy the Client ID and paste it as `VITE_SPOTIFY_CLIENT_ID`
4. Add `http://127.0.0.1:3000` to your Redirect URIs in Spotify app settings

### Google Gemini AI (Required for BPM Analysis)
1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key
3. Paste it as `VITE_GEMINI_API_KEY`

## Security Note
- Never commit the `.env` file with real API keys to version control
- The `.env` file is already in `.gitignore` to prevent accidental commits
