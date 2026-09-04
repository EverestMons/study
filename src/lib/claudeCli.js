import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCliPath } from './db.js';

export async function resolveCliPath() {
  const stored = await getCliPath();
  if (stored) return stored;
  return await discoverCliPath();
}

export async function discoverCliPath() {
  try {
    const result = await invoke('claude_cli_discover');
    return result || null;
  } catch {
    return null;
  }
}

export async function testCliConnection(path) {
  try {
    const result = await invoke('claude_cli_probe', { path });
    return {
      valid: result.status === 'ok',
      version: result.version,
      authMethod: result.auth_method,
      subscriptionType: result.subscription_type,
      error: result.status === 'ok' ? null : result.message,
    };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

export function flattenMessages(messages) {
  if (!messages || messages.length === 0) return '';
  if (messages.length === 1) {
    const content = messages[0].content;
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
  const history = messages.slice(0, -1).map(m => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${role}: ${content}`;
  }).join('\n');
  const latest = messages[messages.length - 1];
  const latestContent = typeof latest.content === 'string' ? latest.content : JSON.stringify(latest.content);
  return `CONVERSATION HISTORY:\n${history}\n---\nCurrent message: ${latestContent}`;
}

export function parseResultJson(stdout) {
  try {
    const result = JSON.parse(stdout.trim());
    if (result.is_error) {
      return `Error: CLI API error ${result.api_error_status || ''}: ${result.result || 'Unknown error'}`.trim();
    }
    let text = result.result || 'No response.';
    if (result.stop_reason === 'max_tokens') {
      text += '\n\n[Response may be incomplete — output limit reached]';
    }
    return text;
  } catch {
    return stdout;
  }
}

// maxTokens has no CLI equivalent — accepted and ignored
export async function callClaudeCLI(system, messages, maxTokens, useHaiku = false) {
  const path = await resolveCliPath();
  if (!path) return "Error: Claude CLI not found. Set the CLI path in Settings.";

  const model = useHaiku ? 'haiku' : 'sonnet';
  const prompt = flattenMessages(messages);

  try {
    const stdout = await invoke('claude_cli_invoke', { path, system, prompt, model });
    return parseResultJson(stdout);
  } catch (e) {
    return `Error: ${e}`;
  }
}

// maxTokens (4th arg) has no CLI equivalent — callers pass it but JS ignores the extra positional arg
export async function callClaudeStreamCLI(system, messages, onChunk) {
  const path = await resolveCliPath();
  if (!path) {
    const error = "Error: Claude CLI not found. Set the CLI path in Settings.";
    onChunk(error);
    return error;
  }

  const model = 'sonnet';
  const prompt = flattenMessages(messages);
  const requestId = crypto.randomUUID();

  let full = '';
  let stopReason = null;
  let unlisten = null;
  let unlistenEnd = null;
  let unlistenError = null;
  let overallTimer = null;
  let stallTimer = null;
  let settled = false;

  const cleanup = () => {
    if (overallTimer) { clearTimeout(overallTimer); overallTimer = null; }
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    if (unlisten) { unlisten(); unlisten = null; }
    if (unlistenEnd) { unlistenEnd(); unlistenEnd = null; }
    if (unlistenError) { unlistenError(); unlistenError = null; }
  };

  try {
    let resolveStream, rejectStream;
    const streamDone = new Promise((res, rej) => {
      resolveStream = res;
      rejectStream = rej;
    });

    const resetStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        invoke('claude_cli_cancel', { requestId }).catch(() => {});
        if (full) {
          full += '\n\n[Response may be incomplete — connection timed out]';
          resolveStream();
        } else {
          rejectStream(new Error('Stream stalled - no data for 30 seconds'));
        }
      }, 30000);
    };

    // Register listeners BEFORE invoking the command
    unlisten = await listen('claude-cli-stream', (event) => {
      if (event.payload.request_id !== requestId) return;
      resetStall();
      try {
        const parsed = JSON.parse(event.payload.line);
        if (parsed.type === 'stream_event' &&
            parsed.event?.type === 'content_block_delta' &&
            parsed.event?.delta?.type === 'text_delta') {
          full += parsed.event.delta.text;
          onChunk(full);
        }
        if (parsed.type === 'result' && parsed.stop_reason) {
          stopReason = parsed.stop_reason;
        }
      } catch {
        // Skip unparseable lines
      }
    });

    unlistenEnd = await listen('claude-cli-stream-end', (event) => {
      if (event.payload.request_id !== requestId) return;
      if (!settled) { settled = true; resolveStream(); }
    });

    unlistenError = await listen('claude-cli-error', (event) => {
      if (event.payload.request_id !== requestId) return;
      if (!settled) { settled = true; rejectStream(new Error(event.payload.error)); }
    });

    // 2-minute overall timeout
    overallTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      invoke('claude_cli_cancel', { requestId }).catch(() => {});
      if (full) {
        full += '\n\n[Response may be incomplete — connection timed out]';
        resolveStream();
      } else {
        rejectStream(new Error('Request timed out. Please try again.'));
      }
    }, 120000);

    // Now invoke the command (returns immediately after spawning)
    await invoke('claude_cli_stream', { path, system, prompt, model, requestId });
    resetStall();

    await streamDone;
    cleanup();

    if (stopReason === 'max_tokens') {
      full += '\n\n[Response may be incomplete — output limit reached]';
    }
    return full || 'No response.';
  } catch (e) {
    cleanup();
    console.error('Stream CLI:', e);
    if (full) return full;
    return 'Error: ' + (e.message || e);
  }
}
