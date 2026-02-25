import { getApiKey } from './db.js';

// --- Tauri HTTP client for API calls ---
let tauriFetch = null;
const initTauriFetch = async () => {
  if (tauriFetch) return tauriFetch;
  try {
    const { fetch: tf } = await import("@tauri-apps/plugin-http");
    tauriFetch = tf;
    return tf;
  } catch (e) {
    console.log("Tauri HTTP not available, using browser fetch");
    return fetch;
  }
};

// --- Model Constants ---
export const MODEL_SONNET = "claude-sonnet-4-20250514";
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";

// --- Claude API ---
export const callClaude = async (system, messages, maxTokens, useHaiku = false) => {
  const apiKey = getApiKey();
  if (!apiKey) return "Error: No API key set. Go to Settings to add your Anthropic API key.";
  const httpFetch = await initTauriFetch();
  const model = useHaiku ? MODEL_HAIKU : MODEL_SONNET;
  try {
    const r = await httpFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens || 8192,
        system,
        messages
      }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    // Check if response was truncated
    if (d.stop_reason === "max_tokens") {
      console.warn("Response truncated due to max_tokens limit");
    }
    return d.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "No response.";
  } catch (e) {
    console.error("API:", e);
    return "Error: " + e.message;
  }
};

// Streaming version for chat -- calls onChunk with partial text as tokens arrive
export const callClaudeStream = async (system, messages, onChunk, maxTokens) => {
  const apiKey = getApiKey();
  if (!apiKey) return "Error: No API key set. Go to Settings to add your Anthropic API key.";

  const httpFetch = await initTauriFetch();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

  try {
    const r = await httpFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens || 16384,
        system,
        messages,
        stream: true
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!r.ok) {
      var errBody = await r.text();
      throw new Error("API " + r.status + ": " + errBody.substring(0, 200));
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    let stopReason = null;
    let lastChunkTime = Date.now();

    while (true) {
      // Add per-chunk timeout (30 seconds of no data = stalled)
      const readPromise = reader.read();
      const chunkTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Stream stalled - no data for 30 seconds")), 30000)
      );

      let result;
      try {
        result = await Promise.race([readPromise, chunkTimeout]);
      } catch (e) {
        console.warn("Stream timeout, returning partial response");
        break;
      }

      const { done, value } = result;
      if (done) break;
      lastChunkTime = Date.now();
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      var lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (var line of lines) {
        if (!line.startsWith("data: ")) continue;
        var data = line.substring(6).trim();
        if (data === "[DONE]") continue;
        try {
          var evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            full += evt.delta.text;
            onChunk(full);
          }
          if (evt.type === "message_delta" && evt.delta?.stop_reason) {
            stopReason = evt.delta.stop_reason;
          }
          if (evt.type === "error") {
            throw new Error(evt.error?.message || "Stream error");
          }
        } catch (parseErr) {
          // Skip non-JSON lines (event type lines, etc.)
          if (data !== "[DONE]" && !data.startsWith("{")) continue;
        }
      }
    }
    if (stopReason === "max_tokens") {
      console.warn("Stream response truncated due to max_tokens limit");
    }
    return full || "No response.";
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.error("Stream API timeout after 2 minutes");
      return "Error: Request timed out. Please try again.";
    }
    console.error("Stream API:", e);
    return "Error: " + e.message;
  }
};

// --- JSON Extractor ---
export const extractJSON = (text) => {
  try { return JSON.parse(text); } catch {}
  const m1 = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) try { return JSON.parse(m1[1].trim()); } catch {}
  const m2 = text.match(/\[[\s\S]*\]/);
  if (m2) try { return JSON.parse(m2[0]); } catch {}
  const m3 = text.match(/\{[\s\S]*\}/);
  if (m3) try { return JSON.parse(m3[0]); } catch {}

  // Try to repair truncated JSON arrays by finding last complete object
  const arrayMatch = text.match(/\[\s*\{[\s\S]*/);
  if (arrayMatch) {
    let jsonStr = arrayMatch[0];
    // Find all complete objects (ending with })
    const objects = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (jsonStr[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          try {
            const obj = JSON.parse(jsonStr.substring(start, i + 1));
            objects.push(obj);
          } catch {}
          start = -1;
        }
      }
    }
    if (objects.length > 0) {
      console.log("Recovered " + objects.length + " objects from truncated JSON");
      return objects;
    }
  }

  return null;
};
