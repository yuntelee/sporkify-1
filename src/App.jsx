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
  TextInput, 
  Slider, 
  Chip,
  Progress,
  Checkbox,
  Divider,
  Anchor as Link,
  Loader as Spinner,
  Text,
  Group,
  Stack,
  Title,
  Container,
  Grid,
  Paper,
  Select,
  NumberInput,
  Tabs,
  List,
  Code,
  Alert,
  ScrollArea,
  Box,
  Center,
  RangeSlider,
  Collapse,
  Accordion
} from '@mantine/core';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

// -------------------- Utility: Tiny helpers --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const uniq = (arr) => Array.from(new Set(arr));

// -------------------- Google Gemini BPM Utility with Three-Tier Grounding --------------------
async function getTrackBPMWithGemini(title, artist, geminiApiKey, addGeminiLog = null, abortSignal = null, updateLiveStatus = null) {
  if (!geminiApiKey) {
    throw new Error("Gemini API key is required");
  }

  // Check if request was cancelled before starting
  if (abortSignal?.aborted) {
    throw new Error("Request cancelled before starting");
  }

  const songKey = `${title} - ${artist}`;
  
  // Initialize live status
  if (updateLiveStatus) {
    console.log('🎵 Initializing live status for:', songKey);
    updateLiveStatus(songKey, {
      songName: title,
      artist: artist,
      primary: 'running',
      secondary: 'pending',
      tertiary: 'pending',
      finalBPM: null
    });
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
    
    // Check for cancellation before each tier
    if (abortSignal?.aborted) {
      throw new Error("Request cancelled during PRIMARY tier");
    }
    
    // Update status: Sending to API
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        primary: 'sending...'
      });
    }
    
    const primaryModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        temperature: 0.05, // Lower temperature for faster, more focused responses
        maxOutputTokens: 50, // Reduced tokens for faster responses
      },
      tools: [groundingTool],
    });

    const primaryResult = await primaryModel.generateContent(basePrompt);
    
    // Update status: Response received
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        primary: 'processing...'
      });
    }
    
    // Check for cancellation after API call
    if (abortSignal?.aborted) {
      throw new Error("Request cancelled after PRIMARY API call");
    }
    
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
      if (updateLiveStatus) {
        updateLiveStatus(songKey, {
          primary: 'success',
          secondary: 'skipped',
          tertiary: 'skipped',
          finalBPM: bpm
        });
      }
      return bpm;
    }
    console.log(`❌ PRIMARY failed - invalid BPM: "${bpmText}"`);
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        primary: 'failed',
        secondary: 'running'
      });
    }
  } catch (primaryErr) {
    console.error(`🚨 PRIMARY failed for "${title}":`, primaryErr);
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        primary: 'error',
        secondary: 'running'
      });
    }
  }

  // Tier 2: Secondary - Gemini 2.0 Flash with grounding
  try {
    console.log(`🥈 Trying SECONDARY (gemini-2.0-flash) for "${title}" by ${artist}`);
    
    // Check for cancellation before secondary tier
    if (abortSignal?.aborted) {
      throw new Error("Request cancelled during SECONDARY tier");
    }
    
    // Update status: Sending to API
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        secondary: 'sending...'
      });
    }
    
    const secondaryModel = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1, // Slightly higher for secondary
        maxOutputTokens: 60, // Reduced tokens for faster responses
      },
      tools: [groundingTool],
    });

    const secondaryResult = await secondaryModel.generateContent(basePrompt);
    
    // Update status: Response received
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        secondary: 'processing...'
      });
    }
    
    // Check for cancellation after API call
    if (abortSignal?.aborted) {
      throw new Error("Request cancelled after SECONDARY API call");
    }
    
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
      if (updateLiveStatus) {
        updateLiveStatus(songKey, {
          secondary: 'success',
          tertiary: 'skipped',
          finalBPM: bpm
        });
      }
      return bpm;
    }
    console.log(`❌ SECONDARY failed - invalid BPM: "${bpmText}"`);
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        secondary: 'failed',
        tertiary: 'running'
      });
    }
  } catch (secondaryErr) {
    console.error(`🚨 SECONDARY failed for "${title}":`, secondaryErr);
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        secondary: 'error',
        tertiary: 'running'
      });
    }
  }

  // Tier 3: Tertiary - Gemini 2.5 Flash with grounding
  try {
    console.log(`🥉 Trying TERTIARY (gemini-2.5-flash) for "${title}" by ${artist}`);
    
    // Check for cancellation before tertiary tier
    if (abortSignal?.aborted) {
      throw new Error("Request cancelled during TERTIARY tier");
    }
    
    // Update status: Sending to API
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        tertiary: 'sending...'
      });
    }
    
    const tertiaryModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.15, // Slightly higher for tertiary fallback
        maxOutputTokens: 50, // Reduced tokens for faster responses
      },
      tools: [groundingTool],
    });

    const tertiaryResult = await tertiaryModel.generateContent(basePrompt);
    
    // Update status: Response received
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        tertiary: 'processing...'
      });
    }
    
    // Check for cancellation after API call
    if (abortSignal?.aborted) {
      throw new Error("Request cancelled after TERTIARY API call");
    }
    
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
      if (updateLiveStatus) {
        updateLiveStatus(songKey, {
          tertiary: 'success',
          finalBPM: bpm
        });
      }
      return bpm;
    }
    console.log(`❌ TERTIARY failed - invalid BPM: "${bpmText}"`);
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        tertiary: 'failed',
        finalBPM: null
      });
    }
  } catch (tertiaryErr) {
    console.error(`🚨 TERTIARY failed for "${title}":`, tertiaryErr);
    if (updateLiveStatus) {
      updateLiveStatus(songKey, {
        tertiary: 'error',
        finalBPM: null
      });
    }
  }

  // All tiers failed - add error log and return null
  console.error(`❌ ALL TIERS FAILED for "${title}" by ${artist}`);
  
  if (updateLiveStatus) {
    updateLiveStatus(songKey, {
      finalBPM: null
    });
  }
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

