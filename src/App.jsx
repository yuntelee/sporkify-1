import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

// =============================================================
// Spotify Tempo Playlist Builder — Single-file React App
// Features
// 1) Spotify login (Authorization Code + PKCE; no client secret needed)
// 2) Pick source (Saved Tracks and/or selected Playlists)
// 3) Select tempo (BPM) range
// 4) Filter tracks by tempo via Google Gemini AI with search grounding
// 5) Create a new playlist with matching tracks
// =============================================================

// -------------------- Utility: Tiny helpers --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const uniq = (arr) => Array.from(new Set(arr));

// -------------------- Google Gemini BPM Utility with Three-Tier Grounding --------------------
async function getTrackBPMWithGemini(title, artist, geminiApiKey, addGeminiLog = null) {
  if (!geminiApiKey) {
    throw new Error("Gemini API key is required");
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  
  // Define the Google Search grounding tool
  const groundingTool = { googleSearch: {} };
  
  const basePrompt = `Search Tunebat and SongBPM to find BPM (beats per minute) for the song "${title}" by ${artist}. 
                     RETURN ONLY NUMERICAL BPM VALUE (e.g., "128" or "120.5") with source citations.`;

  // Helper function to extract BPM and grounding data from response
  const extractBPMData = (result, modelName, tier) => {
    if (!result || !result.response) {
      throw new Error(`No response from ${modelName}`);
    }
    
    // Get the response text with fallback
    let bpmText = "";
    try {
      bpmText = result.response.text()?.trim() || "";
    } catch (textError) {
      console.warn(`Failed to get text from ${modelName} response:`, textError);
      bpmText = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    }
    
    if (!bpmText) {
      console.warn(`Empty response from ${modelName} for "${title}" by ${artist}`);
      throw new Error(`Empty response from ${modelName} - possible content filtering`);
    }
    
    // Extract grounding metadata for source verification
    const groundingMetadata = result.response.candidates?.[0]?.groundingMetadata;
    const searchQueries = groundingMetadata?.groundingSupports?.map(
      support => support.segment?.text
    ) || [];
    const sources = groundingMetadata?.groundingSupports?.flatMap(
      support => support.groundingChunkIndices?.map(
        index => groundingMetadata.groundingChunks?.[index]?.web?.uri
      ) || []
    ) || [];
    
    // Enhanced number extraction - handle various formats
    let bpm = null;
    const decimalMatch = bpmText.match(/(\d+\.?\d*)/);
    if (decimalMatch) {
      bpm = parseFloat(decimalMatch[1]);
    }
    
    // If still null, try to parse the whole response
    if (bpm === null || isNaN(bpm)) {
      bpm = parseFloat(bpmText);
    }

    console.log(`🤖 ${tier} (${modelName}) Response for "${title}" by ${artist}:`);
    console.log(`   Raw response: "${bpmText}"`);
    console.log(`   Parsed BPM: ${bpm}`);
    console.log(`   Valid? ${!isNaN(bpm) && bpm > 0 && bpm < 300}`);
    console.log(`   Search queries used:`, searchQueries);
    console.log(`   Sources found:`, sources);

    return { bpmText, bpm, sources, searchQueries };
  };

  // Tier 1: Primary - Gemini 2.5 Flash Lite with grounding
  try {
    console.log(`🥇 Trying PRIMARY (gemini-2.5-flash-lite) for "${title}" by ${artist}`);
    
    const primaryModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100,
      },
      tools: [groundingTool],
    });

    const primaryResult = await primaryModel.generateContent(basePrompt);
    const { bpmText, bpm, sources, searchQueries } = extractBPMData(primaryResult, "gemini-2.5-flash-lite", "PRIMARY");

    // Add to UI log
    if (addGeminiLog) {
      addGeminiLog({
        timestamp: new Date().toLocaleTimeString(),
        song: `"${title}" by ${artist}`,
        rawResponse: bpmText,
        parsedBPM: bpm,
        valid: !isNaN(bpm) && bpm > 0 && bpm < 300,
        sources: sources.slice(0, 3),
        searchQueries: searchQueries.slice(0, 2),
        grounded: sources.length > 0,
        tier: "PRIMARY",
        model: "gemini-2.5-flash-lite"
      });
    }

    if (!isNaN(bpm) && bpm > 0 && bpm < 300) {
      console.log(`✅ PRIMARY successful: ${bpm} BPM`);
      return bpm;
    }
    console.log(`❌ PRIMARY failed - invalid BPM: "${bpmText}"`);
  } catch (primaryErr) {
    console.error(`🚨 PRIMARY failed for "${title}":`, primaryErr);
  }

  // Tier 2: Secondary - Gemini 2.0 Flash with grounding
  try {
    console.log(`🥈 Trying SECONDARY (gemini-2.0-flash) for "${title}" by ${artist}`);
    
    const secondaryModel = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 90,
      },
      tools: [groundingTool],
    });

    const secondaryResult = await secondaryModel.generateContent(basePrompt);
    const { bpmText, bpm, sources, searchQueries } = extractBPMData(secondaryResult, "gemini-2.0-flash", "SECONDARY");

    // Add to UI log
    if (addGeminiLog) {
      addGeminiLog({
        timestamp: new Date().toLocaleTimeString(),
        song: `"${title}" by ${artist}`,
        rawResponse: `SECONDARY: ${bpmText}`,
        parsedBPM: bpm,
        valid: !isNaN(bpm) && bpm > 0 && bpm < 300,
        sources: sources.slice(0, 3),
        searchQueries: searchQueries.slice(0, 2),
        grounded: sources.length > 0,
        tier: "SECONDARY",
        model: "gemini-2.0-flash",
        fallback: true
      });
    }

    if (!isNaN(bpm) && bpm > 0 && bpm < 300) {
      console.log(`✅ SECONDARY successful: ${bpm} BPM`);
      return bpm;
    }
    console.log(`❌ SECONDARY failed - invalid BPM: "${bpmText}"`);
  } catch (secondaryErr) {
    console.error(`🚨 SECONDARY failed for "${title}":`, secondaryErr);
  }

  // Tier 3: Tertiary - Gemini 2.5 Flash with grounding
  try {
    console.log(`🥉 Trying TERTIARY (gemini-2.5-flash) for "${title}" by ${artist}`);
    
    const tertiaryModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 80,
      },
      tools: [groundingTool],
    });

    const tertiaryResult = await tertiaryModel.generateContent(basePrompt);
    const { bpmText, bpm, sources, searchQueries } = extractBPMData(tertiaryResult, "gemini-2.5-flash", "TERTIARY");

    // Add to UI log
    if (addGeminiLog) {
      addGeminiLog({
        timestamp: new Date().toLocaleTimeString(),
        song: `"${title}" by ${artist}`,
        rawResponse: `TERTIARY: ${bpmText}`,
        parsedBPM: bpm,
        valid: !isNaN(bpm) && bpm > 0 && bpm < 300,
        sources: sources.slice(0, 3),
        searchQueries: searchQueries.slice(0, 2),
        grounded: sources.length > 0,
        tier: "TERTIARY",
        model: "gemini-2.5-flash",
        fallback: true
      });
    }

    if (!isNaN(bpm) && bpm > 0 && bpm < 300) {
      console.log(`✅ TERTIARY successful: ${bpm} BPM`);
      return bpm;
    }
    console.log(`❌ TERTIARY failed - invalid BPM: "${bpmText}"`);
  } catch (tertiaryErr) {
    console.error(`🚨 TERTIARY failed for "${title}":`, tertiaryErr);
  }

  // All tiers failed - add error log and return null
  console.error(`❌ ALL TIERS FAILED for "${title}" by ${artist}`);
  
  if (addGeminiLog) {
    addGeminiLog({
      timestamp: new Date().toLocaleTimeString(),
      song: `"${title}" by ${artist}`,
      rawResponse: "ERROR: All three tiers failed",
      parsedBPM: null,
      valid: false,
      error: true,
      tier: "ALL FAILED"
    });
  }
  
  return null;
}

