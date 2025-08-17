# 🔧 STEP-BY-STEP SPOTIFY FIX

## Current Status: INVALID_CLIENT: Invalid redirect URI

**⚠️ IMPORTANT:** Spotify changed their rules - `localhost` is no longer allowed!

Follow these steps **exactly**:

## Step 1: Check What Your App Is Using

1. Refresh your app at http://127.0.0.1:3000 (note: use IP, not localhost)
2. Look at the yellow warning box that shows your current Redirect URI
3. It should show: `http://127.0.0.1:3000`

## Step 2: Fix Your Spotify App Settings

### A. Open Spotify Developer Dashboard
1. Go to: https://developer.spotify.com/dashboard
2. Log in with your Spotify account
3. Click on your app (the one you created for this project)

### B. Edit Settings
1. Click the **"Edit Settings"** button (top right of your app page)
2. Scroll down to **"Redirect URIs"** section

### C. Add the Correct URI
1. In the text box, type EXACTLY: `http://127.0.0.1:3000`
2. Click the **"Add"** button
3. You should see it appear in the list below
4. Click **"Save"** at the bottom

### D. Verify Settings
After saving, you should see in your redirect URIs list:
```
http://127.0.0.1:3000
```

## Step 3: Update Your Browser

1. Close your current browser tab
2. Open a new tab and go to: `http://127.0.0.1:3000` (use IP, not localhost)
3. Make sure your Client ID is entered
4. Click **"Log in with Spotify"**
5. Check the Activity Log at the bottom for debug messages

## 🚨 Common Issues & Solutions

### Issue 1: "App doesn't exist"
**Solution**: Create a new Spotify app:
1. Go to Spotify Developer Dashboard
2. Click "Create App"
3. Fill in:
   - App name: "Tempo Playlist Builder"
   - Description: "Creates playlists by tempo"
   - Website: http://127.0.0.1:3000
   - Redirect URI: http://127.0.0.1:3000
   - API: Web API
4. Copy the new Client ID

### Issue 2: "Still getting invalid redirect URI"
**Solutions to try:**
1. Make sure you're using `127.0.0.1` not `localhost`
2. Wait 1-2 minutes (Spotify settings can take time to update)
3. Try incognito/private browser window
4. Clear browser cache

### Issue 3: "Different port number"
If your app runs on a different port (like 3001), update both:
1. The Spotify app settings to `http://127.0.0.1:3001`
2. Access your app at `http://127.0.0.1:3001`

## Step 4: Verify Success

When it works, you should:
1. See Spotify's login page
2. Grant permissions
3. Get redirected back to your app
4. See "Logged in to Spotify" in the Activity Log
5. See your username in the top right

## 🆘 Still Need Help?

### Check the Activity Log
The app now shows debug information:
- What redirect URI it's using
- The full authentication URL
- Any error messages

### Manual Verification
1. Copy your Client ID from Spotify dashboard
2. Paste it exactly into your app
3. Make sure Redirect URI shows: `http://127.0.0.1:3000`
4. Try logging in

### Nuclear Option
If nothing works:
1. Delete your Spotify app
2. Create a completely new one
3. Use the new Client ID
4. Set redirect URI to exactly: `http://127.0.0.1:3000`

## ✅ Success Checklist

- [ ] Spotify app created
- [ ] Client ID copied to app
- [ ] Redirect URI set to `http://127.0.0.1:3000` in Spotify (NOT localhost)
- [ ] Accessing app at `http://127.0.0.1:3000` (NOT localhost)
- [ ] Redirect URI shows `http://127.0.0.1:3000` in app
- [ ] Can click "Log in with Spotify" without errors
- [ ] Gets redirected to Spotify login
- [ ] Gets redirected back to app
- [ ] Shows "Logged in" message

Once this works, you can proceed to test the playlist features!