async function fetchTemposForTracksWithGemini(tracks, geminiApiKey, addGeminiLog = null, abortSignal = null, updateLiveStatus = null) {
  if (!tracks || tracks.length === 0) return {};
  
  const tempos = {};
  const maxConcurrent = 30; // Maximum concurrent requests
  let currentIndex = 0;
  let activePromises = new Set();
  let completed = 0;

  console.log(`\n� Starting rolling batch processing for ${tracks.length} tracks with max ${maxConcurrent} concurrent requests...`);

  // Function to process a single track
  const processTrack = async (track, index) => {
    const title = track.name;
    const artist = track.artists?.[0]?.name || track.artists?.[0] || 'Unknown Artist';
    
    try {
      const bpm = await getTrackBPMWithGemini(title, artist, geminiApiKey, addGeminiLog, abortSignal, updateLiveStatus);
      if (bpm !== null) {
        tempos[track.id] = bpm;
      }
      
      completed++;
      console.log(`✅ [${completed}/${tracks.length}] "${title}": ${bpm ? `${bpm} BPM` : 'Failed'}`);
      
      return { trackId: track.id, bpm, title, artist, index };
    } catch (error) {
      completed++;
      if (error.message.includes("cancelled")) {
        console.log(`🚫 [${completed}/${tracks.length}] "${title}": Cancelled`);
        return { trackId: track.id, bpm: null, title, artist, cancelled: true, index };
      }
      console.error(`❌ [${completed}/${tracks.length}] "${title}": ${error.message}`);
      return { trackId: track.id, bpm: null, title, artist, index };
    }
  };

  // Start initial batch
  while (currentIndex < tracks.length && activePromises.size < maxConcurrent) {
    if (abortSignal?.aborted) break;
    
    const track = tracks[currentIndex];
    const promise = processTrack(track, currentIndex);
    activePromises.add(promise);
    currentIndex++;
    
    // When this promise completes, start the next track immediately
    promise.finally(() => {
      activePromises.delete(promise);
      
      // Start next track if available and not cancelled
      if (currentIndex < tracks.length && !abortSignal?.aborted) {
        const nextTrack = tracks[currentIndex];
        const nextPromise = processTrack(nextTrack, currentIndex);
        activePromises.add(nextPromise);
        currentIndex++;
        
        nextPromise.finally(() => activePromises.delete(nextPromise));
      }
    });
  }

  // Wait for all active promises to complete
  while (activePromises.size > 0 && !abortSignal?.aborted) {
    await Promise.race(activePromises);
  }

  console.log(`\n🎉 Rolling batch processing completed: ${Object.keys(tempos).length}/${tracks.length} tracks successful`);
  return tempos;
}

