// =============================================================
// Spotify Tempo Playlist Builder — Single-file React App
// Features
// 1) Spotify login (Authorization Code + PKCE; no client secret needed)
// 2) Pick source (Saved Tracks and/or selected Playlists)
// 3) Select tempo (BPM) range
// 4) Filter tracks by tempo via Google Gemini AI with search grounding
// 5) Create a new playlist with matching tracks
// =============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Button, 
  Card, 
  CardBody, 
  CardHeader,
  Input, 
  Slider, 
  Chip,
  Progress,
  Checkbox,
  Divider,
  Link,
  Spinner
} from '@heroui/react';
import { GoogleGenerativeAI } from "@google/generative-ai";

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

// Helper function to filter tracks by BPM range (including half-time and double-time)
function filterTracksByTempo(tracks, tempos, minBpm, maxBpm) {
  return tracks.filter(track => {
    const tempo = tempos[track.id];
    if (!tempo) return false;
    
    // Check if original BPM is in range
    const inRange = tempo >= minBpm && tempo <= maxBpm;
    
    // Check if half-time (BPM / 2) is in range
    const halfTime = tempo / 2;
    const halfTimeInRange = halfTime >= minBpm && halfTime <= maxBpm;
    
    // Check if double-time (BPM * 2) is in range
    const doubleTime = tempo * 2;
    const doubleTimeInRange = doubleTime >= minBpm && doubleTime <= maxBpm;
    
    return inRange || halfTimeInRange || doubleTimeInRange;
  }).map(track => {
    const originalTempo = tempos[track.id];
    const halfTime = originalTempo / 2;
    const doubleTime = originalTempo * 2;
    
    // Determine which tempo variant is in range and use that as display tempo
    let displayTempo = originalTempo;
    let tempoType = "original";
    
    if (originalTempo >= minBpm && originalTempo <= maxBpm) {
      displayTempo = originalTempo;
      tempoType = "original";
    } else if (halfTime >= minBpm && halfTime <= maxBpm) {
      displayTempo = halfTime;
      tempoType = "half-time";
    } else if (doubleTime >= minBpm && doubleTime <= maxBpm) {
      displayTempo = doubleTime;
      tempoType = "double-time";
    }
    
    return {
      ...track,
      tempo: displayTempo,
      originalTempo: originalTempo,
      tempoType: tempoType
    };
  });
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
  const [isCustomRangeSelected, setIsCustomRangeSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);

  const [candidates, setCandidates] = useState([]); // {id, uri, name, artists:[], tempo}
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState("");

  // Duration-based playlist creation
  const [selectedDuration, setSelectedDuration] = useState(30); // 15, 30, or 60 minutes
  const [playlistCreationStep, setPlaylistCreationStep] = useState("select"); // "select", "scanning", "review", "creating", "complete"
  const [scannedTracks, setScannedTracks] = useState([]); // Tracks found during progressive scan
  const [totalScannedDuration, setTotalScannedDuration] = useState(0); // Total minutes scanned so far
  const [finalTrackSelection, setFinalTrackSelection] = useState([]); // Final tracks ready for playlist creation
  const [currentSourcePlaylist, setCurrentSourcePlaylist] = useState(null); // Currently scanning playlist info
  const [scanningPhase, setScanningPhase] = useState("primary"); // "primary", "secondary", "complete"

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

  // Auto-load user profile and playlists when we have a token
  useEffect(() => {
    if (accessToken && !me) {
      loadMe().catch(() => {/* Error handled in loadMe */});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, me]);

  // Auto-load playlists when user profile is loaded
  useEffect(() => {
    if (me && playlists.length === 0 && !loading) {
      loadPlaylists().catch(() => {/* Error handled in loadPlaylists */});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, playlists.length, loading]);

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
      
      // Count tempo types for enhanced logging
      const originalCount = filtered.filter(t => t.tempoType === "original").length;
      const halfTimeCount = filtered.filter(t => t.tempoType === "half-time").length;
      const doubleTimeCount = filtered.filter(t => t.tempoType === "double-time").length;
      
      const tempoBreakdown = [];
      if (originalCount > 0) tempoBreakdown.push(`${originalCount} original`);
      if (halfTimeCount > 0) tempoBreakdown.push(`${halfTimeCount} half-time`);
      if (doubleTimeCount > 0) tempoBreakdown.push(`${doubleTimeCount} double-time`);
      
      addLog(`✅ Found ${filtered.length} tracks in ${minTempo}-${maxTempo} BPM range (${tempoBreakdown.join(", ")}).`);
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

  // -------------------- Progressive Duration-Based Playlist Creation --------------------
  async function findMatchingSongs() {
    if (!me) {
      alert("Not logged in.");
      return;
    }
    
    if (!geminiApiKey) {
      alert("Please enter your Google Gemini API key in Settings first.");
      return;
    }
    
    setLoading(true);
    setCreatedPlaylistUrl("");
    setPlaylistCreationStep("scanning");
    setScannedTracks([]);
    setTotalScannedDuration(0);
    setFinalTrackSelection([]);
    setCurrentSourcePlaylist(null);
    setScanningPhase("primary");
    
    try {
      addLog(`🔍 Finding songs for ${selectedDuration}-minute playlist from most recent additions...`);
      
      // 1. Get the most recent playlist
      if (!playlists.length) {
        await loadPlaylists();
        if (!playlists.length) {
          addLog("❌ No playlists found. Please load your playlists first.");
          setLoading(false);
          setPlaylistCreationStep("select");
          return;
        }
      }
      
      // Sort playlists by most recent (assuming newest first in API response)
      const sortedPlaylists = [...playlists].sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
      
      addLog(`📋 Will scan through ${sortedPlaylists.length} playlists in order of most recent...`);
      
      // 3. Progressive scan through playlists until duration is filled
      const targetDurationMs = selectedDuration * 60 * 1000; // Convert to milliseconds
      let currentDurationMs = 0;
      let selectedTracks = [];
      let scannedCount = 0;
      let playlistIndex = 0;
      
      for (const currentPlaylist of sortedPlaylists) {
        playlistIndex++;
        
        if (currentDurationMs >= targetDurationMs) {
          addLog(`🎯 Target duration reached! Stopping playlist scan.`);
          break;
        }
        
        setCurrentSourcePlaylist({
          name: currentPlaylist.name,
          id: currentPlaylist.id,
          trackCount: currentPlaylist.tracks?.total || 0,
          type: "primary"
        });
        
        addLog(`📋 Scanning playlist ${playlistIndex}/${sortedPlaylists.length}: "${currentPlaylist.name}"`);
        
        // Get tracks from current playlist, with pagination to get all tracks
        let allPlaylistTracks = [];
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          const playlistTracksResp = await spGet(`playlists/${currentPlaylist.id}/tracks`, { 
            limit: 100, 
            offset: offset 
          });
          
          const tracks = (playlistTracksResp.items || [])
            .filter(item => item && item.track && item.track.id && !item.is_local)
            .map(item => ({
              ...item.track,
              added_at: item.added_at,
              duration_ms: item.track.duration_ms
            }));
          
          allPlaylistTracks.push(...tracks);
          hasMore = tracks.length === 100;
          offset += 100;
          
          if (hasMore) {
            await sleep(50); // Small delay for API rate limiting
          }
        }
        
        // Sort by most recent addition (newest first) within this playlist
        allPlaylistTracks = allPlaylistTracks.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
        
        addLog(`🔍 Found ${allPlaylistTracks.length} tracks in "${currentPlaylist.name}", scanning from most recent...`);
        
        // Scan tracks from this playlist
        for (const track of allPlaylistTracks) {
          if (currentDurationMs >= targetDurationMs) {
            addLog(`🎯 Target duration of ${selectedDuration} minutes reached!`);
            break;
          }
          
          // Skip if we already have this track
          if (selectedTracks.find(t => t.id === track.id)) {
            addLog(`⏭️ Skipping "${track.name}" - already added from previous playlist`);
            continue;
          }
          
          scannedCount++;
          addLog(`🎶 [${playlistIndex}/${sortedPlaylists.length}] Scanning track ${scannedCount}: "${track.name}" by ${track.artists?.[0]?.name || 'Unknown'}`);
          
          // Get BPM for this track using Gemini AI
          const title = track.name;
          const artist = track.artists?.[0]?.name || 'Unknown Artist';
          
          try {
            const bpm = await getTrackBPMWithGemini(title, artist, geminiApiKey, addGeminiLog);
            
            if (bpm !== null) {
              // Check if BPM is in range (including half-time and double-time)
              const originalInRange = bpm >= minTempo && bpm <= maxTempo;
              const halfTimeInRange = (bpm / 2) >= minTempo && (bpm / 2) <= maxTempo;
              const doubleTimeInRange = (bpm * 2) >= minTempo && (bpm * 2) <= maxTempo;
              
              if (originalInRange || halfTimeInRange || doubleTimeInRange) {
                // Determine display tempo and type
                let displayTempo = bpm;
                let tempoType = "original";
                
                if (originalInRange) {
                  displayTempo = bpm;
                  tempoType = "original";
                } else if (halfTimeInRange) {
                  displayTempo = bpm / 2;
                  tempoType = "half-time";
                } else if (doubleTimeInRange) {
                  displayTempo = bpm * 2;
                  tempoType = "double-time";
                }
                
                const trackWithTempo = {
                  ...track,
                  tempo: displayTempo,
                  originalTempo: bpm,
                  tempoType: tempoType,
                  sourcePlaylist: currentPlaylist.name
                };
                
                selectedTracks.push(trackWithTempo);
                currentDurationMs += track.duration_ms || 0;
                
                const currentMinutes = Math.round(currentDurationMs / 60000);
                addLog(`✅ Added "${track.name}" from "${currentPlaylist.name}" (${displayTempo.toFixed(1)} BPM ${tempoType}) - ${currentMinutes}/${selectedDuration} min`);
                
                // Update state for live progress display
                setScannedTracks([...selectedTracks]);
                setTotalScannedDuration(currentDurationMs / 60000);
                
                // Check if we've reached the target duration
                if (currentDurationMs >= targetDurationMs) {
                  addLog(`🎯 Target duration reached with ${selectedTracks.length} tracks from ${playlistIndex} playlists!`);
                  break;
                }
              } else {
                addLog(`⏭️ Skipped "${track.name}" (${bpm.toFixed(1)} BPM - outside ${minTempo}-${maxTempo} range)`);
              }
            } else {
              addLog(`❌ Could not determine BPM for "${track.name}" - skipping`);
            }
          } catch (error) {
            addLog(`❌ Error analyzing "${track.name}": ${error.message}`);
          }
          
          // Small delay to prevent rate limiting
          await sleep(200);
        }
        
        const currentMinutes = Math.round(currentDurationMs / 60000);
        addLog(`📊 After playlist "${currentPlaylist.name}": ${selectedTracks.length} tracks, ${currentMinutes}/${selectedDuration} minutes`);
      }
      
      // 4. Check if we have enough music from scanning playlists
      const achievedMinutes = Math.round(currentDurationMs / 60000);
      
      if (currentDurationMs < targetDurationMs && selectedTracks.length > 0) {
        addLog(`⚠️ Scanned all ${sortedPlaylists.length} playlists: Found ${achievedMinutes}/${selectedDuration} minutes of matching music.`);
        
        // Only use saved tracks as final fallback if we still don't have enough
        if (includeSaved) {
          addLog(`🔄 Using saved tracks as final fallback to fill remaining time...`);
          setScanningPhase("secondary");
          
          setCurrentSourcePlaylist({
            name: "Your Saved Tracks",
            id: "saved",
            trackCount: "Unknown",
            type: "saved"
          });
          
          const saved = await getAllSavedTracks();
          const existingTrackIds = new Set(selectedTracks.map(t => t.id));
          const uniqueSavedTracks = saved.filter(track => !existingTrackIds.has(track.id));
          
          addLog(`🔍 Scanning ${uniqueSavedTracks.length} saved tracks to fill remaining ${selectedDuration - achievedMinutes} minutes...`);
          
          // Scan saved tracks
          for (const track of uniqueSavedTracks) {
            if (currentDurationMs >= targetDurationMs) break;
            
            scannedCount++;
            addLog(`🎶 Saved track scan: "${track.name}" by ${track.artists?.[0]?.name || 'Unknown'}`);
            
            const title = track.name;
            const artist = track.artists?.[0]?.name || 'Unknown Artist';
            
            try {
              const bpm = await getTrackBPMWithGemini(title, artist, geminiApiKey, addGeminiLog);
              
              if (bpm !== null) {
                const originalInRange = bpm >= minTempo && bpm <= maxTempo;
                const halfTimeInRange = (bpm / 2) >= minTempo && (bpm / 2) <= maxTempo;
                const doubleTimeInRange = (bpm * 2) >= minTempo && (bpm * 2) <= maxTempo;
                
                if (originalInRange || halfTimeInRange || doubleTimeInRange) {
                  let displayTempo = bpm;
                  let tempoType = "original";
                  
                  if (originalInRange) {
                    displayTempo = bpm;
                    tempoType = "original";
                  } else if (halfTimeInRange) {
                    displayTempo = bpm / 2;
                    tempoType = "half-time";
                  } else if (doubleTimeInRange) {
                    displayTempo = bpm * 2;
                    tempoType = "double-time";
                  }
                  
                  const trackWithTempo = {
                    ...track,
                    tempo: displayTempo,
                    originalTempo: bpm,
                    tempoType: tempoType,
                    sourcePlaylist: "Saved Tracks"
                  };
                  
                  selectedTracks.push(trackWithTempo);
                  currentDurationMs += track.duration_ms || 0;
                  
                  const currentMinutes = Math.round(currentDurationMs / 60000);
                  addLog(`✅ Added from saved tracks: "${track.name}" (${displayTempo.toFixed(1)} BPM ${tempoType}) - ${currentMinutes}/${selectedDuration} min`);
                  
                  setScannedTracks([...selectedTracks]);
                  setTotalScannedDuration(currentDurationMs / 60000);
                  
                  if (currentDurationMs >= targetDurationMs) {
                    addLog(`🎯 Target duration reached with saved tracks!`);
                    break;
                  }
                }
              }
            } catch (error) {
              // Continue with next track on error
            }
            
            await sleep(200);
          }
        }
      } else if (selectedTracks.length === 0) {
        addLog(`❌ No matching tracks found in any of your ${sortedPlaylists.length} playlists. Try adjusting your BPM range.`);
        setScanningPhase("complete");
        setCurrentSourcePlaylist(null);
        setPlaylistCreationStep("select");
        setLoading(false);
        return;
      }
      
      // 5. Show results for review
      if (selectedTracks.length > 0) {
        const finalDuration = Math.round(currentDurationMs / 60000);
        const playlistCount = new Set(selectedTracks.map(t => t.sourcePlaylist || "Unknown")).size;
        addLog(`🎵 Found ${selectedTracks.length} matching tracks (${finalDuration} minutes) from ${playlistCount} source(s) - ready for review!`);
        
        if (finalDuration < selectedDuration) {
          addLog(`📊 Note: Found ${finalDuration}/${selectedDuration} minutes - scanned all available playlists.`);
        }
        
        setScanningPhase("complete");
        setCurrentSourcePlaylist(null);
        setFinalTrackSelection(selectedTracks);
        setPlaylistCreationStep("review");
      } else {
        addLog(`❌ No matching tracks found in any playlist. Try adjusting your BPM range or ensure you have music in your playlists.`);
        setScanningPhase("complete");
        setCurrentSourcePlaylist(null);
        setPlaylistCreationStep("select");
      }
      
    } catch (error) {
      console.error("Error finding matching songs:", error);
      addLog(`❌ Error finding songs: ${error.message}`);
      setScanningPhase("complete");
      setCurrentSourcePlaylist(null);
      setPlaylistCreationStep("select");
    } finally {
      setLoading(false);
    }
  }

  // Create playlist from reviewed tracks
  async function createPlaylistFromSelection() {
    if (!me || finalTrackSelection.length === 0) {
      return;
    }
    
    setLoading(true);
    setPlaylistCreationStep("creating");
    
    try {
      const finalDuration = Math.round(finalTrackSelection.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000);
      const name = newPlaylistName || `Smart ${finalDuration}min Mix (${minTempo}-${maxTempo} BPM)`;
      
      addLog(`🎵 Creating playlist "${name}" with ${finalTrackSelection.length} tracks...`);
      
      const pl = await spPost(`users/${me.id}/playlists`, {
        name,
        description: `Smart tempo playlist: ${minTempo}-${maxTempo} BPM, ${finalDuration} minutes. Created from most recent additions.`,
        public: false,
      });
      
      // Add tracks to playlist in chunks
      const uris = finalTrackSelection.map(t => t.uri);
      for (const uriChunk of chunk(uris, 100)) {
        await spPost(`playlists/${pl.id}/tracks`, { uris: uriChunk });
        await sleep(100);
      }
      
      setCreatedPlaylistUrl(pl.external_urls?.spotify || "");
      addLog(`🎉 Successfully created playlist "${name}" with ${finalTrackSelection.length} tracks (${finalDuration} minutes)!`);
      setPlaylistCreationStep("complete");
      
    } catch (error) {
      console.error("Error creating playlist:", error);
      addLog(`❌ Error creating playlist: ${error.message}`);
      setPlaylistCreationStep("review");
    } finally {
      setLoading(false);
    }
  }

  // -------------------- Original Create Playlist (kept for backward compatibility) --------------------
  async function createPlaylist() {
    if (!me) {
      alert("Not logged in.");
      return;
    }
    setLoading(true);
    setCreatedPlaylistUrl("");
    try {
      // 1. Get tracks from the most recent playlist (by selectedPlaylistIds[0])
      if (!selectedPlaylistIds.length) {
        alert("Please select a playlist.");
        setLoading(false);
        return;
      }
      const playlistId = selectedPlaylistIds[0];
      const playlistTracksResp = await spGet(`playlists/${playlistId}/tracks?limit=100`);
      let playlistTracks = (playlistTracksResp.items || []).map(item => ({
        ...item.track,
        added_at: item.added_at,
        duration_ms: item.track.duration_ms
      }));
      playlistTracks = sortByMostRecent(playlistTracks);

      // 2. Try to fill up the selected duration with primary (already scanned) candidates
      let filledTracks = [];
      let totalDuration = 0;
      for (const t of playlistTracks) {
        const match = candidates.find(c => c.id === t.id);
        if (match) {
          filledTracks.push({ ...t, ...match });
          totalDuration += (t.duration_ms || 0);
          if (totalDuration / 60000 >= selectedDuration) break;
        }
      }
      if (totalDuration / 60000 >= selectedDuration) {
        // Success: create playlist with these tracks
        const name = newPlaylistName || `Tempo ${minTempo}-${maxTempo} BPM (${selectedDuration} min)`;
        const pl = await spPost(`users/${me.id}/playlists`, {
          name,
          description: `Auto-built by Tempo Builder — ${minTempo}-${maxTempo} BPM, ${selectedDuration} min` ,
          public: false,
        });
        const uris = filledTracks.map((x) => x.uri);
        for (const c of chunk(uris, 100)) {
          await spPost(`playlists/${pl.id}/tracks`, { uris: c });
          await sleep(50);
        }
        setCreatedPlaylistUrl(pl.external_urls?.spotify || "");
        addLog(`Created playlist with ${filledTracks.length} tracks for ${selectedDuration} min.`);
        setLoading(false);
        return;
      }
      // 3. If not enough, try secondary/tertiary sources (all candidates)
      for (const t of playlistTracks) {
        if (!filledTracks.find(f => f.id === t.id)) {
          const match = candidates.find(c => c.id === t.id);
          if (match) {
            filledTracks.push({ ...t, ...match });
            totalDuration += (t.duration_ms || 0);
            if (totalDuration / 60000 >= selectedDuration) break;
          }
        }
      }
      if (totalDuration / 60000 >= selectedDuration) {
        // Success: create playlist with these tracks
        const name = newPlaylistName || `Tempo ${minTempo}-${maxTempo} BPM (${selectedDuration} min)`;
        const pl = await spPost(`users/${me.id}/playlists`, {
          name,
          description: `Auto-built by Tempo Builder — ${minTempo}-${maxTempo} BPM, ${selectedDuration} min` ,
          public: false,
        });
        const uris = filledTracks.map((x) => x.uri);
        for (const c of chunk(uris, 100)) {
          await spPost(`playlists/${pl.id}/tracks`, { uris: c });
          await sleep(50);
        }
        setCreatedPlaylistUrl(pl.external_urls?.spotify || "");
        addLog(`Created playlist with ${filledTracks.length} tracks for ${selectedDuration} min (using secondary/tertiary sources).`);
        setLoading(false);
        return;
      }
      // 4. Not enough music
      addLog(`❌ Not enough music in your most recent playlist to fill ${selectedDuration} min.`);
      alert(`Not enough music in your most recent playlist to fill ${selectedDuration} min.`);
    } catch (e) {
      console.error(e);
      addLog("Failed to create playlist.");
    } finally {
      setLoading(false);
    }
  }

  // Helper: Calculate total duration in minutes from a list of tracks
  function getTotalDurationMinutes(tracks) {
    return tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000;
  }

  // Helper: Sort tracks by most recent addition (assuming 'added_at' exists)
  function sortByMostRecent(tracks) {
    return [...tracks].sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
  }

  // -------------------- UI --------------------
  const isAuthed = !!accessToken;
  const totalFound = candidates.length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tempo Playlist Builder</h1>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">{me ? `Logged in as ${me.display_name || me.id}` : "Authenticated"}</span>
                <Button 
                  size="sm"
                  color="danger"
                  onClick={() => {
                    localStorage.removeItem("spotify_access_token");
                    localStorage.removeItem("spotify_refresh_token");
                    localStorage.removeItem("spotify_token_expiry");
                    setAccessToken("");
                    setRefreshToken("");
                    setTokenExpiry(0);
                    setMe(null);
                  }}
                >
                  Logout
                </Button>
              </div>
            ) : (
              <Button 
                color="success" 
                size="lg"
                onClick={startSpotifyAuth}
              >
                Log in with Spotify
              </Button>
            )}
          </div>
        </header>

        {/* Tempo Controls */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Tempo Range (BPM)</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Preset BPM Ranges */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { min: 130, max: 150, label: "130-150" },
                { min: 150, max: 170, label: "150-170" },
                { min: 170, max: 190, label: "170-190" }
              ].map((range) => (
                <Button
                  key={range.label}
                  variant={minTempo === range.min && maxTempo === range.max && !isCustomRangeSelected ? "solid" : "bordered"}
                  color={minTempo === range.min && maxTempo === range.max && !isCustomRangeSelected ? "primary" : "default"}
                  onClick={() => {
                    setMinTempo(range.min);
                    setMaxTempo(range.max);
                    setIsCustomRangeSelected(false);
                  }}
                >
                  {range.label} BPM
                </Button>
              ))}
            </div>

            {/* Custom Range Slider */}
            <Card 
              isPressable
              isHoverable
              className={`cursor-pointer transition-colors ${
                isCustomRangeSelected 
                  ? 'bg-primary-50 border-primary-200 border-2' 
                  : 'hover:bg-default-100'
              }`}
              onClick={() => {
                setIsCustomRangeSelected(true);
              }}
            >
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-medium ${
                    isCustomRangeSelected ? 'text-primary-700' : ''
                  }`}>
                    Custom Range:
                  </span>
                  <Chip 
                    color={isCustomRangeSelected ? "primary" : "default"} 
                    variant={isCustomRangeSelected ? "solid" : "flat"}
                  >
                    {minTempo} - {maxTempo} BPM
                  </Chip>
                </div>
                
                <div className="w-full">
                  <Slider
                    step={5}
                    minValue={80}
                    maxValue={210}
                    value={[minTempo, maxTempo]}
                    onChange={(value) => {
                      setMinTempo(value[0]);
                      setMaxTempo(value[1]);
                      setIsCustomRangeSelected(true);
                    }}
                    className="w-full"
                    isDisabled={false}
                    color={isCustomRangeSelected ? "primary" : "default"}
                  />
                </div>
              
              </CardBody>
            </Card>
          </CardBody>
        </Card>

        {/* Duration-Based Playlist Creator */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">🎵 Smart Playlist Creator</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-default-500 mb-4">
              Find songs by scanning your most recent playlist additions, then review before creating playlist.
            </p>
            
            {playlistCreationStep === "select" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Choose playlist duration:</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[15, 30, 60].map((duration) => (
                      <Button
                        key={duration}
                        variant={selectedDuration === duration ? "solid" : "bordered"}
                        color={selectedDuration === duration ? "success" : "default"}
                        onClick={() => setSelectedDuration(duration)}
                      >
                        {duration} minutes
                      </Button>
                    ))}
                  </div>
                </div>
                
                <Button 
                  color="primary"
                  size="lg"
                  isDisabled={!isAuthed || !geminiApiKey || playlists.length === 0}
                  onClick={findMatchingSongs}
                  className="w-full"
                >
                  {`Find Songs for ${selectedDuration}-Minute Playlist`}
                </Button>
                
                {(!isAuthed || !geminiApiKey || (playlists.length === 0 && !loading)) && (
                  <Card>
                    <CardBody className="bg-warning-50 border border-warning-200">
                      <div className="text-sm text-warning-700">
                        {!isAuthed && "⚠️ Please log in to Spotify first"}
                        {!geminiApiKey && "⚠️ Please enter your Gemini API key"}
                        {playlists.length === 0 && !loading && "⚠️ No playlists available - playlists will load automatically after login"}
                      </div>
                    </CardBody>
                  </Card>
                )}
              </div>
            )}
            
            {playlistCreationStep === "scanning" && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-lg font-medium flex items-center justify-center gap-2">
                    <Spinner size="sm" />
                    🔍 Scanning your music...
                  </div>
                  <div className="text-sm text-default-500 mt-1">
                    Finding {selectedDuration}-minute playlist from your most recent additions
                  </div>
                </div>
                
                {/* Current Source Display */}
                {currentSourcePlaylist && (
                  <Card>
                    <CardBody className="bg-primary-50 border border-primary-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Chip 
                          color="primary" 
                          variant="flat"
                          size="sm"
                        >
                          {scanningPhase === "primary" && "🎯 Primary Source"}
                          {scanningPhase === "secondary" && "🔄 Secondary Source"}
                        </Chip>
                      </div>
                      <div className="text-sm">
                        <div className="font-medium text-primary-700">{currentSourcePlaylist.name}</div>
                        {currentSourcePlaylist.trackCount && (
                          <div className="text-xs text-primary-600 mt-1">
                            {currentSourcePlaylist.trackCount !== "Unknown" ? `${currentSourcePlaylist.trackCount} tracks` : "Loading track count..."}
                          </div>
                        )}
                        {currentSourcePlaylist.details && (
                          <div className="text-xs text-primary-600 mt-1 truncate">
                            {currentSourcePlaylist.details}
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                )}
                
                <Card>
                  <CardBody>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Progress:</span>
                      <span className="text-sm font-mono">
                        {Math.round(totalScannedDuration)}/{selectedDuration} minutes
                      </span>
                    </div>
                    <Progress 
                      value={(totalScannedDuration / selectedDuration) * 100}
                      color="primary"
                      className="w-full"
                    />
                  </CardBody>
                </Card>
                
                {scannedTracks.length > 0 && (
                  <Card>
                    <CardBody>
                      <div className="text-sm font-medium mb-2">
                        Found tracks ({scannedTracks.length}):
                      </div>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {scannedTracks.map((track, i) => (
                          <div key={track.id} className="flex items-center justify-between gap-3 bg-default-100 rounded-lg px-3 py-2 text-sm">
                            <div className="truncate">
                              <div className="truncate font-medium">{track.name}</div>
                              <div className="truncate text-xs opacity-75">{track.artists?.map(a => a.name || a).join(", ")}</div>
                            </div>
                            <div className="text-xs font-mono">
                              <Chip size="sm" variant="flat" color="success">
                                {track.tempo?.toFixed(1)} BPM
                              </Chip>
                              {track.tempoType !== "original" && (
                                <span className="ml-1 opacity-60">({track.tempoType})</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                )}
              </div>
            )}
            
            {playlistCreationStep === "review" && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-lg font-medium text-success-600">🎵 Found Your Songs!</div>
                  <div className="text-sm text-default-500 mt-1">
                    {finalTrackSelection.length} tracks • {Math.round(finalTrackSelection.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000)} minutes
                  </div>
                </div>
                
                <Card>
                  <CardBody>
                    <div className="text-sm font-medium mb-3">Selected Songs:</div>
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {finalTrackSelection.map((track, i) => (
                        <div key={track.id} className="flex items-center justify-between gap-3 bg-default-100 rounded-lg px-3 py-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Chip size="sm" variant="flat">{i + 1}</Chip>
                            <div className="truncate flex-1">
                              <div className="truncate font-medium">{track.name}</div>
                              <div className="truncate text-xs opacity-75">
                                {track.artists?.map(a => a.name || a).join(", ")} • {track.album?.name || 'Unknown Album'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono">
                              <Chip size="sm" color="success" variant="flat">
                                {track.tempo?.toFixed(1)} BPM
                              </Chip>
                              {track.tempoType !== "original" && (
                                <div className="text-xs opacity-60 mt-1">
                                  {track.tempoType === "half-time" && (
                                    <span className="text-primary-500">½× ({track.originalTempo?.toFixed(1)})</span>
                                  )}
                                  {track.tempoType === "double-time" && (
                                    <span className="text-warning-500">2× ({track.originalTempo?.toFixed(1)})</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-xs opacity-60 mt-1">
                              {Math.round((track.duration_ms || 0) / 1000 / 60)}:{String(Math.round(((track.duration_ms || 0) / 1000) % 60)).padStart(2, '0')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
                
                <Input
                  label="Playlist name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder={`Smart ${Math.round(finalTrackSelection.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000)}min Mix (${minTempo}-${maxTempo} BPM)`}
                />
                
                <div className="flex gap-3">
                  <Button 
                    variant="bordered"
                    onClick={() => {
                      setPlaylistCreationStep("select");
                      setScannedTracks([]);
                      setTotalScannedDuration(0);
                      setFinalTrackSelection([]);
                      setCurrentSourcePlaylist(null);
                      setScanningPhase("primary");
                    }} 
                    className="flex-1"
                  >
                    Start Over
                  </Button>
                  <Button 
                    color="success"
                    isLoading={loading}
                    onClick={createPlaylistFromSelection}
                    className="flex-1"
                  >
                    {loading ? "Creating..." : "Create Playlist"}
                  </Button>
                </div>
              </div>
            )}
            
            {playlistCreationStep === "creating" && (
              <div className="text-center space-y-4">
                <div className="text-lg font-medium flex items-center justify-center gap-2">
                  <Spinner />
                  🎵 Creating your playlist...
                </div>
                <div className="text-sm text-default-500">
                  Adding {finalTrackSelection.length} tracks to Spotify
                </div>
              </div>
            )}
            
            {playlistCreationStep === "complete" && (
              <div className="text-center space-y-4">
                <div className="text-lg font-medium text-success-600">✅ Playlist Created!</div>
                {createdPlaylistUrl && (
                  <Link 
                    href={createdPlaylistUrl}
                    isExternal
                    showAnchorIcon
                  >
                    <Button color="success" size="lg">
                      🎵 Open in Spotify
                    </Button>
                  </Link>
                )}
                <Button 
                  variant="bordered"
                  onClick={() => {
                    setPlaylistCreationStep("select");
                    setScannedTracks([]);
                    setTotalScannedDuration(0);
                    setFinalTrackSelection([]);
                    setCreatedPlaylistUrl("");
                    setNewPlaylistName("");
                    setCurrentSourcePlaylist(null);
                    setScanningPhase("primary");
                  }} 
                >
                  Create Another Playlist
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Debug Authentication Status */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300 font-medium">Access Token:</span><br/>
              <span className={accessToken ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {accessToken ? `${accessToken.substring(0, 20)}...` : "None"}
              </span>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300 font-medium">Refresh Token:</span><br/>
              <span className={refreshToken ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {refreshToken ? `${refreshToken.substring(0, 20)}...` : "None"}
              </span>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300 font-medium">Expires:</span><br/>
              <span className={tokenExpiry > Math.floor(Date.now() / 1000) ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {tokenExpiry ? new Date(tokenExpiry * 1000).toLocaleTimeString() : "Never"}
              </span>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300 font-medium">User:</span><br/>
              <span className={me ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
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

        {/* Gemini Live Log with Grounding */}
        {geminiLogs.length > 0 && (
          <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-100">🔍 Gemini AI Live Responses with Search Grounding ({geminiLogs.length})</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-300 bg-slate-900/40 border border-slate-600/50 rounded-lg px-3 py-1">Real-time BPM analysis with sources</span>
                <button 
                  onClick={() => setGeminiLogs([])} 
                  className="text-xs px-3 py-1 bg-slate-900/40 border border-slate-600/50 rounded-lg text-slate-200 hover:bg-slate-800/60 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-auto text-sm font-mono">
              {geminiLogs.map((log, i) => (
                <div key={i} className={`bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-600/50 ${
                  log.error 
                    ? 'border-red-400/50' 
                    : log.valid 
                      ? log.tier === "PRIMARY"
                        ? 'border-blue-400/50' // Blue for primary
                        : log.tier === "SECONDARY"
                          ? 'border-orange-400/50' // Orange for secondary
                          : log.tier === "TERTIARY"
                            ? 'border-purple-400/50' // Purple for tertiary
                            : 'border-emerald-400/50' // Green for any other valid
                      : 'border-yellow-400/50' // Yellow for invalid
                }`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="truncate flex-1">
                      <span className="font-medium text-slate-300">{log.song}</span>
                      {log.grounded && <span className="ml-2 text-blue-400 text-xs">🔗 SOURCED</span>}
                      {log.tier && <span className="ml-2 text-purple-300 text-xs">{log.tier}</span>}
                      {log.model && <span className="ml-1 text-slate-400 text-xs">({log.model})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{log.timestamp}</span>
                      {log.valid && (
                        <span className={`font-bold ${
                          log.tier === "PRIMARY" ? 'text-blue-400' : 
                          log.tier === "SECONDARY" ? 'text-orange-400' : 
                          log.tier === "TERTIARY" ? 'text-purple-400' : 
                          'text-emerald-400'
                        }`}>
                          {log.parsedBPM} BPM
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>
                      <span className="text-slate-300">Raw response:</span> "{log.rawResponse}"
                      {!log.error && !log.valid && (
                        <span className="text-yellow-400 ml-2">⚠️ Invalid BPM format</span>
                      )}
                      {log.error && (
                        <span className="text-red-400 ml-2">❌ API Error</span>
                      )}
                    </div>
                    {log.searchQueries && log.searchQueries.length > 0 && (
                      <div>
                        <span className="text-slate-300">Search queries:</span> {log.searchQueries.join(', ')}
                      </div>
                    )}
                    {log.sources && log.sources.length > 0 && (
                      <div>
                        <span className="text-slate-300">Sources:</span> 
                        {log.sources.map((source, idx) => (
                          <span key={idx} className="ml-1">
                            <a href={source} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
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
            <div className="mt-3 text-xs text-slate-400">
              <span className="text-blue-400">Blue = Primary (gemini-2.5-flash-lite)</span> • 
              <span className="text-orange-400 ml-2">Orange = Secondary (gemini-2.0-flash)</span> • 
              <span className="text-purple-400 ml-2">Purple = Tertiary (gemini-2.5-flash)</span> • 
              <span className="text-emerald-400 ml-2">Green = Valid BPM</span> • 
              <span className="text-yellow-400 ml-2">Yellow = Invalid</span> • 
              <span className="text-red-400 ml-2">Red = Error</span>
            </div>
          </section>
        )}

        {/* Settings */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
          <div className="mb-4">
            <h2 className="text-lg font-bold mb-3 text-slate-100">🔧 API Configuration</h2>
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50 mb-3">
              <div className="text-sm text-slate-300">
                <span className="text-slate-300 font-medium">📍 Current Redirect URI:</span> <code className="bg-slate-800/60 px-2 py-1 rounded text-emerald-400">{redirectUri}</code><br/>
                <span className="text-slate-300 font-medium">⚠️ This MUST exactly match your Spotify app settings!</span><br/>
                <span className="text-slate-300 font-medium">🤖 BPM Analysis:</span> Now powered by Google Gemini AI with real-time web search grounding for verified tempo data!
              </div>
            </div>
            {(import.meta.env.VITE_SPOTIFY_CLIENT_ID || import.meta.env.VITE_GEMINI_API_KEY) && (
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                <div className="text-sm text-slate-300">
                  <span className="text-slate-300 font-medium">✅ Environment Variables Loaded:</span><br/>
                  {import.meta.env.VITE_SPOTIFY_CLIENT_ID && <span className="text-emerald-400">• Spotify Client ID from .env<br/></span>}
                  {import.meta.env.VITE_SPOTIFY_REDIRECT_URI && <span className="text-emerald-400">• Redirect URI from .env<br/></span>}
                  {import.meta.env.VITE_GEMINI_API_KEY && <span className="text-emerald-400">• Gemini API Key from .env<br/></span>}
                  <span className="text-xs text-slate-400 mt-1 block">You can still override these values in the fields below.</span>
                </div>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="col-span-1 md:col-span-1">
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                <span className="text-slate-300 font-medium">Spotify Client ID</span>
                {import.meta.env.VITE_SPOTIFY_CLIENT_ID && <span className="text-emerald-400 ml-1">(.env)</span>}<br/>
                <input 
                  value={clientId} 
                  onChange={(e) => setClientId(e.target.value)} 
                  className="w-full mt-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 outline-none focus:border-slate-400 text-slate-200 text-xs" 
                  placeholder={import.meta.env.VITE_SPOTIFY_CLIENT_ID ? "Loaded from .env" : "Your Spotify Client ID"} 
                />
              </div>
            </div>
            <div className="col-span-1 md:col-span-2">
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                <span className="text-slate-300 font-medium">Redirect URI (must be whitelisted in your Spotify App)</span>
                {import.meta.env.VITE_SPOTIFY_REDIRECT_URI && <span className="text-emerald-400 ml-1">(.env)</span>}<br/>
                <input 
                  value={redirectUri} 
                  onChange={(e) => setRedirectUri(e.target.value)} 
                  className="w-full mt-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 outline-none focus:border-slate-400 text-slate-200 text-xs" 
                  placeholder={import.meta.env.VITE_SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT} 
                />
              </div>
            </div>
            <div className="col-span-1 md:col-span-3">
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                <span className="text-slate-300 font-medium">Google Gemini API Key (required for BPM analysis)</span>
                {import.meta.env.VITE_GEMINI_API_KEY && <span className="text-emerald-400 ml-1">(.env)</span>}<br/>
                <input 
                  value={geminiApiKey} 
                  onChange={(e) => setGeminiApiKey(e.target.value)} 
                  className="w-full mt-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 outline-none focus:border-slate-400 text-slate-200 text-xs" 
                  placeholder={import.meta.env.VITE_GEMINI_API_KEY ? "Loaded from .env" : "AIza..."} 
                />
              </div>
            </div>
          </div>
        </section>

        {/* Source Selection */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-slate-100">Sources</h2>
            <div className="flex items-center gap-3">
              <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-600/50">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={includeSaved} onChange={(e) => setIncludeSaved(e.target.checked)} className="accent-emerald-400" /> 
                  <span className="text-slate-300 font-medium">Include Saved Tracks</span>
                </label>
              </div>
              {loading && playlists.length === 0 && (
                <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-600/50">
                  <span className="text-sm text-slate-300">Loading playlists...</span>
                </div>
              )}
            </div>
          </div>

          {playlists.length > 0 ? (
            <div className="max-h-64 overflow-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {playlists.map((p) => (
                <div key={p.id} className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlaylistIds.includes(p.id)}
                      onChange={(e) => {
                        setSelectedPlaylistIds((cur) =>
                          e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)
                        );
                      }}
                      className="accent-emerald-400"
                    />
                    <span className="truncate text-slate-300 font-medium">{p.name}</span>
                  </label>
                </div>
              ))}
            </div>
          ) : loading ? (
            <div className="text-center py-4">
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50 inline-flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-slate-300">Loading your playlists...</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <span className="text-slate-400">(No playlists available)</span>
            </div>
          )}
        </section>

        {/* Legacy Results (Batch Analysis Method) */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-100">Legacy: Batch Tempo Analysis Results</h2>
            <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-600/50">
              <span className="text-slate-300 font-medium">{totalFound} tracks</span>
            </div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50 mb-3">
            <span className="text-slate-300">
              This is the old method that analyzes all tracks first. Use the Smart Playlist Creator above for the new progressive scanning method.
            </span>
          </div>
          {candidates.length === 0 ? (
            <div className="text-center py-4">
              <span className="text-slate-400">(No results yet)</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {candidates.map((t) => (
                <div key={t.id} className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate">
                      <div className="truncate font-medium text-slate-300">{t.name}</div>
                      <div className="truncate text-slate-400">{t.artists.join(", ")}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{t.tempo.toFixed(1)} BPM</div>
                      {t.tempoType !== "original" && (
                        <div className="text-slate-400 mt-1">
                          {t.tempoType === "half-time" && (
                            <span className="text-blue-400">½× ({t.originalTempo.toFixed(1)})</span>
                          )}
                          {t.tempoType === "double-time" && (
                            <span className="text-orange-400">2× ({t.originalTempo.toFixed(1)})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-col sm:flex-row gap-3">
            <input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} className="flex-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 outline-none focus:border-slate-400 text-slate-200" placeholder={`Legacy playlist name (default: Tempo ${minTempo}-${maxTempo} BPM)`} />
            <button onClick={createPlaylist} disabled={loading || (!isAuthed)} className="px-3 py-1 rounded bg-slate-600 text-slate-100 font-medium disabled:opacity-50 hover:bg-slate-500 transition-colors">Create Legacy Playlist</button>
          </div>
          {createdPlaylistUrl ? (
            <div className="mt-3 bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300">Done! </span><a href={createdPlaylistUrl} target="_blank" rel="noreferrer" className="underline text-emerald-400 hover:text-emerald-300">Open your new playlist</a>
            </div>
          ) : null}
        </section>

        {/* Debug: All Pulled Tracks */}
        {allPulledTracks.length > 0 && (
          <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-100">📋 All Pulled Tracks ({allPulledTracks.length})</h2>
              <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-600/50">
                <span className="text-slate-300 font-medium">Before tempo analysis</span>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {allPulledTracks.map((t, i) => (
                <div key={t.id} className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-800/60 rounded px-2 py-1 border border-slate-600/50">
                      <span className="text-slate-300 font-bold">{i + 1}</span>
                    </div>
                    <div className="truncate flex-1">
                      <div className="truncate font-medium text-slate-300">{t.name}</div>
                      <div className="truncate text-slate-400">{t.artists.join(", ")} • {t.album}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Debug: All Analyzed Tracks */}
        {allAnalyzedTracks.length > 0 && (
          <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-100">🎵 All Analyzed Tracks ({allAnalyzedTracks.length})</h2>
              <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-600/50">
                <span className="text-slate-300 font-medium">With tempo data, sorted by BPM</span>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {allAnalyzedTracks.map((t, i) => (
                <div key={t.id} className={`bg-slate-900/40 rounded-lg p-3 border transition-colors ${
                  t.tempo >= minTempo && t.tempo <= maxTempo 
                    ? 'border-emerald-400/50' 
                    : 'border-slate-600/50'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate flex-1">
                      <div className="truncate font-medium text-slate-300">{t.name}</div>
                      <div className="truncate text-slate-400">{t.artists.join(", ")}</div>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${
                        t.tempo >= minTempo && t.tempo <= maxTempo 
                          ? 'text-emerald-400' 
                          : 'text-slate-400'
                      }`}>
                        {t.tempo.toFixed(1)} BPM
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300">✅ </span>
              <span className="text-emerald-400">Green = matches your {minTempo}-{maxTempo} BPM range</span>
            </div>
          </section>
        )}

        {/* Activity Log */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
          <h2 className="text-lg font-bold mb-3 text-slate-100">Activity</h2>
          <div className="space-y-2 max-h-48 overflow-auto">
            {log.map((l, i) => (
              <div key={i} className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
                <span className="text-slate-300">• {l}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
