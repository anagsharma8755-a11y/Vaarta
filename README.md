# VAARTA — interview practice

React/Vite frontend with a local Node service for real NVIDIA transcription and transcript-based interview coaching. There is no demo feedback path.

## Run

Use Node 22+ and two terminals:

```sh
npm install
# Copy server/.env.example to server/.env; set NVIDIA_API_KEY there.
npm run server
```

```sh
npm run dev
```

Open http://127.0.0.1:5173. The server listens only on 127.0.0.1:4000; Vite proxies /api to it. Keys stay server-side. Never use a VITE_ prefix for credentials. server/.env is excluded from Git and is reread for each request, so saving a corrected key does not require restarting.

## Real analysis flow

Setup → record three answers → NVIDIA Whisper transcription → NVIDIA Nemotron content feedback → one report per answer.

- The existing English/Hindi questions are reused for every type and difficulty. Selections are preserved; type/difficulty do not change the current question bank or rubric. Other language choices translate only parts of the landing page/navigation.
- Each answer has a two-minute recording limit. Microphone permission races, errors, cancellation and unmount release browser resources. Actual recording MIME is preserved during capture.
- Web Audio decodes the real recording format and converts it to mono 16-bit PCM WAV at 16 kHz. Both client and server reject too-short, silent or very quiet recordings. This is an amplitude gate, not reliable voice-activity detection: background noise can pass. Empty transcription or a no-answer model response requires recording that question again.
- Audio is sent to NVIDIA after question 3. The local service does not write recordings or transcripts to disk. Audio stays in page memory until exit; feedback is held in browser navigation state, not durable storage. NVIDIA receives the recordings/transcripts for processing.
- Content scores are model-generated coaching estimates using relevance, specificity and structure. They are not objective measurements. Delivery score, fillers, pauses and pace are explicitly null and shown as Not measured. Answer duration comes from decoded audio. Transcription may be inaccurate.
- No recorded answers means no feedback. Missing, malformed, cancelled or failed analysis never substitutes sample results. Successful per-answer results are cached in page memory so retry skips completed answers. There is no durable server idempotency.

## API and provider configuration

POST /api/analyze accepts multipart fields audio (canonical WAV) and question, one of each. The existing feedback fields are validated in shared/feedback.js; unavailable measurements are nullable. Successful results also identify provider=nvidia and analysisKind=transcript. Errors use {error: {code, message}}.

GET /api/status reports whether a key is configured, not whether NVIDIA has accepted it. Real access is checked on submission. The server limits uploads to 4 MiB, two concurrent requests, 60 seconds for transcription and 110 seconds overall. The client times out at 120 seconds and cancels on exit. Foreign browser origins are rejected. This local service is not a public production API.

Defaults are NVIDIA-hosted Whisper large-v3 via Riva gRPC and nvidia/nemotron-3.5-lightning-30b-a3b via HTTPS. Override NVIDIA_ASR_FUNCTION_ID and NVIDIA_CHAT_MODEL only with compatible NVIDIA models. Official references:

- https://build.nvidia.com/openai/whisper-large-v3/api
- https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b
- server/proto/README.md records the pinned NVIDIA Riva protocol source and licenses.

The two gRPC packages are server dependencies; neither is imported into the browser bundle.

## Verification

```sh
npm test
npm run build
```

Native Node tests cover recorder lifecycle, format preservation, timeout/cancellation, setup normalization, API errors/validation, silence rejection before provider calls, nullable measurements, origin restrictions and invalid model output. Provider doubles in tests are not runtime fallback data. No lint or type-check scripts exist.

## Remaining production work

Public deployment/API routing, authentication, abuse controls and per-user quotas, durable jobs/idempotency, storage and retention policy, observability, cross-browser microphone testing, robust voice-activity detection, verified delivery measurements, expanded question banks and complete localization remain unimplemented. Supabase and Vercel integration are not added. A frontend build alone does not deploy this Node/gRPC service.

## Spoken interviewer questions

Set ELEVENLABS_API_KEY in server/.env. ELEVENLABS_VOICE_ID optionally selects an account-accessible voice; the default is the standard George voice. Questions use ElevenLabs eleven_multilingual_v2 and MP3 output. No ElevenLabs SDK or additional dependency is installed.

Each question automatically requests playback in its selected English/Hindi language. If browser autoplay is blocked, press Play question. Stop question audio releases playback immediately. The microphone is disabled while speech is loading or playing; recording still starts only through the microphone control. Voice failure offers retry and leaves the written question available. This is a spoken version of the existing questions, not a real-time conversational agent with dynamic follow-up questions.

POST /api/question-audio?question=0&language=en accepts only indices 0–2 and en/hi, then retrieves the corresponding repository question on the server. Arbitrary text cannot be submitted for synthesis. Only question text is sent to ElevenLabs; answer recordings continue to use NVIDIA. Voice generation has a 30-second timeout. The browser caches question audio for replay while the interview component remains mounted and releases object URLs, audio and pending requests on exit.

Official API: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
