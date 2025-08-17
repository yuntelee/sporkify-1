# 🚨 SPOTIFY REDIRECT URI FIX

## The Problem
You're seeing: **"INVALID_CLIENT: Invalid redirect URI"**

This means the redirect URI in your Spotify app settings doesn't exactly match what your application is sending.

## ⚠️ IMPORTANT UPDATE (2025)
**Spotify no longer allows `localhost` in redirect URIs!** You must use `127.0.0.1` instead.

## 🔧 Quick Fix Steps

### 1. Check Your Current URL
Your app should now use: **http://127.0.0.1:3000**

### 2. Fix Your Spotify App Settings
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click on your app
3. Click **"Edit Settings"**
4. In **"Redirect URIs"** section:
   - **Add EXACTLY**: `http://127.0.0.1:3000`
   - **NOT**: `http://localhost:3000` ❌ (no longer allowed by Spotify)
   - Make sure there's no trailing slash: ❌ `http://127.0.0.1:3000/`
   - Make sure it's `http` not `https` for local development
   - Make sure the port is `3000`

### 3. Save and Test
1. Click **"Add"** then **"Save"** in Spotify settings
2. Refresh your app page
3. Try logging in again

## 🔍 Common Mistakes

❌ **Wrong**: `http://localhost:3000` (Spotify doesn't allow localhost anymore)
❌ **Wrong**: `https://127.0.0.1:3000` (https instead of http for local)
❌ **Wrong**: `http://127.0.0.1:3000/` (trailing slash)
❌ **Wrong**: `127.0.0.1:3000` (missing protocol)

✅ **Correct**: `http://127.0.0.1:3000`

## 🎯 Still Not Working?

### Check These:
1. **Use IP instead of localhost**: Always use `127.0.0.1` not `localhost`
2. **App Settings**: In your app's "Redirect URI" field, make sure it shows: `http://127.0.0.1:3000`
3. **Clear Browser Cache**: 
   - Clear your browser cache
   - Or try in an incognito/private window

4. **Wait**: Sometimes Spotify settings take a minute to update

## 📱 For Production Later
When you deploy your app, you'll need to add your production URL:
- Example: `https://yourapp.vercel.app`
- Example: `https://yourdomain.com`
- Production URLs must use HTTPS

## 🆘 Emergency Reset
If nothing works:
1. Delete your current Spotify app
2. Create a new one
3. Use exactly: `http://127.0.0.1:3000` as redirect URI
4. Copy the new Client ID to your app