// Helper function to filter tracks by BPM range (including half-time and double-time)
function filterTracksByTempo(tracks, tempos, tempoRange) {
  const [minBpm, maxBpm] = tempoRange;
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

// Spotify requires 127.0.0.1 instead of localhost for local development
// For production, use the actual domain
const DEFAULT_REDIRECT = typeof window !== "undefined" ? 
  (window.location.hostname === 'localhost' ? 
    window.location.origin.replace('localhost', '127.0.0.1') : 
    window.location.origin + window.location.pathname) : "";

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

  const [tempoRange, setTempoRange] = useState([150, 170]);
  const [isCustomRangeSelected, setIsCustomRangeSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);
  const [abortController, setAbortController] = useState(null); // For cancelling API requests

  const [candidates, setCandidates] = useState([]); // {id, uri, name, artists:[], tempo}
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState("");

  // Duration-based playlist creation
  const [selectedDuration, setSelectedDuration] = useState(30); // 15, 30, or 60 minutes
  const [playlistOrder, setPlaylistOrder] = useState("recent"); // "recent" or "random"
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
  const [geminiLiveStatus, setGeminiLiveStatus] = useState({}); // Live status table for each song

  // Debug: Watch for changes in geminiLiveStatus
  useEffect(() => {
    console.log('🔄 geminiLiveStatus changed:', geminiLiveStatus);
    console.log('🔄 Number of songs in status:', Object.keys(geminiLiveStatus).length);
  }, [geminiLiveStatus]);

  // Derived tempo values from tempoRange
  const [minTempo, maxTempo] = tempoRange;

  const addLog = (msg) => setLog((l) => [msg, ...l]);
  const addGeminiLog = (logEntry) => setGeminiLogs((logs) => [logEntry, ...logs.slice(0, 49)]); // Keep last 50 entries
  
  // Function to cancel ongoing API requests
  const cancelSearch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      addLog("🚫 Search cancelled by user");
    }
  };
  
  // Function to update live status for a song
  const updateGeminiLiveStatus = (songKey, updates) => {
    console.log('🔄 updateGeminiLiveStatus called:', songKey, updates);
    setGeminiLiveStatus(prev => {
      const newState = {
        ...prev,
        [songKey]: {
          ...prev[songKey],
          ...updates,
          updatedAt: new Date().toLocaleTimeString()
        }
      };
      console.log('🔄 New geminiLiveStatus state:', newState);
      return newState;
    });
  };

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
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5'); // Default to 5 seconds if no header
        addLog("⏱️ Rate limited, waiting " + retryAfter + " seconds...");
        await sleep(retryAfter * 1000);
        // Add extra buffer time after rate limit
        await sleep(2000); // Extra 2 seconds buffer
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

    setLoading(false);
  }

  async function loadPlaylists(maxPlaylists = 100) {
    if (!accessToken) return;
    setLoading(true);
    try {
      const out = [];
      let url = "me/playlists";
      let next = true;
      let requestCount = 0;
      
      while (next && out.length < maxPlaylists) {
        requestCount++;
        addLog(`📋 Loading playlists batch ${requestCount}... (${out.length}/${maxPlaylists})`);
        
        const page = await spGet(url, { limit: 50, offset: out.length }); // Default Spotify limit
        out.push(...page.items);
        next = page.items.length === 20 && out.length < maxPlaylists;
        await sleep(500); // 500ms between each request
      }
      
      if (out.length >= maxPlaylists) {
        addLog(`🛑 Stopped loading playlists at ${out.length} (limit: ${maxPlaylists})`);
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
    // Process playlists one at a time to avoid rate limiting
    const results = [];
    
    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      addLog(`📀 Loading playlist ${i + 1}/${ids.length}...`);
      
      const trackItems = [];
      let offset = 0;
      let more = true;
      while (more) {
        const page = await spGet(`playlists/${pid}/tracks`, { limit: 10, offset }); // Ultra-small batches
        trackItems.push(
          ...page.items
            .filter((it) => it && it.track && it.track.id && !it.is_local)
            .map((it) => it.track)
        );
        more = page.items.length === 10;
        offset += 10;
        await sleep(500); // 500ms between each request
      }
      results.push(...trackItems);
      
      // Long delay between playlists
      if (i < ids.length - 1) {
        await sleep(2000); // 2 seconds between playlists
      }
    }

    return results;
  }

  async function getAllSavedTracks() {
    const items = [];
    let offset = 0;
    let more = true;
    let requestCount = 0;
    
    while (more) {
      requestCount++;
      addLog(`💾 Loading saved tracks batch ${requestCount}...`);
      
      const page = await spGet("me/tracks", { limit: 10, offset }); // Ultra-small batches
      items.push(...page.items.map((it) => it.track).filter((t) => t && t.id && !t.is_local));
      more = page.items.length === 10;
      offset += 10;
      await sleep(500); // 500ms between each request
    }
    return items;
  }

  async function loadCandidates() {
    if (!accessToken) return;
    if (!geminiApiKey) {
      alert("Please enter your Google Gemini API key in Settings first.");
      return;
    }
    
    // Create abort controller for cancelling requests
    const controller = new AbortController();
    setAbortController(controller);
    
    setLoading(true);
    setCandidates([]);
    setCreatedPlaylistUrl("");
    setAllPulledTracks([]);
    setAllAnalyzedTracks([]);
    setGeminiLogs([]); // Clear previous Gemini logs
    setGeminiLiveStatus({}); // Clear previous live status

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
      
      const tempos = await fetchTemposForTracksWithGemini(uniqueTracks, geminiApiKey, addGeminiLog, controller.signal, updateGeminiLiveStatus);
      
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
      const filtered = filterTracksByTempo(withTempo, tempos, tempoRange)
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
      
      addLog(`✅ Found ${filtered.length} tracks in ${tempoRange[0]}-${tempoRange[1]} BPM range (${tempoBreakdown.join(", ")}).`);
      if (withTempo.length > 0) {
        addLog(`📊 Total tracks analyzed: ${withTempo.length}, Tempo range found: ${Math.min(...withTempo.map(t => t.tempo)).toFixed(1)}-${Math.max(...withTempo.map(t => t.tempo)).toFixed(1)} BPM`);
      }
    } catch (e) {
      console.error("Error in loadCandidates:", e);
      
      // Check if it was cancelled
      if (e.name === 'AbortError' || e.message.includes('cancelled')) {
        addLog(`🚫 Search cancelled by user`);
      } else {
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
      }
    } finally {
      setLoading(false);
      setAbortController(null); // Clear abort controller
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
    
    // Create abort controller for cancelling requests
    const controller = new AbortController();
    setAbortController(controller);
    
    // Immediately switch to scanning mode - don't wait for anything
    setLoading(false); // Don't block the UI with loading state
    setCreatedPlaylistUrl("");
    setPlaylistCreationStep("scanning");
    setScannedTracks([]);
    setTotalScannedDuration(0);
    setFinalTrackSelection([]);
    setCurrentSourcePlaylist(null);
    setScanningPhase("primary");
    
    // Start the async process in the background
    (async () => {
      try {
        addLog(`🔍 Finding songs for ${selectedDuration}-minute playlist from most recent additions...`);
        
        // 1. Get the most recent playlist (start with initial 100 playlists)
        if (!playlists.length) {
          setCurrentSourcePlaylist({ name: "Loading playlists...", trackCount: "Unknown" });
          await loadPlaylists(100); // Initial load: 100 playlists max
          if (!playlists.length) {
            addLog("❌ No playlists found. Please load your playlists first.");
            setPlaylistCreationStep("select");
            return;
          }
        }
        
        // Sort playlists based on user preference
        let sortedPlaylists;
        if (playlistOrder === "random") {
          // Randomize playlist order
          sortedPlaylists = [...playlists].sort(() => Math.random() - 0.5);
          addLog(`📋 Starting with ${sortedPlaylists.length} playlists in randomized order, processing in batches of 30...`);
        } else {
          // Sort by most recent (default)
          sortedPlaylists = [...playlists].sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
          addLog(`📋 Starting with ${sortedPlaylists.length} playlists by most recent, processing in batches of 30...`);
        }
        
        // Process playlists in batches of 30 and start BPM analysis immediately
        const playlistBatchSize = 30;
        const targetDurationMs = selectedDuration * 60 * 1000;
        let currentDurationMs = 0;
        let selectedTracks = [];
        let allTracks = [];
        const seenTrackIds = new Set();
        let processedPlaylistCount = 0;
        let firstPlaylistLoaded = false; // Flag to track first successful API response
        let hasRequestedMorePlaylists = false; // Flag to track if we've already requested more playlists
      
      // Function to process a single track for BPM and add to selected tracks if it matches
      const processTrackForSelection = async (track, bpm) => {
        if (currentDurationMs >= targetDurationMs) return false; // Stop if target reached
        
        if (bpm !== null && bpm !== undefined) {
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
              tempoType: tempoType
            };
            
            selectedTracks.push(trackWithTempo);
            currentDurationMs += track.duration_ms || 0;
            
            const currentMinutes = Math.round(currentDurationMs / 60000);
            addLog(`✅ Added "${track.name}" from "${track.sourcePlaylist}" (${displayTempo.toFixed(1)} BPM ${tempoType}) - ${currentMinutes}/${selectedDuration} min`);
            
            // Update state for live progress display
            setScannedTracks([...selectedTracks]);
            setTotalScannedDuration(currentDurationMs / 60000);
            
            return currentDurationMs >= targetDurationMs; // Return true if target reached
          }
        }
        return false;
      };
      
      // Function to process individual tracks immediately as they're loaded
      const processTrackImmediately = async (track) => {
        if (currentDurationMs >= targetDurationMs) return;
        
        try {
          // Process single track immediately
          const bpm = await getTrackBPMWithGemini(
            track.name, 
            track.artists?.[0]?.name || 'Unknown Artist', 
            geminiApiKey, 
            addGeminiLog, 
            controller.signal, 
            updateGeminiLiveStatus
          );
          
          // Add to selection immediately if it matches
          await processTrackForSelection(track, bpm);
        } catch (error) {
          if (!error.message.includes('cancelled')) {
            addLog(`❌ BPM analysis error for "${track.name}": ${error.message}`);
          }
        }
      };
      
      // Process playlists in batches
      for (let batchStart = 0; batchStart < sortedPlaylists.length; batchStart += playlistBatchSize) {
        if (currentDurationMs >= targetDurationMs) {
          addLog(`🎯 Target duration reached! Stopping playlist processing.`);
          break;
        }
        
        const batchEnd = Math.min(batchStart + playlistBatchSize, sortedPlaylists.length);
        const playlistBatch = sortedPlaylists.slice(batchStart, batchEnd);
        
        addLog(`📋 Processing playlist batch ${Math.floor(batchStart/playlistBatchSize) + 1}/${Math.ceil(sortedPlaylists.length/playlistBatchSize)} (${playlistBatch.length} playlists)...`);
        
        // Load tracks from current batch of playlists concurrently
        const playlistPromises = playlistBatch.map(async (playlist, index) => {
          try {
            const globalIndex = batchStart + index + 1;
            addLog(`📋 [${globalIndex}/${sortedPlaylists.length}] Loading tracks from "${playlist.name}"...`);
            
            let allPlaylistTracks = [];
            let offset = 0;
            let hasMore = true;
            
            while (hasMore) {
              const playlistTracksResp = await spGet(`playlists/${playlist.id}/tracks`, { 
                limit: 100, 
                offset: offset 
              });
              
              const tracks = (playlistTracksResp.items || [])
                .filter(item => item && item.track && item.track.id && !item.is_local)
                .map(item => ({
                  ...item.track,
                  added_at: item.added_at,
                  duration_ms: item.track.duration_ms,
                  sourcePlaylist: playlist.name
                }));
              
              // Process each new track immediately (true streaming)
              const newTracks = tracks.filter(track => !seenTrackIds.has(track.id));
              
              // Fire off ALL tracks concurrently - no sequential processing!
              newTracks.forEach(track => {
                seenTrackIds.add(track.id);
                allTracks.push(track);
                
                // Start individual BPM analysis immediately (fire and forget - fully concurrent)
                processTrackImmediately(track);
              });
              
              allPlaylistTracks.push(...tracks);
              hasMore = tracks.length === 100;
              offset += 100;
              
              if (hasMore) {
                await sleep(50);
              }
            }
            
            addLog(`✅ [${globalIndex}/${sortedPlaylists.length}] Loaded ${allPlaylistTracks.length} tracks from "${playlist.name}"`);
            processedPlaylistCount++;
            
            // Set loading to false after 20 playlists have been processed
            if (processedPlaylistCount === 20 && !firstPlaylistLoaded) {
              firstPlaylistLoaded = true;
              setLoading(false);
              addLog(`✅ 20 playlists processed - Find Songs button is now responsive!`);
            }
            
            return {
              playlist,
              tracks: allPlaylistTracks
            };
          } catch (error) {
            addLog(`❌ Failed to load tracks from "${playlist.name}": ${error.message}`);
            return {
              playlist,
              tracks: []
            };
          }
        });
        
        // Wait for current batch to complete before moving to next batch
        await Promise.all(playlistPromises);
        
        addLog(`✅ Completed batch ${Math.floor(batchStart/playlistBatchSize) + 1}/${Math.ceil(sortedPlaylists.length/playlistBatchSize)} - ${processedPlaylistCount} playlists processed, ${selectedTracks.length} tracks selected`);
        
        // Check if we need to load more playlists after processing 80
        if (processedPlaylistCount >= 80 && !hasRequestedMorePlaylists && sortedPlaylists.length < 200) {
          hasRequestedMorePlaylists = true;
          addLog(`🔄 Processed 80+ playlists, loading more playlists for better selection...`);
          
          try {
            const currentPlaylistCount = playlists.length;
            await loadPlaylists(200); // Load up to 200 total playlists
            
            if (playlists.length > currentPlaylistCount) {
              // Update sortedPlaylists with new playlists based on user preference
              if (playlistOrder === "random") {
                sortedPlaylists = [...playlists].sort(() => Math.random() - 0.5);
              } else {
                sortedPlaylists = [...playlists].sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
              }
              addLog(`✅ Loaded ${playlists.length - currentPlaylistCount} additional playlists (total: ${playlists.length})`);
            }
          } catch (error) {
            addLog(`⚠️ Failed to load additional playlists: ${error.message}`);
          }
        }
        
        // Check if we've reached target duration
        if (currentDurationMs >= targetDurationMs) {
          addLog(`🎯 Target duration of ${selectedDuration} minutes reached with ${selectedTracks.length} tracks!`);
          break;
        }
      }
      
      // Wait a bit for any remaining BPM analysis to complete
      addLog(`⏳ Waiting for any remaining BPM analysis to complete...`);
      await sleep(2000); // Give 2 seconds for final analyses to complete
      
      addLog(`🎵 Final result: ${selectedTracks.length} tracks selected from ${allTracks.length} total tracks across ${processedPlaylistCount} playlists`);
      
      // Sort selected tracks by most recent addition for final playlist
      selectedTracks = selectedTracks.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
      
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
          
          // Process saved tracks concurrently
          addLog(`🚀 Processing ${uniqueSavedTracks.length} saved tracks concurrently...`);
          const savedTempos = await fetchTemposForTracksWithGemini(uniqueSavedTracks, geminiApiKey, addGeminiLog, controller.signal, updateGeminiLiveStatus);
          
          // Process results and add matching tracks
          for (const track of uniqueSavedTracks) {
            if (currentDurationMs >= targetDurationMs) {
              addLog(`🎯 Target duration reached!`);
              break;
            }
            
            const bpm = savedTempos[track.id];
            if (bpm !== null && bpm !== undefined) {
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
      setAbortController(null); // Clear abort controller
    }
    })(); // End of async IIFE
    
    // Function returns immediately, processing continues in background
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
          <div className="flex items-center gap-3">
            <img 
              src={import.meta.env.BASE_URL + "image.png"}
              alt="Sporkify" 
              className="w-8 h-8 sm:w-10 sm:h-10"
            />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Sporkify</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">{me ? `Logged in as ${me.display_name || me.id}` : "Authenticated"}</span>
                <Button
  size="sm"
  radius="sm"
  variant="unstyled" // ensures Mantine doesn't override
  styles={{
    root: {
      backgroundColor: 'transparent !important',
      backgroundImage: 'none !important',
      color: 'black !important',
      border: '1px solid black !important',
      transition: 'all 0.2s ease',

      '&:hover': {
        backgroundColor: 'black !important',
        backgroundImage: 'none !important',
        color: 'white !important',
        border: '1px solid black !important',
      },
    },
  }}
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
              <Card
                style={{
                  cursor: 'pointer',
                  backgroundColor: 'var(--mantine-color-text)',
                  transition: 'all 0.2s ease',
                  border: 'none',
                  maxWidth: '40vw'
                }}
                onClick={startSpotifyAuth}
                p="sm"
                withBorder={false}
                className="hover:bg-[var(--mantine-color-gray-1)]"
              >
                <Group justify="center" gap="xs">
                  {/* Spotify Logo SVG */}
                  <svg
                    width="25"
                    height="25"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"
                      fill="var(--mantine-color-body)"
                    />
                  </svg>
                  <Text 
                    size="md" 
                    fw={500}
                    c="var(--mantine-color-body)"
                  >
                    Connect to Spotify
                  </Text>
                </Group>
              </Card>
            )}
          </div>
        </header>

        {/* App Description */}
        <div className="mb-6">
          <Text size="md" className="mx-auto">
            <strong>Sporkify</strong> is an AI playlist generator for athletes who want music that matches their running cadence (strides per minute).
          </Text>
        </div>

       

        {/* Tempo Controls */}
        <div className="mb-6" p="lg" withBorder={false} shadow="none">
          <Title order={3} mb="xs">Strides per Minute (SPM/BPM)</Title>

          <Text size="sm" c="dimmed" fs="italic" mb="md">
              The animations display the approximate stride per tempo or ‘cadence’ of your run.
          </Text>
          
          <Stack gap="md">

            
            
            {/* Preset BPM Ranges */}
            <Group gap="sm" grow>
              {[
                { 
                  min: 130, 
                  max: 150, 
                  label: "130-150"
                },
                { 
                  min: 150, 
                  max: 170, 
                  label: "150-170"
                },
                { 
                  min: 170, 
                  max: 190, 
                  label: "170-190"
                }
              ].map((range) => {
                const isSelected = minTempo === range.min && maxTempo === range.max && !isCustomRangeSelected;
                return (
                  <Card
                    key={range.label}
                    className="transition-all hover:bg-[var(--mantine-color-gray-1)]"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--mantine-color-brand-0)' : undefined,
                      borderColor: isSelected ? 'var(--mantine-color-brand-3)' : undefined,
                      borderWidth: isSelected ? 2 : 1,
                      flex: 1
                    }}
                    onClick={() => {
                      setTempoRange([range.min, range.max]);
                      setIsCustomRangeSelected(false);
                    }}
                    p="md"
                  >
                    {/* Lottie Animation */}
                    <Center>
                        <DotLottieReact
                          src="https://lottie.host/c65134e9-4356-48a5-afb5-6c698694df6b/xAKy7LuIjG.lottie"
                          loop
                          autoplay
                          speed={range.min === 170 ? 1.5 : (range.min === 150 ? 1.2 : 1)}
                          style={{ 
                            width: '100%',
                            maxWidth: '200px',
                            height: 'auto',
                            aspectRatio: '4 / 3',
                            margin: '0 auto',
                            filter: isSelected ? 'none' : 'grayscale(100%)',
                            transform: isSelected ? 'scale(1)' : 'scale(0.8)',
                            transition: 'filter 0.3s ease, transform 0.3s ease'
                          }}
                      />
                    </Center>
                    <Text 
                      size="sm" 
                      fw={500}
                      c={isSelected ? 'brand.7' : undefined}
                      ta="center"
                    >
                      {range.label} SPM
                    </Text>
                  </Card>
                );
              })}
            </Group>

            {/* Custom Range Slider */}
            <Card 
              className="transition-all hover:bg-[var(--mantine-color-gray-1)]"
              style={{
                cursor: 'pointer',
                backgroundColor: isCustomRangeSelected ? 'var(--mantine-color-brand-0)' : undefined,
                borderColor: isCustomRangeSelected ? 'var(--mantine-color-brand-3)' : undefined,
                borderWidth: isCustomRangeSelected ? 2 : 1
              }}
              onClick={() => {
                setIsCustomRangeSelected(true);
              }}
              p="md"
            >
              <Group justify="space-between" mb="sm">
                <Text 
                  size="sm" 
                  fw={500}
                  c={isCustomRangeSelected ? 'brand.7' : undefined}
                >
                  Custom Range:
                </Text>
                <Chip 
                  color={isCustomRangeSelected ? "brand" : "gray"} 
                  variant={isCustomRangeSelected ? "filled" : "light"}
                >
                  {Math.round(minTempo)} - {Math.round(maxTempo)} BPM
                </Chip>
              </Group>
              
              <RangeSlider
                step={0.01}
                min={80}
                max={210}
                value={[Math.round(minTempo), Math.round(maxTempo)]}
                onChange={(value) => {
                  setTempoRange(value);
                  setIsCustomRangeSelected(true);
                }}
                color={isCustomRangeSelected ? "brand" : "gray"}
              />
            </Card>
          </Stack>
        </div>

        {/* Playlist Processing Order */}
        <div className="mb-6" p="lg">
          <Title order={3} mb="md">Playlist Order</Title>
          <Group gap="sm" grow>
            <Card
              className="transition-all hover:bg-[var(--mantine-color-gray-1)]"
              style={{
                cursor: 'pointer',
                backgroundColor: playlistOrder === "recent" ? 'var(--mantine-color-brand-0)' : undefined,
                borderColor: playlistOrder === "recent" ? 'var(--mantine-color-brand-3)' : undefined,
                borderWidth: playlistOrder === "recent" ? 2 : 1,
                flex: 1,
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
              onClick={() => setPlaylistOrder("recent")}
              p="md"
            >
              {/* Recent Image */}
              <Center mb="sm">
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100px', height: '100px' }}>
                  <img 
                    src={import.meta.env.BASE_URL + "Adobe Express - file.png"}
                    alt="Most Recently Added" 
                    style={{ 
                      width: '60px',
                      height: '60px',
                      objectFit: 'contain',
                      filter: playlistOrder === "recent" ? 'none' : 'grayscale(100%)',
                      transform: playlistOrder === "recent" ? 'scale(1)' : 'scale(0.8)',
                      transition: 'filter 0.3s ease, transform 0.3s ease'
                    }}
                  />
                </div>
              </Center>
            </Card>
            <Card
              className="transition-all hover:bg-[var(--mantine-color-gray-1)]"
              style={{
                cursor: 'pointer',
                backgroundColor: playlistOrder === "random" ? 'var(--mantine-color-brand-0)' : undefined,
                borderColor: playlistOrder === "random" ? 'var(--mantine-color-brand-3)' : undefined,
                borderWidth: playlistOrder === "random" ? 2 : 1,
                flex: 1,
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
              onClick={() => setPlaylistOrder("random")}
              p="md"
            >
              {/* Lottie Animation */}
              <Center mb="sm">
                <DotLottieReact
                  src="https://lottie.host/5917647c-35af-4a54-9444-c3992b645ea3/WrdSEbt9KY.lottie"
                  loop
                  autoplay
                  style={{ 
                    width: '80px',
                    height: '80px',
                    filter: playlistOrder === "random" ? 'none' : 'grayscale(100%)',
                    transform: playlistOrder === "random" ? 'scale(1)' : 'scale(0.8)',
                    transition: 'filter 0.3s ease, transform 0.3s ease'
                  }}
                />
              </Center>
              <div>
                <Text 
                  size="md" 
                  fw={500}
                  c={playlistOrder === "random" ? 'brand.7' : undefined}
                  ta="center"
                >
                  Randomize
                </Text>
              </div>
            </Card>
          </Group>
        </div>

        {/* Duration-Based Playlist Creator */}
        <div className="mb-6" p="lg">
          <Title order={3} mb="md">Playlist Length</Title>
          <Stack gap="md">
            
            
            {playlistCreationStep === "select" && (
              <div className="space-y-4">
                <div>
                  <Group gap="sm" grow>
                    {[15, 30, 60].map((duration) => (
                      <Card
                        key={duration}
                        className="transition-all hover:bg-[var(--mantine-color-gray-1)]"
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedDuration === duration ? 'var(--mantine-color-brand-0)' : undefined,
                          borderColor: selectedDuration === duration ? 'var(--mantine-color-brand-3)' : undefined,
                          borderWidth: selectedDuration === duration ? 2 : 1,
                          flex: 1
                        }}
                        onClick={() => setSelectedDuration(duration)}
                        p="md"
                      >
                        <Text 
                          size="sm" 
                          fw={500}
                          c={selectedDuration === duration ? 'brand.7' : undefined}
                          ta="center"
                        >
                          {duration} minutes
                        </Text>
                      </Card>
                    ))}
                  </Group>
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    size="lg"
                    color="brand"
                    disabled={!isAuthed || !geminiApiKey || playlists.length === 0}
                    onClick={findMatchingSongs}
                    loading={loading}
                    style={{ flex: 1 }}
                  >
                    {loading ? "Finding Songs..." : "Find Songs"}
                  </Button>
                  
                  {loading && abortController && (
                    <Button 
                      size="lg"
                      variant="outline"
                      color="red"
                      onClick={cancelSearch}
                      style={{ minWidth: '120px' }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                
                
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
                    Making a {selectedDuration}-minute playlist from your most recent additions
                  </div>
                </div>
                
                {/* Current Source Display */}
                {currentSourcePlaylist && (
                  <Alert color="brand" variant="light">
                    
                    <Stack gap="xs">
                      <Text size="sm" fw={500}>{currentSourcePlaylist.name}</Text>
                      {currentSourcePlaylist.trackCount && (
                        <Text size="xs" c="dimmed">
                          {currentSourcePlaylist.trackCount !== "Unknown" ? `${currentSourcePlaylist.trackCount} tracks` : "Loading track count..."}
                        </Text>
                      )}
                      {currentSourcePlaylist.details && (
                        <Text size="xs" c="dimmed" truncate>
                          {currentSourcePlaylist.details}
                        </Text>
                      )}
                    </Stack>
                  </Alert>
                )}
                
                <Card p="md">
                  <Group justify="space-between" mb="xs">
                    <Text size="sm">Progress:</Text>
                    <Text size="sm" span style={{ fontFamily: 'monospace' }}>
                      {Math.round(totalScannedDuration)}/{selectedDuration} minutes
                    </Text>
                  </Group>
                  <Progress 
                    value={(totalScannedDuration / selectedDuration) * 100}
                    color="brand"
                    size="md"
                  />
                </Card>
                
                {scannedTracks.length > 0 && (
                  <Card p="md">
                    <Text size="sm" fw={500} mb="sm">
                      Found tracks ({scannedTracks.length}):
                    </Text>
                    <ScrollArea style={{ maxHeight: '240px' }} scrollbarSize={8} offsetScrollbars>
                      <Stack gap="xs">
                        {scannedTracks.map((track, i) => (
                          <Paper key={track.id} p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                            <Group justify="space-between" gap="sm">
                              <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                                <img 
                                  src={track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRTlFQ0VGIi8+CjxwYXRoIGQ9Ik0xNSAxMEgxNUMxMi45MTA5IDEwIDExIDExLjkxMDkgMTEgMTRWMjZDMTEgMjguMDg5MSAxMi45MTA5IDMwIDE1IDMwSDI1QzI3LjA4OTEgMzAgMjkgMjguMDg5MSAyOSAyNlYxNEMyOSAxMS45MTA5IDI3LjA4OTEgMTAgMjUgMTBIMTVaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yMCAxN0MyMSAxNyAyMiAxNy44MzkxIDIyIDE5VjIxQzIyIDIyLjE2MDkgMjEgMjMgMjAgMjNDMTkgMjMgMTggMjIuMTYwOSAxOCAyMVYxOUMxOCAxNy44MzkxIDE5IDE3IDIwIDE3WiIgZmlsbD0iIzZCNzI4MCIvPgo8L3N2Zz4K'} 
                                  alt={`${track.album?.name || 'Unknown Album'} cover`}
                                  style={{ 
                                    width: '40px', 
                                    height: '40px', 
                                    borderRadius: '4px',
                                    objectFit: 'cover',
                                    border: '1px solid var(--mantine-color-gray-3)'
                                  }}
                                  onError={(e) => {
                                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRTlFQ0VGIi8+CjxwYXRoIGQ9Ik0xNSAxMEgxNUMxMi45MTA5IDEwIDExIDExLjkxMDkgMTEgMTRWMjZDMTEgMjguMDg5MSAxMi45MTA5IDMwIDE1IDMwSDI1QzI3LjA4OTEgMzAgMjkgMjguMDg5MSAyOSAyNlYxNEMyOSAxMS45MTA5IDI3LjA4OTEgMTAgMjUgMTBIMTVaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yMCAxN0MyMSAxNyAyMiAxNy44MzkxIDIyIDE5VjIxQzIyIDIyLjE2MDkgMjEgMjMgMjAgMjNDMTkgMjMgMTggMjIuMTYwOSAxOCAyMVYxOUMxOCAxNy44MzkxIDE5IDE3IDIwIDE3WiIgZmlsbD0iIzZCNzI4MCIvPgo8L3N2Zz4K';
                                  }}
                                />
                                <Box style={{ minWidth: 0, flex: 1 }}>
                                  <Text size="sm" fw={500} truncate>{track.name}</Text>
                                  <Text size="xs" c="dimmed" truncate>{track.artists?.map(a => a.name || a).join(", ")}</Text>
                                  <Text size="xs" c="dimmed" truncate>{track.album?.name || 'Unknown Album'}</Text>
                                </Box>
                              </Group>
                              <Group gap="xs" style={{ flexShrink: 0 }}>
                                <Chip size="sm" variant="light" color="spotify">
                                  {track.tempo?.toFixed(1)} BPM
                                </Chip>
                                {track.tempoType !== "original" && (
                                  <Text size="xs" c="dimmed">({track.tempoType})</Text>
                                )}
                              </Group>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </ScrollArea>
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
                
                <Card p="md">
                  <Text size="sm" fw={500} mb="md">Selected Songs:</Text>
                  <div style={{ height: '400px', overflow: 'hidden' }}>
                    <ScrollArea 
                      h="100%" 
                      scrollbarSize={8} 
                      offsetScrollbars 
                      scrollHideDelay={500}
                      type="always"
                    >
                      <Stack gap="sm" pb="md">
                        {finalTrackSelection.map((track, i) => (
                          <Paper key={track.id} p="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                            <Group justify="space-between" gap="md">
                              <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ position: 'relative' }}>
                                  <img 
                                    src={track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRTlFQ0VGIi8+CjxwYXRoIGQ9Ik0yNCAxNkgyNEMyMC42ODYzIDE2IDE4IDE4LjY4NjMgMTggMjJWNDJDMTggNDUuMzEzNyAyMC42ODYzIDQ4IDI0IDQ4SDQwQzQzLjMxMzcgNDggNDYgNDUuMzEzNyA0NiA0MlYyMkM0NiAxOC42ODYzIDQzLjMxMzcgMTYgNDAgMTZIMjRaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiAyOEMzNCAyOCAzNiAyOS4zNDMxIDM2IDMxVjMzQzM2IDM0LjY1NjkgMzQgMzYgMzIgMzZDMzAgMzYgMjggMzQuNjU2OSAyOCAzM1YzMUMyOCAyOS4zNDMxIDMwIDI4IDMyIDI4WiIgZmlsbD0iIzZCNzI4MCIvPgo8L3N2Zz4K'} 
                                    alt={`${track.album?.name || 'Unknown Album'} cover`}
                                    style={{ 
                                      width: '56px', 
                                      height: '56px', 
                                      borderRadius: '6px',
                                      objectFit: 'cover',
                                      border: '1px solid var(--mantine-color-gray-3)'
                                    }}
                                    onError={(e) => {
                                      e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRTlFQ0VGIi8+CjxwYXRoIGQ9Ik0yNCAxNkgyNEMyMC42ODYzIDE2IDE4IDE4LjY4NjMgMTggMjJWNDJDMTggNDUuMzEzNyAyMC42ODYzIDQ4IDI0IDQ4SDQwQzQzLjMxMzcgNDggNDYgNDUuMzEzNyA0NiA0MlYyMkM0NiAxOC42ODYzIDQzLjMxMzcgMTYgNDAgMTZIMjRaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiAyOEMzNCAyOCAzNiAyOS4zNDMxIDM2IDMxVjMzQzM2IDM0LjY1NjkgMzQgMzYgMzIgMzZDMzAgMzYgMjggMzQuNjU2OSAyOCAzM1YzMUMyOCAyOS4zNDMxIDMwIDI4IDMyIDI4WiIgZmlsbD0iIzZCNzI4MCIvPgo8L3N2Zz4K';
                                    }}
                                  />
                                  <Chip 
                                    size="xs" 
                                    variant="light"
                                    style={{ 
                                      position: 'absolute', 
                                      top: '-8px', 
                                      left: '-8px',
                                      fontSize: '10px',
                                      height: '20px',
                                      minHeight: '20px'
                                    }}
                                  >
                                    {i + 1}
                                  </Chip>
                                </div>
                                <Box style={{ flex: 1, minWidth: 0 }}>
                                  <Text size="sm" fw={500} truncate>{track.name}</Text>
                                  <Text size="xs" c="dimmed" truncate>
                                    {track.artists?.map(a => a.name || a).join(", ")}
                                  </Text>
                                  <Text size="xs" c="dimmed" truncate>
                                    {track.album?.name || 'Unknown Album'}
                                  </Text>
                                </Box>
                              </Group>
                              <Box style={{ textAlign: 'right', flexShrink: 0 }}>
                                <Group gap="xs" justify="flex-end">
                                  <Chip size="sm" color="spotify" variant="light">
                                    {track.tempo?.toFixed(1)} BPM
                                  </Chip>
                                </Group>
                                {track.tempoType !== "original" && (
                                  <Text size="xs" c="dimmed" mt="xs">
                                    {track.tempoType === "half-time" && (
                                      <span style={{ color: 'var(--mantine-color-brand-6)' }}>½× ({track.originalTempo?.toFixed(1)})</span>
                                    )}
                                    {track.tempoType === "double-time" && (
                                      <span style={{ color: 'var(--mantine-color-orange-6)' }}>2× ({track.originalTempo?.toFixed(1)})</span>
                                    )}
                                  </Text>
                                )}
                                <Text size="xs" c="dimmed" mt="xs">
                                  {Math.round((track.duration_ms || 0) / 1000 / 60)}:{String(Math.round(((track.duration_ms || 0) / 1000) % 60)).padStart(2, '0')}
                                </Text>
                              </Box>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </ScrollArea>
                  </div>
                </Card>
                
                <TextInput
                  label="Playlist name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder={`Smart ${Math.round(finalTrackSelection.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000)}min Mix (${minTempo}-${maxTempo} BPM)`}
                  size="lg"
                  styles={{
                    input: {
                      fontSize: '18px',
                      padding: '16px 20px',
                      minHeight: '60px'
                    },
                    label: {
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '8px'
                    }
                  }}
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
                    color="brand"
                    loading={loading}
                    onClick={createPlaylistFromSelection}
                    style={{ flex: 1 }}
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
                <div className="flex flex-col gap-4 items-center">
                  {createdPlaylistUrl && (
                    <Link 
                      href={createdPlaylistUrl}
                      isExternal
                      showAnchorIcon
                      style={{ textDecoration: 'none' }}
                    >
                      <Button 
                        color="brand"
                        size="lg"
                        style={{ 
                          minWidth: '200px',
                          padding: '16px 24px',
                          fontSize: '16px'
                        }}
                      >
                        🎵 Open in Spotify
                      </Button>
                    </Link>
                  )}
                  <Button 
                    variant="bordered"
                    size="lg"
                    style={{ 
                      minWidth: '200px',
                      padding: '16px 24px',
                      fontSize: '16px'
                    }}
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
              </div>
            )}
          </Stack>
        </div>

        {/* Debug Sections Accordion */}
        <Accordion mb="md" variant="separated">
          <Accordion.Item value="debug-info">
            <Accordion.Control>Debug Information</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
              <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 text-xs font-mono shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300 font-medium">Access Token:</span><br/>
              <span className={accessToken ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {accessToken ? "✓ Active" : "None"}
              </span>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-600/50">
              <span className="text-slate-300 font-medium">Refresh Token:</span><br/>
              <span className={refreshToken ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {refreshToken ? "✓ Available" : "None"}
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

        
          <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-100">🔍 Gemini AI Live Responses with Search Grounding ({geminiLogs.length})</h2>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    setGeminiLogs([]);
                    setGeminiLiveStatus({});
                  }} 
                  className="text-xs px-3 py-1 bg-slate-900/40 border border-slate-600/50 rounded-lg text-slate-200 hover:bg-slate-800/60 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Live Status Table */}
            <div className="mb-6">
              <h3 className="text-md font-bold text-slate-200 mb-3">⚡ Live Processing Status ({Object.keys(geminiLiveStatus).length} songs)</h3>
              {console.log('🔍 Table render - geminiLiveStatus:', geminiLiveStatus)}
              <div className="overflow-x-auto max-h-64 overflow-y-auto bg-slate-900/40 rounded-lg border border-slate-600/50">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="border-b border-slate-600/50">
                      <th className="text-left py-2 px-3 text-slate-300 font-medium">Song</th>
                      <th className="text-center py-2 px-3 text-slate-300 font-medium">Primary</th>
                      <th className="text-center py-2 px-3 text-slate-300 font-medium">Secondary</th>
                      <th className="text-center py-2 px-3 text-slate-300 font-medium">Tertiary</th>
                      <th className="text-center py-2 px-3 text-slate-300 font-medium">Final BPM</th>
                      <th className="text-center py-2 px-3 text-slate-300 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(geminiLiveStatus).length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-4 px-3 text-center text-slate-400 italic">
                          No songs being processed. Click "Test Table" to see sample data.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(geminiLiveStatus).map(([songKey, status]) => {
                        console.log('🔍 Rendering row for:', songKey, status);
                        return (
                          <tr key={songKey} className="border-b border-slate-600/30 hover:bg-slate-800/30">
                            <td className="py-2 px-3 text-slate-200 truncate max-w-xs">
                              {status.songName ? `${status.songName} - ${status.artist}` : songKey}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-200">{status.primary || '-'}</td>
                            <td className="py-2 px-3 text-center text-slate-200">{status.secondary || '-'}</td>
                            <td className="py-2 px-3 text-center text-slate-200">{status.tertiary || '-'}</td>
                            <td className="py-2 px-3 text-center text-slate-200">{status.finalBPM || '-'}</td>
                            <td className="py-2 px-3 text-center text-slate-200">{status.updatedAt || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-xs text-slate-400 space-x-4">
                <span>🔄 <span className="text-yellow-400">Running</span></span>
                <span>✅ <span className="text-emerald-400">Success</span></span>
                <span>❌ <span className="text-orange-400">Failed</span></span>
                <span>🚨 <span className="text-red-400">Error</span></span>
                <span>⏭️ <span className="text-slate-500">Skipped</span></span>
              </div>
            </div>

            {/* Gemini Log Responses */}
            {geminiLogs.length > 0 && (
              <div>
                <h3 className="text-md font-bold text-slate-200 mb-3">📋 Detailed API Responses</h3>
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
              </div>
            )}
          </section>


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
                <div className="w-full mt-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200 text-xs">
                  {clientId ? "✓ Configured" : "Not set"}
                </div>
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
                <div className="w-full mt-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200 text-xs">
                  {geminiApiKey ? "✓ Configured" : "Not set"}
                </div>
              </div>
            </div>
          </div>
        </section>
        

        {/* Debug: Loaded Playlists and Songs Side by Side */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-xl p-4 mb-6 text-xs font-mono shadow-lg">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-100">📊 Loaded Spotify Data</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Playlists List */}
            <div className="bg-slate-900/40 rounded-lg border border-slate-600/50">
              <div className="p-3 border-b border-slate-600/50">
                <h3 className="text-md font-bold text-slate-200">🎵 Playlists ({playlists.length})</h3>
              </div>
              <div className="p-3">
                {playlists.length === 0 ? (
                  <div className="text-center text-slate-400 py-4">
                    No playlists loaded yet
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-auto">
                    {playlists.map((playlist, i) => (
                      <div key={playlist.id} className="bg-slate-800/60 rounded-lg p-2 border border-slate-600/30">
                        <div className="flex items-center gap-2">
                          <div className="bg-slate-700/60 rounded px-2 py-1 text-xs">
                            <span className="text-slate-300 font-bold">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-slate-200">{playlist.name}</div>
                            <div className="text-slate-400 text-xs">
                              {playlist.tracks?.total || 0} tracks • {playlist.owner?.display_name || playlist.owner?.id || 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* All Songs List */}
            <div className="bg-slate-900/40 rounded-lg border border-slate-600/50">
              <div className="p-3 border-b border-slate-600/50">
                <h3 className="text-md font-bold text-slate-200">🎵 All Songs ({allPulledTracks.length})</h3>
                <div className="text-xs text-slate-400 mt-1">From all loaded playlists</div>
              </div>
              <div className="p-3">
                {allPulledTracks.length === 0 ? (
                  <div className="text-center text-slate-400 py-4">
                    No songs loaded yet. Click "Find Songs" to load tracks.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-auto">
                    {allPulledTracks.map((track, i) => (
                      <div key={track.id} className="bg-slate-800/60 rounded-lg p-2 border border-slate-600/30">
                        <div className="flex items-center gap-2">
                          <div className="bg-slate-700/60 rounded px-2 py-1 text-xs">
                            <span className="text-slate-300 font-bold">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-slate-200">{track.name}</div>
                            <div className="truncate text-slate-400 text-xs">
                              {Array.isArray(track.artists) ? track.artists.join(", ") : track.artists?.map(a => a.name || a).join(", ")} • {track.album?.name || track.album}
                            </div>
                            <div className="text-slate-500 text-xs">
                              From: {track.sourcePlaylist || 'Unknown Playlist'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
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
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        
      </div>
    </div>
  );
}
