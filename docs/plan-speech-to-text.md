# Plan: Speech-to-Text & Voice Conversations

## Goal

Enable users to **talk to the agents** — ask questions by voice, hear responses spoken back, and eventually hold a live back-and-forth conversation with the roundtable.

## Current State

| Have | Don't Have |
|---|---|
| ElevenLabs TTS with per-agent voices (6 voice IDs) | No microphone capture anywhere |
| Browser Web Speech API fallback for TTS | No speech recognition |
| `AskTheRoom` text input → starts new session | No mid-session message injection |
| Session transcript playback (play all / per-turn) | No real-time conversational loop |
| `/api/ops/roundtable/ask` endpoint | Rate-limited to 1/60s per IP |
| MP3 caching per session | No streaming audio input/output |

## Architecture: Three Phases

### Phase 1 — Voice Input (STT → Text → Existing Flow)

**Minimal lift.** Replace typing with talking. The submission path stays the same.

**Browser-side STT via Web Speech API:**
- `SpeechRecognition` / `webkitSpeechRecognition` — free, no API keys, works in Chrome/Edge/Safari
- Continuous mode off, single utterance — user clicks mic, speaks, transcript populates the text field
- No server-side STT needed yet

**Changes:**

| File | Change |
|---|---|
| `src/app/stage/AskTheRoom.tsx` | Add mic button next to Submit. On click: start `SpeechRecognition`, on `result` event set textarea value, on `end` auto-focus textarea. Show recording indicator. |
| `src/app/stage/useSpeechRecognition.ts` | **New hook.** Wraps `SpeechRecognition` API. Returns `{ isListening, transcript, start, stop, isSupported }`. Handles browser compat (webkit prefix), error states, permission denied. |

**No backend changes.** The transcribed text flows into the existing `POST /api/ops/roundtable/ask` endpoint.

**Limitations:** One-shot — user asks, agents discuss, no follow-up. Same as typing but hands-free.

---

### Phase 2 — Voice Response Loop (Auto-play TTS on Answer)

**Close the loop.** User speaks a question → agents discuss → response is spoken back automatically.

**Flow:**
1. User taps mic → STT captures question
2. Auto-submits to `/api/ops/roundtable/ask`
3. UI navigates to the new session's transcript (or stays on feed with auto-open)
4. As turns stream in via SSE, auto-speak each turn (existing `autoSpeak` feature in `TranscriptViewer`)
5. When session completes, cache the MP3 (existing caching)

**Changes:**

| File | Change |
|---|---|
| `src/app/stage/AskTheRoom.tsx` | New `voiceMode` toggle. When on: STT auto-submits on speech end, navigates to session, enables `autoSpeak` on the transcript viewer. |
| `src/app/stage/TranscriptViewer.tsx` | Accept `autoSpeakOnMount` prop — when true, enable auto-speak immediately without user clicking the Auto button. |
| `src/app/stage/page.tsx` | Route from AskTheRoom voice submit → open transcript for the new session with autoSpeak enabled. |
| `src/app/api/ops/roundtable/ask/route.ts` | Add `voiceMode: true` to session metadata so the orchestrator can enable TTS synthesis during the live session (streams audio to Discord too). |

**This is already mostly wired.** The `autoSpeak` toggle + SSE turn streaming + per-turn TTS playback exist. Phase 2 is glue.

---

### Phase 3 — Live Conversation (Multi-Turn Voice Chat)

**The real thing.** User and agents take turns in real-time. This requires the most new infrastructure.

#### 3a. New Conversation Format: `voice_chat`

Add to `src/lib/roundtable/formats.ts`:

```
voice_chat: {
    temperature: 0.75,
    minTurns: 4,
    maxTurns: 30,          // longer — user controls when to end
    requiredAgents: [],
    defaultAgents: ['primus', 'chora'],  // start small
    coordinator: null,
    description: 'Live voice conversation with a human participant',
    artifact: null,
}
```

Key difference: the turn loop **pauses** after each agent response, waiting for user input before continuing.

#### 3b. New API: WebSocket or Server-Sent Events + POST

Two options for the real-time channel:

**Option A — SSE + POST (simpler, works today)**
- The existing SSE stream (`/api/ops/events/stream`) already pushes `conversation_turn` events
- Add `POST /api/ops/roundtable/{sessionId}/reply` — injects a user turn into a running session
- Orchestrator polls for user turns between agent turns (or uses a simple in-memory event emitter)
- User turn stored in `ops_roundtable_turns` with `speaker: 'user'`

