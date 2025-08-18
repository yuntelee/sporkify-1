# GitHub Pages Deployment Guide

## 🚀 Your website isn't running on GitHub because it needs to be deployed! 

Here's what I've set up for you and what you need to do:

## ✅ What I've Added:

1. **GitHub Actions workflow** (`.github/workflows/deploy.yml`)
   - Automatically builds and deploys your site when you push to `main` or `kinda-done` branches
   - Sets up Node.js, installs dependencies, builds the project, and deploys to GitHub Pages

2. **Updated Vite config** (`vite.config.js`)
   - Added `base: '/sporkify-1/'` for proper GitHub Pages routing
   - Configured build output directory

3. **Updated redirect URI logic** (`src/App.jsx`)
   - Now works with both local development and GitHub Pages
   - Automatically uses the correct URL based on environment

## 🔧 Steps to Deploy:

### 1. Enable GitHub Pages in your repository settings:
   - Go to your GitHub repository: `https://github.com/yuntelee/sporkify-1`
   - Click on **Settings** tab
   - Scroll down to **Pages** section (left sidebar)
   - Under **Source**, select **GitHub Actions**

### 2. Update your Spotify app settings:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Edit your app
   - Add this redirect URI: `https://yuntelee.github.io/sporkify-1/`

### 3. Set up environment variables (optional):
   - In your GitHub repository, go to **Settings** → **Secrets and variables** → **Actions**
   - Add these secrets if you want to embed API keys (not recommended for security):
     - `VITE_SPOTIFY_CLIENT_ID`
     - `VITE_GEMINI_API_KEY`
   - **Note**: It's better to let users enter these in the UI for security

### 4. Push your changes:
```bash
git add .
git commit -m "Add GitHub Pages deployment"
git push origin kinda-done
```

### 5. Wait for deployment:
   - Check the **Actions** tab in your GitHub repo
   - The workflow will run automatically
   - Once complete, your site will be live at: `https://yuntelee.github.io/sporkify-1/`

## 🎯 Expected Result:

After following these steps, your website will be live at:
**https://yuntelee.github.io/sporkify-1/**

The deployment will happen automatically whenever you push to the `main` or `kinda-done` branches.

## 🔍 Troubleshooting:

- **Build fails**: Check the Actions tab for error logs
- **Site not loading**: Make sure GitHub Pages is enabled in repository settings
- **Spotify auth issues**: Verify the redirect URI is correctly set in Spotify dashboard
- **Environment variables**: Users will need to enter API keys in the settings UI

## 🛡️ Security Note:

API keys should NOT be embedded in the build for security reasons. Users should enter their own Spotify Client ID and Gemini API key in the app's settings interface.