async function fetchTemposForTracksWithGemini(tracks, geminiApiKey, addGeminiLog = null) {
  if (!tracks || tracks.length === 0) return {};
  
  const tempos = {};
  const batchSize = 5; // Process in smaller batches to avoid rate limits
  
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize);
    
    console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tracks.length/batchSize)}:`);
    batch.forEach((track, idx) => {
      console.log(`   ${i + idx + 1}. "${track.name}" by ${track.artists?.[0]?.name || track.artists?.[0] || 'Unknown Artist'}`);
    });
    
    const batchPromises = batch.map(async (track) => {
      const title = track.name;
      const artist = track.artists?.[0]?.name || track.artists?.[0] || 'Unknown Artist';
      
      try {
        const bpm = await getTrackBPMWithGemini(title, artist, geminiApiKey, addGeminiLog);
        if (bpm !== null) {
          tempos[track.id] = bpm;
        }
        return { trackId: track.id, bpm, title, artist };
      } catch (error) {
        console.error(`❌ Error getting BPM for ${title} by ${artist}:`, error);
        return { trackId: track.id, bpm: null, title, artist };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Log batch summary
    const successCount = batchResults.filter(r => r.bpm !== null).length;
    console.log(`\n✅ Batch ${Math.floor(i/batchSize) + 1} completed: ${successCount}/${batch.length} successful`);
    batchResults.forEach((result, idx) => {
      if (result.bpm !== null) {
        console.log(`   ✓ ${result.title}: ${result.bpm} BPM`);
      } else {
        console.log(`   ✗ ${result.title}: Failed to get BPM`);
      }
    });
    
    // Rate limiting: wait between batches
    if (i + batchSize < tracks.length) {
      console.log(`⏳ Waiting 1 second before next batch...`);
      await sleep(1000); // 1 second between batches
    }
    
    console.log(`📊 Progress: ${Math.min(i + batchSize, tracks.length)}/${tracks.length} tracks processed`);
  }
  
  return tempos;
}

// Helper function to filter tracks by BPM range
function filterTracksByTempo(tracks, tempos, minBpm, maxBpm) {
  return tracks.filter(track => {
    const tempo = tempos[track.id];
    return tempo && tempo >= minBpm && tempo <= maxBpm;
  }).map(track => ({
    ...track,
    tempo: tempos[track.id]
  }));
}

// React hook for fetching track BPMs with Gemini
function useTrackTempos(tracks, geminiApiKey) {
  const [tempos, setTempos] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function retrieveBpm() {
      if (!tracks?.length || !geminiApiKey) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const tempoData = await fetchTemposForTracksWithGemini(tracks, geminiApiKey);
        setTempos(tempoData);
        console.log('Track BPMs from Gemini:', tempoData);
      } catch (err) {
        console.error('Error fetching BPMs with Gemini:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    retrieveBpm();
  }, [tracks, geminiApiKey]);

  return { tempos, loading, error };
}

const SCOPE = [
  "user-read-email",
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
].join(" ");

// Spotify requires 127.0.0.1 instead of localhost
const DEFAULT_REDIRECT = typeof window !== "undefined" ? 
  window.location.origin.replace('localhost', '127.0.0.1') : "";

// -------------------- PKCE helpers --------------------
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function base64urlencode(a) {
  let str = "";
  const len = a.byteLength;
  for (let i = 0; i < len; i++) str += String.fromCharCode(a[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(verifier) {
  const hash = await sha256(verifier);
  return base64urlencode(hash);
}

function randString(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let out = "";
  for (let i = 0; i < length; i++) out += possible.charAt(Math.floor(Math.random() * possible.length));
  return out;
}

// -------------------- Main Component --------------------
export default function App() {
  // Initialize with environment variables, fallback to localStorage, then empty string
  const [clientId, setClientId] = useState(
    import.meta.env.VITE_SPOTIFY_CLIENT_ID || 
    localStorage.getItem("spotify_client_id") || 
    ""
  );
  const [redirectUri, setRedirectUri] = useState(
    import.meta.env.VITE_SPOTIFY_REDIRECT_URI || 
    localStorage.getItem("spotify_redirect_uri") || 
    DEFAULT_REDIRECT
  );
  const [geminiApiKey, setGeminiApiKey] = useState(
    import.meta.env.VITE_GEMINI_API_KEY || 
    localStorage.getItem("gemini_api_key") || 
    ""
  );

  const [accessToken, setAccessToken] = useState(localStorage.getItem("spotify_access_token") || "");
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("spotify_refresh_token") || "");
  const [tokenExpiry, setTokenExpiry] = useState(parseInt(localStorage.getItem("spotify_token_expiry") || "0", 10));

  const [me, setMe] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);
  const [includeSaved, setIncludeSaved] = useState(true);

  const [minTempo, setMinTempo] = useState(100);
  const [maxTempo, setMaxTempo] = useState(130);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);

  const [candidates, setCandidates] = useState([]); // {id, uri, name, artists:[], tempo}
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState("");

  // Debug data for showing pulled songs and analysis
  const [allPulledTracks, setAllPulledTracks] = useState([]); // All tracks before tempo analysis
  const [allAnalyzedTracks, setAllAnalyzedTracks] = useState([]); // All tracks with tempo data
  const [geminiLogs, setGeminiLogs] = useState([]); // Live Gemini API responses

  const addLog = (msg) => setLog((l) => [msg, ...l]);
  const addGeminiLog = (logEntry) => setGeminiLogs((logs) => [logEntry, ...logs.slice(0, 49)]); // Keep last 50 entries

  // Persist settings
  useEffect(() => {
    localStorage.setItem("spotify_client_id", clientId);
    localStorage.setItem("spotify_redirect_uri", redirectUri);
    localStorage.setItem("gemini_api_key", geminiApiKey);
  }, [clientId, redirectUri, geminiApiKey]);

  // Token refresh if near expiry
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    if (accessToken && refreshToken && tokenExpiry && tokenExpiry - now < 60) {
      refreshSpotifyToken().catch(() => {/* noop */});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, refreshToken, tokenExpiry]);

  // Handle auth return with ?code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const storedState = sessionStorage.getItem("spotify_auth_state") || "";
    if (code && state && state === storedState) {
      exchangeCodeForToken(code).catch((e) => addLog("Auth error: " + (e?.message || e)));
      // Clean URL
      const clean = new URL(window.location.href);
      clean.search = "";
      window.history.replaceState({}, document.title, clean.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-load user profile when we have a token
  useEffect(() => {
    if (accessToken && !me) {
      loadMe().catch(() => {/* Error handled in loadMe */});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me]);

  // -------------------- Spotify Auth --------------------
  async function startSpotifyAuth() {
    if (!clientId) {
      alert("Please enter your Spotify Client ID in Settings.");
      return;
    }
    
    // Debug: Show what redirect URI we're using
    addLog(`Using redirect URI: ${redirectUri}`);
    addLog(`Client ID: ${clientId.substring(0, 8)}...`);
    
    const verifier = randString(64);
    const challenge = await createCodeChallenge(verifier);
    const state = randString(16);

    sessionStorage.setItem("spotify_code_verifier", verifier);
    sessionStorage.setItem("spotify_auth_state", state);

    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", challenge);

    addLog(`Full auth URL: ${url.toString()}`);
    window.location.href = url.toString();
  }

  async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem("spotify_code_verifier") || "";
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("Token exchange failed");
    const data = await res.json();

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (data.expires_in || 3600) - 30;

    setAccessToken(data.access_token);
    setRefreshToken(data.refresh_token || refreshToken);
    setTokenExpiry(expiresAt);

    localStorage.setItem("spotify_access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("spotify_refresh_token", data.refresh_token);
    localStorage.setItem("spotify_token_expiry", String(expiresAt));

    addLog("Logged in to Spotify.");
    await loadMe();
  }

  async function refreshSpotifyToken() {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("Refresh failed");
    const data = await res.json();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (data.expires_in || 3600) - 30;

    setAccessToken(data.access_token);
    setTokenExpiry(expiresAt);
    localStorage.setItem("spotify_access_token", data.access_token);
    localStorage.setItem("spotify_token_expiry", String(expiresAt));
    addLog("Refreshed Spotify token.");
  }

  // -------------------- Spotify API helpers --------------------
  async function spGet(path, params = {}) {
    const url = new URL(`https://api.spotify.com/v1/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    
    try {
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      
      if (res.status === 401) {
        addLog("🔑 Token expired, refreshing...");
        await refreshSpotifyToken();
        return spGet(path, params);
      }
      
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || '1';
        addLog(`⏱️ Rate limited, waiting ${retryAfter} seconds...`);
        await sleep(parseInt(retryAfter) * 1000);
        return spGet(path, params);
      }
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`GET ${path} failed (${res.status}): ${errorText}`);
      }
      
      return res.json();
    } catch (error) {
      addLog(`🚨 API Error on ${path}: ${error.message}`);
      throw error;
    }
  }

  async function spPost(path, body) {
    const res = await fetch(`https://api.spotify.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      await refreshSpotifyToken();
      return spPost(path, body);
    }
    if (!res.ok) throw new Error(`POST ${path} failed`);
    return res.json();
  }

  async function loadMe() {
    if (!accessToken) return;
    try {
      const data = await spGet("me");
      setMe(data);
      addLog("✅ User profile loaded successfully");
    } catch (error) {
      console.error("Failed to load user profile:", error);
      addLog(`❌ Failed to load user profile: ${error.message}`);
      
      // If it's a 401 error, the token is invalid
      if (error.message.includes('401')) {
        addLog("🔑 Token appears invalid, please log in again");
        setAccessToken("");
        setRefreshToken("");
        setTokenExpiry(0);
        localStorage.removeItem("spotify_access_token");
        localStorage.removeItem("spotify_refresh_token");
        localStorage.removeItem("spotify_token_expiry");
      }
    }
  }

  async function loadPlaylists() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const out = [];
      let url = "me/playlists";
      let next = true;
      while (next) {
        const page = await spGet(url, { limit: 50, offset: out.length });
        out.push(...page.items);
        next = page.items.length === 50;
      }
      setPlaylists(out);
      addLog(`Loaded ${out.length} playlists.`);
    } catch (e) {
      addLog("Failed to load playlists.");
    } finally {
      setLoading(false);
    }
  }

  async function getAllTracksFromPlaylists(ids) {
    const trackItems = [];
    for (const pid of ids) {
      let offset = 0;
      let more = true;
      while (more) {
        const page = await spGet(`playlists/${pid}/tracks`, { limit: 100, offset });
        trackItems.push(
          ...page.items
            .filter((it) => it && it.track && it.track.id && !it.is_local)
            .map((it) => it.track)
        );
        more = page.items.length === 100;
        offset += 100;
        await sleep(50);
      }
    }
    return trackItems;
  }

  async function getAllSavedTracks() {
    const items = [];
    let offset = 0;
    let more = true;
    while (more) {
      const page = await spGet("me/tracks", { limit: 50, offset });
      items.push(...page.items.map((it) => it.track).filter((t) => t && t.id && !t.is_local));
      more = page.items.length === 50;
      offset += 50;
      await sleep(50);
    }
    return items;
  }

  async function loadCandidates() {
    if (!accessToken) return;
    if (!geminiApiKey) {
      alert("Please enter your Google Gemini API key in Settings first.");
      return;
    }
    
    setLoading(true);
    setCandidates([]);
    setCreatedPlaylistUrl("");
    setAllPulledTracks([]);
    setAllAnalyzedTracks([]);
    setGeminiLogs([]); // Clear previous Gemini logs

    try {
      const sources = [];
      if (includeSaved) {
        addLog("Loading saved tracks…");
        const saved = await getAllSavedTracks();
        sources.push(...saved);
        addLog(`Saved tracks: ${saved.length}`);
      }
      const sel = playlists.filter((p) => selectedPlaylistIds.includes(p.id));
      if (sel.length > 0) {
        addLog(`Loading tracks from ${sel.length} playlists…`);
        const tracks = await getAllTracksFromPlaylists(sel.map((p) => p.id));
        sources.push(...tracks);
        addLog(`Playlist tracks loaded: ${tracks.length}`);
      }

      // Dedupe by track id
      const uniqueTracks = Object.values(
        sources.reduce((acc, t) => {
          acc[t.id] = t;
          return acc;
        }, {})
      );
      addLog(`Unique tracks to analyze: ${uniqueTracks.length}`);
      
      // Store all pulled tracks for display
      setAllPulledTracks(uniqueTracks.map(t => ({
        id: t.id,
        name: t.name,
        artists: (t.artists || []).map((a) => a.name),
        album: t.album?.name || 'Unknown Album'
      })));

      // Fetch tempo data using Gemini AI
      addLog(`🤖 Analyzing tempo with Google Gemini for ${uniqueTracks.length} tracks...`);
      addLog(`⏳ This may take a few minutes for large collections...`);
      
      const tempos = await fetchTemposForTracksWithGemini(uniqueTracks, geminiApiKey, addGeminiLog);
      
      addLog(`✅ Retrieved tempo data for ${Object.keys(tempos).length} tracks via Gemini AI`);

      // Create tracks with tempo data
      const withTempo = uniqueTracks
        .filter(t => tempos[t.id]) // Only include tracks with tempo data
        .map(t => ({
          id: t.id,
          uri: t.uri,
          name: t.name,
          artists: (t.artists || []).map((a) => a.name),
          tempo: tempos[t.id],
        }));

      // Filter by BPM range and sort
      const filtered = filterTracksByTempo(withTempo, tempos, minTempo, maxTempo)
        .sort((a, b) => a.tempo - b.tempo);
      setCandidates(filtered);
      
      // Store all analyzed tracks for display
      setAllAnalyzedTracks(withTempo.sort((a, b) => a.tempo - b.tempo));
      
      addLog(`✅ Successfully matched ${filtered.length} tracks in ${minTempo}-${maxTempo} BPM range.`);
      if (withTempo.length > 0) {
        addLog(`📊 Total tracks analyzed: ${withTempo.length}, Tempo range found: ${Math.min(...withTempo.map(t => t.tempo)).toFixed(1)}-${Math.max(...withTempo.map(t => t.tempo)).toFixed(1)} BPM`);
      }
    } catch (e) {
      console.error("Error in loadCandidates:", e);
      addLog(`❌ Error loading candidates: ${e.message}`);
      addLog(`🔍 Error details: ${e.stack || 'No stack trace available'}`);
      
      // Check if it's a token issue
      if (e.message.includes('401') || e.message.includes('Unauthorized')) {
        addLog("🔑 This looks like an authentication issue. Try refreshing your login.");
      }
      
      // Check if it's a Gemini API issue
      if (e.message.includes('Gemini') || e.message.includes('API key')) {
        addLog("🤖 This looks like a Gemini API issue. Check your API key and quota.");
      }
    } finally {
      setLoading(false);
    }
  }

  // -------------------- Create Playlist --------------------
  async function createPlaylist() {
    if (!me) {
      alert("Not logged in.");
      return;
    }
    const items = [...candidates];
    if (items.length === 0) {
      alert("No tracks to add.");
      return;
    }
    const name = newPlaylistName || `Tempo ${minTempo}-${maxTempo} BPM`;
    setLoading(true);
    try {
      const pl = await spPost(`users/${me.id}/playlists`, {
        name,
        description: `Auto-built by Tempo Builder — ${minTempo}-${maxTempo} BPM`,
        public: false,
      });
      const uris = items.map((x) => x.uri);
      for (const c of chunk(uris, 100)) {
        await spPost(`playlists/${pl.id}/tracks`, { uris: c });
        await sleep(50);
      }
      setCreatedPlaylistUrl(pl.external_urls?.spotify || "");
      addLog(`Created playlist with ${items.length} tracks.`);
    } catch (e) {
      console.error(e);
      addLog("Failed to create playlist.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------- UI --------------------
  const isAuthed = !!accessToken;
  const totalFound = candidates.length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tempo Playlist Builder</h1>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">{me ? `Logged in as ${me.display_name || me.id}` : "Authenticated"}</span>
                <button 
                  onClick={() => {
                    localStorage.removeItem("spotify_access_token");
                    localStorage.removeItem("spotify_refresh_token");
                    localStorage.removeItem("spotify_token_expiry");
                    setAccessToken("");
                    setRefreshToken("");
                    setTokenExpiry(0);
                    setMe(null);
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button onClick={startSpotifyAuth} className="px-4 py-2 rounded-2xl bg-green-500 text-black font-medium shadow">Log in with Spotify</button>
            )}
          </div>
        </header>

        {/* Debug Authentication Status */}
        <section className="bg-neutral-800/50 rounded-lg p-3 mb-4 text-xs font-mono">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <div>
              <span className="text-neutral-400">Access Token:</span><br/>
              <span className={accessToken ? "text-green-400" : "text-red-400"}>
                {accessToken ? `${accessToken.substring(0, 20)}...` : "None"}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">Refresh Token:</span><br/>
              <span className={refreshToken ? "text-green-400" : "text-red-400"}>
                {refreshToken ? `${refreshToken.substring(0, 20)}...` : "None"}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">Expires:</span><br/>
              <span className={tokenExpiry > Math.floor(Date.now() / 1000) ? "text-green-400" : "text-red-400"}>
                {tokenExpiry ? new Date(tokenExpiry * 1000).toLocaleTimeString() : "Never"}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">User:</span><br/>
              <span className={me ? "text-green-400" : "text-red-400"}>
                {me ? me.display_name || me.id : "Not loaded"}
              </span>
            </div>
          </div>
          {accessToken && !me && (
            <div className="flex gap-2">
              <button 
                onClick={loadMe}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded"
                disabled={loading}
              >
                🔄 Retry Load Profile
              </button>
              <button 
                onClick={() => {
                  localStorage.clear();
                  location.reload();
                }}
                className="px-3 py-1 text-xs bg-yellow-600 text-white rounded"
              >
                🗑️ Clear All & Restart
              </button>
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 bg-neutral-900/50 rounded-2xl p-4 mb-6">
          <div className="col-span-1 md:col-span-3 mb-4">
            <h2 className="text-lg font-semibold mb-2">🔧 API Configuration</h2>
            <div className="text-sm text-yellow-400 bg-yellow-400/10 rounded-lg p-3 mb-3">
              <strong>📍 Current Redirect URI:</strong> <code>{redirectUri}</code><br/>
              <strong>⚠️ This MUST exactly match your Spotify app settings!</strong><br/>
              <strong>🤖 BPM Analysis:</strong> Now powered by Google Gemini AI with real-time web search grounding for verified tempo data!
            </div>
            {(import.meta.env.VITE_SPOTIFY_CLIENT_ID || import.meta.env.VITE_GEMINI_API_KEY) && (
              <div className="text-sm text-green-400 bg-green-400/10 rounded-lg p-3">
                <strong>✅ Environment Variables Loaded:</strong><br/>
                {import.meta.env.VITE_SPOTIFY_CLIENT_ID && <span>• Spotify Client ID from .env<br/></span>}
                {import.meta.env.VITE_SPOTIFY_REDIRECT_URI && <span>• Redirect URI from .env<br/></span>}
                {import.meta.env.VITE_GEMINI_API_KEY && <span>• Gemini API Key from .env<br/></span>}
                <span className="text-xs opacity-75 mt-1 block">You can still override these values in the fields below.</span>
              </div>
            )}
          </div>
          <div className="col-span-1 md:col-span-1">
            <label className="block text-sm mb-1">
              Spotify Client ID
              {import.meta.env.VITE_SPOTIFY_CLIENT_ID && <span className="text-green-400 ml-1">(.env)</span>}
            </label>
            <input 
              value={clientId} 
              onChange={(e) => setClientId(e.target.value)} 
              className="w-full px-3 py-2 rounded-xl bg-neutral-800 outline-none" 
              placeholder={import.meta.env.VITE_SPOTIFY_CLIENT_ID ? "Loaded from .env" : "Your Spotify Client ID"} 
            />
          </div>
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm mb-1">
              Redirect URI (must be whitelisted in your Spotify App)
              {import.meta.env.VITE_SPOTIFY_REDIRECT_URI && <span className="text-green-400 ml-1">(.env)</span>}
            </label>
            <input 
              value={redirectUri} 
              onChange={(e) => setRedirectUri(e.target.value)} 
              className="w-full px-3 py-2 rounded-xl bg-neutral-800 outline-none" 
              placeholder={import.meta.env.VITE_SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT} 
            />
          </div>
          <div className="col-span-1 md:col-span-3">
            <label className="block text-sm mb-1">
              Google Gemini API Key (required for BPM analysis)
              {import.meta.env.VITE_GEMINI_API_KEY && <span className="text-green-400 ml-1">(.env)</span>}
            </label>
            <input 
              value={geminiApiKey} 
              onChange={(e) => setGeminiApiKey(e.target.value)} 
              className="w-full px-3 py-2 rounded-xl bg-neutral-800 outline-none" 
              placeholder={import.meta.env.VITE_GEMINI_API_KEY ? "Loaded from .env" : "AIza..."} 
            />
          </div>
        </section>

        {/* Source Selection */}
        <section className="bg-neutral-900/50 rounded-2xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">Sources</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeSaved} onChange={(e) => setIncludeSaved(e.target.checked)} /> Include Saved Tracks
              </label>
              <button onClick={loadPlaylists} disabled={!isAuthed || loading} className="px-3 py-2 rounded-xl bg-neutral-800 disabled:opacity-50">Load My Playlists</button>
            </div>
          </div>

          {playlists.length > 0 ? (
            <div className="max-h-64 overflow-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {playlists.map((p) => (
                <label key={p.id} className="flex items-center gap-2 bg-neutral-800/70 rounded-xl px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedPlaylistIds.includes(p.id)}
                    onChange={(e) => {
                      setSelectedPlaylistIds((cur) =>
                        e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)
                      );
                    }}
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm opacity-75">(No playlists loaded yet)</p>
          )}
        </section>

        {/* Tempo Controls */}
        <section className="bg-neutral-900/50 rounded-2xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Tempo Range (BPM)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm mb-1">Min</label>
              <input type="number" value={minTempo} onChange={(e) => setMinTempo(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl bg-neutral-800 outline-none" />
            </div>
            <div>
              <label className="block text-sm mb-1">Max</label>
              <input type="number" value={maxTempo} onChange={(e) => setMaxTempo(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl bg-neutral-800 outline-none" />
            </div>
            <div className="flex items-end">
              <button onClick={loadCandidates} disabled={!isAuthed || loading} className="w-full px-4 py-3 rounded-xl bg-green-500 text-black font-semibold disabled:opacity-50">Find Matching Songs</button>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="bg-neutral-900/50 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Tempo-Matched Results</h2>
            <span className="text-sm opacity-80">{totalFound} tracks</span>
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm opacity-75">(No results yet)</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {candidates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 bg-neutral-800/60 rounded-xl px-3 py-2">
                  <div className="truncate">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="truncate text-xs opacity-75">{t.artists.join(", ")}</div>
                  </div>
                  <div className="text-xs tabular-nums opacity-90 font-mono">{t.tempo.toFixed(1)} BPM</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-neutral-800 outline-none" placeholder={`Playlist name (default: Tempo ${minTempo}-${maxTempo} BPM)`} />
            <button onClick={createPlaylist} disabled={loading || (!isAuthed)} className="px-4 py-2 rounded-xl bg-green-500 text-black font-semibold disabled:opacity-50">Create Playlist</button>
          </div>
          {createdPlaylistUrl ? (
            <div className="mt-3 text-sm">
              Done! <a href={createdPlaylistUrl} target="_blank" rel="noreferrer" className="underline">Open your new playlist</a>
            </div>
          ) : null}
        </section>

        {/* Gemini Live Log with Grounding */}
        {geminiLogs.length > 0 && (
          <section className="bg-neutral-900/50 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">🔍 Gemini AI Live Responses with Search Grounding ({geminiLogs.length})</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-60">Real-time BPM analysis with sources</span>
                <button 
                  onClick={() => setGeminiLogs([])} 
                  className="text-xs px-2 py-1 bg-neutral-700 rounded opacity-60 hover:opacity-100"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-96 overflow-auto text-sm font-mono">
              {geminiLogs.map((log, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 ${
                  log.error 
                    ? 'bg-red-900/30 border border-red-500/30' 
                    : log.valid 
                      ? log.tier === "PRIMARY"
                        ? 'bg-blue-900/30 border border-blue-500/30' // Blue for primary
                        : log.tier === "SECONDARY"
                          ? 'bg-orange-900/30 border border-orange-500/30' // Orange for secondary
                          : log.tier === "TERTIARY"
                            ? 'bg-purple-900/30 border border-purple-500/30' // Purple for tertiary
                            : 'bg-green-900/30 border border-green-500/30' // Green for any other valid
                      : 'bg-yellow-900/30 border border-yellow-500/30' // Yellow for invalid
                }`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="truncate flex-1">
                      <span className="font-medium">{log.song}</span>
                      {log.grounded && <span className="ml-2 text-blue-400 text-xs">🔗 SOURCED</span>}
                      {log.tier && <span className="ml-2 text-purple-300 text-xs">{log.tier}</span>}
                      {log.model && <span className="ml-1 text-gray-400 text-xs">({log.model})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-60">{log.timestamp}</span>
                      {log.valid && (
                        <span className={`font-bold ${
                          log.tier === "PRIMARY" ? 'text-blue-400' : 
                          log.tier === "SECONDARY" ? 'text-orange-400' : 
                          log.tier === "TERTIARY" ? 'text-purple-400' : 
                          'text-green-400'
                        }`}>
                          {log.parsedBPM} BPM
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs opacity-75 space-y-1">
                    <div>
                      <span className="text-blue-300">Raw response:</span> "{log.rawResponse}"
                      {!log.error && !log.valid && (
                        <span className="text-yellow-400 ml-2">⚠️ Invalid BPM format</span>
                      )}
                      {log.error && (
                        <span className="text-red-400 ml-2">❌ API Error</span>
                      )}
                    </div>
                    {log.searchQueries && log.searchQueries.length > 0 && (
                      <div>
                        <span className="text-purple-300">Search queries:</span> {log.searchQueries.join(', ')}
                      </div>
                    )}
                    {log.sources && log.sources.length > 0 && (
                      <div>
                        <span className="text-cyan-300">Sources:</span> 
                        {log.sources.map((source, idx) => (
                          <span key={idx} className="ml-1">
                            <a href={source} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">
                              [{idx + 1}]
                            </a>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs opacity-60">
              <span className="text-blue-400">Blue = Primary (gemini-2.5-flash-lite)</span> • 
              <span className="text-orange-400 ml-2">Orange = Secondary (gemini-2.0-flash)</span> • 
              <span className="text-purple-400 ml-2">Purple = Tertiary (gemini-2.5-flash)</span> • 
              <span className="text-green-400 ml-2">Green = Valid BPM</span> • 
              <span className="text-yellow-400 ml-2">Yellow = Invalid</span> • 
              <span className="text-red-400 ml-2">Red = Error</span>
            </div>
          </section>
        )}

        {/* Debug: All Pulled Tracks */}
        {allPulledTracks.length > 0 && (
          <section className="bg-neutral-900/50 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">📋 All Pulled Tracks ({allPulledTracks.length})</h2>
              <span className="text-xs opacity-60">Before tempo analysis</span>
            </div>
            <div className="space-y-1 max-h-64 overflow-auto text-sm">
              {allPulledTracks.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 bg-neutral-800/40 rounded-lg px-3 py-2">
                  <span className="text-xs opacity-50 w-8">{i + 1}</span>
                  <div className="truncate flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="truncate text-xs opacity-75">{t.artists.join(", ")} • {t.album}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Debug: All Analyzed Tracks */}
        {allAnalyzedTracks.length > 0 && (
          <section className="bg-neutral-900/50 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">🎵 All Analyzed Tracks ({allAnalyzedTracks.length})</h2>
              <span className="text-xs opacity-60">With tempo data, sorted by BPM</span>
            </div>
            <div className="space-y-1 max-h-64 overflow-auto text-sm">
              {allAnalyzedTracks.map((t, i) => (
                <div key={t.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                  t.tempo >= minTempo && t.tempo <= maxTempo 
                    ? 'bg-green-900/30 border border-green-500/30' 
                    : 'bg-neutral-800/40'
                }`}>
                  <div className="truncate flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="truncate text-xs opacity-75">{t.artists.join(", ")}</div>
                  </div>
                  <div className="text-xs tabular-nums font-mono">
                    <span className={t.tempo >= minTempo && t.tempo <= maxTempo ? 'text-green-400' : 'opacity-60'}>
                      {t.tempo.toFixed(1)} BPM
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs opacity-60">
              <span className="text-green-400">Green = matches your {minTempo}-{maxTempo} BPM range</span>
            </div>
          </section>
        )}

        {/* Activity Log */}
        <section className="bg-neutral-900/50 rounded-2xl p-4">
          <h2 className="text-lg font-semibold mb-2">Activity</h2>
          <div className="space-y-1 text-sm max-h-48 overflow-auto">
            {log.map((l, i) => (
              <div key={i} className="opacity-80">• {l}</div>
            ))}
          </div>
        </section>

        <footer className="mt-8 text-xs opacity-60">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
            <h3 className="text-red-400 font-semibold mb-2">🚨 Getting "Invalid redirect URI" error?</h3>
            <div className="space-y-2 text-red-300">
              <p><strong>⚠️ IMPORTANT:</strong> Spotify no longer allows <code>localhost</code> - use IP address instead!</p>
              <p><strong>1. Current redirect URI:</strong> <code className="bg-red-800/30 px-1 rounded">{redirectUri}</code></p>
              <p><strong>2. Go to:</strong> <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="underline">Spotify Developer Dashboard</a></p>
              <p><strong>3. In your app settings, add exactly:</strong> <code className="bg-red-800/30 px-1 rounded">http://127.0.0.1:3000</code></p>
              <p><strong>4. NOT localhost:</strong> ❌ <code>http://localhost:3000</code> (no longer allowed)</p>
              <p><strong>5. Save settings and try again</strong></p>
            </div>
          </div>
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
            <h3 className="text-blue-400 font-semibold mb-2">🤖 Google Gemini API Setup</h3>
            <div className="space-y-2 text-blue-300">
              <p><strong>1. Get API Key:</strong> Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline">Google AI Studio</a></p>
              <p><strong>2. Create new API key</strong> for your project</p>
              <p><strong>3. Copy and paste</strong> the key into the Gemini API Key field above</p>
              <p><strong>🔍 BPM Analysis:</strong> Gemini AI with Google Search grounding finds verified BPM data from music databases in real-time</p>
            </div>
          </div>
          <p>This app uses Google Gemini AI for BPM estimation based on song metadata, combined with Spotify's Authorization Code PKCE flow for secure authentication. All tokens are stored locally in your browser.</p>
        </footer>
      </div>
    </div>
  );
}