**Option B — WebSocket (richer, more complex)**
- New `ws://` endpoint for bidirectional audio/text streaming
- Server sends agent audio chunks as they're synthesized
- Client sends STT transcripts (or raw audio for server-side STT)
- More latency-sensitive, harder to deploy behind Next.js

**Recommendation: Option A.** SSE already works. The POST-to-inject pattern is simple and stateless. WebSocket can come later if latency becomes a problem.

#### 3c. Orchestrator Changes

The `orchestrateConversation()` function currently runs a tight loop:

```
for each turn:
    select speaker → generate response → store → next
```

For `voice_chat`, this becomes:

```
for each exchange:
    wait for user turn (POST /reply, with timeout)
    select 1-2 agents to respond
    generate response(s)
    store + emit via SSE
    auto-speak response
    loop (until user says "done" or timeout)
```

**Changes to orchestrator:**

| Area | Change |
|---|---|
| Turn loop | New branch for `voice_chat` format — pauses between agent responses, waits for user input |
| Speaker selection | In voice_chat, 1-2 agents respond per user turn (not full round-robin). Selection based on question content + agent expertise affinity. |
| User turn storage | New speaker type `'user'` in turns table. Display name from session metadata or "You". |
| Timeout | If no user reply within 120s, agent prompts "Are you still there?" — if still nothing after 60s more, session auto-completes. |
| Memory | User turns included in conversation history but NOT in memory distillation (privacy). |

#### 3d. Client-Side Voice Chat UI

New component: `VoiceChat.tsx` (or extend `TranscriptViewer` with a voice input bar)

```
┌─────────────────────────────────────┐
│  SUBCORP — Voice Chat               │
│  ─────────────────────────────────  │
│  [Agent turns appear here as they   │
│   stream in, with auto-speak]       │
│                                     │
│  ─────────────────────────────────  │
│  [ 🎤 Hold to speak ]  [ End Chat ] │
└─────────────────────────────────────┘
```

- Push-to-talk (hold mic button) or toggle mode
- STT runs client-side (Web Speech API)
- On speech end: POST transcript to `/api/ops/roundtable/{sessionId}/reply`
- Agent responses auto-play via existing TTS pipeline
- Visual indicator: which agent is "thinking" / "speaking"

#### 3e. Server-Side STT (Optional, Phase 3+)

If Web Speech API quality isn't sufficient (or for non-Chrome browsers):

- **Whisper API** (OpenAI) or **Deepgram** — both accept raw audio, return transcript
- New route: `POST /api/stt/transcribe` — accepts audio blob, returns `{ text }`
- Client records audio via `MediaRecorder` API, sends blob
- More reliable than browser STT, but adds latency (~1-2s) and cost

Not needed for v1 — Web Speech API is good enough for English.

## Migration Path

| Phase | Scope | Dependencies |
|---|---|---|
| **1** | Mic button on AskTheRoom | None — browser API only |
| **2** | Auto-speak responses | Phase 1 + minor glue code |
| **3a** | `voice_chat` format | DB migration (add format), orchestrator changes |
| **3b** | Reply injection endpoint | New API route, orchestrator pause/resume logic |
| **3c** | Voice chat UI | Phase 3a + 3b |
| **3d** | Server-side STT | Optional — only if browser STT quality is insufficient |

## Open Questions

1. **Agent count in voice chat** — Should the user pick agents, or auto-select based on question topic? Leaning toward: let user choose 1-3, default to primus + one other.

2. **Rate limiting** — Current `/ask` endpoint is 1/60s. Voice chat needs a different rate model. Per-session rate (e.g., 1 reply per 5s) instead of per-IP global cooldown.

3. **Privacy** — User voice audio: process client-side only (Phase 1-3), or send to server for Whisper STT? If server-side, need to decide retention policy. Recommendation: client-side STT only for now, delete nothing because we store text not audio.

4. **Discord integration** — Should voice chat turns post to Discord? Probably yes (text only, not audio), with a `[VOICE CHAT]` tag. User turns shown as "Audience" or anonymous.

5. **Concurrent voice chats** — Allow multiple users to voice-chat simultaneously? Each gets their own session, so yes — but need to ensure the worker can handle multiple paused sessions without blocking.

## Cost Estimate

| Component | Cost |
|---|---|
| Browser STT | Free (Web Speech API) |
| ElevenLabs TTS per turn | ~$0.002-0.005 per agent response (~100-300 chars) |
| LLM per agent turn | ~$0.001-0.01 depending on model |
| Full voice chat (20 exchanges) | ~$0.10-0.30 total |
| Server-side STT (Whisper, if added) | ~$0.006/min |
