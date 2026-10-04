# NugNotes — spec (Oct 4, 2026)

Written by Coru with Nae.
ChaosPatch project: `nugnotes` (5 patches).

## What it is
A separate study app forked from ScribeCat-v3 with all audio removed. It takes ScribeCat's place in Nae's life (she no longer uses ScribeCat because recording lectures is a legal grey area). ScribeCat itself stays as-is for anyone still using it.

The name: "Nug" is Nugget, Nae's cat, who is also the app's AI (Nugget chat). ScribeCat's existing `nuggetNotes` module fits the name directly.

## Why a fork, not Folio
- The must-haves are nearly all of ScribeCat minus the microphone; porting them into Folio (Next.js + SuperDoc) would be a rebuild.
- Folio stays a writing space.
- A "no-recording mode" inside ScribeCat itself was ruled out.

## Decisions (Nae, Oct 4)
- Separate app, forked from ScribeCat-v3, treated as a clean break (no syncing back).
- Keep the cats: Nugget AI chat, cat companion, study-buddy easter egg.
- Extras coming along: friends + messaging, handwriting canvas, session sharing.
- NOT coming along: StudyQuest (XP, shop, adoption), and everything audio.
- Start fresh: own Convex deployment, no import of ScribeCat data.

## Keep
- Study and exam rooms (studyRooms, examRooms, roomNotes, examChat, examSimulation, examGames, examBrain)
- Study tools and quizzes (studyTools, studyGames, weakSpots)
- AI summaries and Nugget chat (nuggetChat, nuggetNotes)
- File uploads (document-upload, parseDocument, r2)
- Themes and easter eggs (theme-provider, easter-eggs/)
- Friends + messaging, handwriting canvas, session sharing
- The notes editor becomes the main way to create a session, alongside uploads

## Strip
- Recording, transcription, live transcript, waveform, speaker detection, transcript segments, audio storage/cleanup/retention, recording consent and navigation guards, file-upload-transcribe
- StudyQuest (studyQuest, shop, inventory, xpUtils, productivity if XP-only)

## Known dependencies to resolve
- The study-buddy easter egg shows the user's adopted cat from StudyQuest (api.studyQuest.getCatState). With StudyQuest gone, it needs a "pick your study buddy" setting that keeps the cat variants without XP or a shop.
- Study tools, summaries and Nugget chat were built around lecture transcripts. Each must work from typed notes, handwriting and uploaded documents; transcript-only code paths need a notes/document source.

## Branding
- Logo: illustrated Nugget (gray tabby, green eyes, green collar with a green charm), mid-meow, bursting out of a psychedelic swirl in sage greens, dusty rose, lavender and cream. Attached to the branding patch in ChaosPatch.
- Needs a cat-only cutout for small icon sizes; consider pulling the swirl's colors into the theme (contrast-checked).

## Infra
- ScribeCat-v3 is Vite + React + Convex on Cloudflare (wrangler.jsonc), matching the "new projects on Cloudflare Workers" rule.
- New Convex deployment; own R2 bucket; Clerk instance to confirm with Nae.

## Patch order
1. Fork + rename + strip audio and StudyQuest; runs with notes-only sessions
2. Study tools / summaries / Nugget chat on notes and uploads
3. Study buddy without StudyQuest
4. Branding: logo, favicon, PWA icons, landing page
5. Deploy to Cloudflare with fresh Convex + Clerk
