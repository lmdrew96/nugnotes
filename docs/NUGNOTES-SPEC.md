# NugNotes — Spec v2: paper notes that connect (Nov 4, 2026)

*Replaces the Oct 4 "no-audio ScribeCat fork" spec (see git history for v1). Status: open questions answered and 8 patches filed in ChaosPatch on Nov 4, all tagged `paper-v2`.*

## One line
Photograph your handwritten class notes. NugNotes transcribes them, ties sessions together across the semester, shows what keeps coming back, what was mentioned but never explained (**whiskers**), and what doesn't match. Then Nugget quizzes you from it.

## Why it exists
- Nae takes notes **on paper only**. A typed-notes study app solves a problem she doesn't have.
- Each session's notes sit alone on paper. Nothing shows that Week 3 and Week 9 were talking about the same thing.
- This is **Vertexism for coursework**: the value is in the edges between sessions, not in any one page.
- Finals are about 5 weeks out, so it should pay off right away (cut input, pay off right away).

## Core rules (adapted from Ghostlight)
1. **Paper is the original.** The app keeps the photo and a faithful transcript. Claude never rewrites, summarizes over, or "cleans up" Nae's notes.
2. **Everything Claude adds is a separate layer.** Links, threads, whiskers and contradictions sit beside the notes, never inside them.
3. **Every claim points back to a page.** Each link, whisker or contradiction shows the lines (and photo or document page) it came from.
4. **No manual linking.** Claude links things automatically; Nae dismisses wrong ones. Nothing needs confirming before it shows up.
5. **Capture takes under ~10 seconds a page.** If it's slower, she'll stop.

## The loop
1. After class: open NugNotes on the phone → pick the course (date defaults to today) → shoot the pages → done.
2. Claude transcribes the pages, then reads the session against the earlier sessions in that course.
3. The course view updates: new concepts, threads that grew, new whiskers, any contradictions.
4. Before an exam: open a thread or the course map → review → Nugget quizzes you.

## Features

### 1. Capture a session
- A **session** = one class meeting: a stack of page photos plus course and date.
- Phone camera first (PWA). Multi-page shooting in one go; reorder or retake a page.
- Add a page to an earlier session later (forgot a page).
- Transcription is faithful: keeps Nae's abbreviations, arrows, crossed-out bits marked as such. Unreadable words get flagged `[?]`, not guessed.
- Nae can fix a transcript line by hand. That's the only editing.

### 2. Readings and slides
- Upload a PDF (slides, a reading) into a course as its own **source**, dated like a session.
- Sources join the same threads as handwritten sessions, so a concept's timeline can show "lecture, Week 4" next to "Ch. 6 reading".
- A source can **answer a whisker**: "never defined in your notes → defined on p. 112 of the reading."
- Sources are shown as quoted text from the document; Claude doesn't summarize them into the notes layer.

### 3. Concepts and threads
- Claude pulls **concepts** from each session and source (terms, people, theories, examples, dates).
- A **thread** = one concept across sessions, shown as a timeline: "morpheme: sessions 2, 5, 11", each with the line that mentioned it.
- Same concept under different wording gets merged; Nae can split a bad merge.

### 4. Whiskers 🐱 (the study version of Ghostlight's ghosts)
*Named by Nae, Nov 4, 2026.* Things the notes point at but never fill in:
- A term used but never defined
- "Will come back to this" / "see reading" / "on the exam" that never got followed up
- A question Nae wrote in the margin with no answer later
- Each whisker shows its source lines. It gets **answered** (by a later page, an uploaded source, or a note from Nae) or **dismissed**.
- Whiskers double as a "things to ask in office hours / before the exam" list.

### 5. Contradictions
- When two sessions (or a session and a source) disagree on a definition, date or claim, show both lines side by side.
- Nae picks which is right, or marks "ask the professor". Neither page is ever edited.

### 6. Course map
- A per-course graph: concepts as nodes, sessions as the time axis, edges where concepts show up together.
- A map to **visit**, not where she works. The thread and session views are the main surfaces.

### 7. Study with Nugget
- Quiz from a thread, a session range ("Weeks 6–10"), or the whole course.
- Questions are built from Nae's own lines (and sources), and each answer shows the page it came from.
- Whiskers can feed "you never wrote down what X means; do you know it?" questions.
- Keeps the existing study buddy (pick your cat and name, v0.5.0).

### 8. Cross-course links (later, not the MVP)
- The Vertexism payoff: a Latin morphology note lighting up next to a LING concept.
- Waits until the per-course loop has proven itself.

## Decisions (Nae, Nov 4, 2026)
- **Typed notes: removed.** Take out the BlockNote notes editor; no typed sessions.
- **Readings/slides: yes**, as uploaded sources inside a course (feature 2).
- **Study rooms with classmates: parked.** Hide them from the UI; keep the code for now rather than deleting it.
- **Test course: PSYC 100.** Backfill this semester's PSYC 100 pages as the first real run.
- **"Ghosts" are called whiskers** in NugNotes.
- **Transcripts: one line per item** (Nov 5): a bullet that wraps on paper stays one line; structure marks keep headings, columns, boxes, diagrams and margin notes.
- **Sonnet for connections** (Nov 5): concepts, whiskers/contradictions and the course quiz use Sonnet.

## Build on the existing repo
NugNotes is already at **v0.9.0** (Oct 5): study buddy picker, Swirl theme and animated backgrounds, branding, plus the BlockNote editor and study rooms (now being removed / parked). Build the paper layer **into this repo**, don't start over.
- Stack stays: Vite + React + Convex on Cloudflare (wrangler.jsonc), R2 for photos and PDFs.
- Borrow Ghostlight's **pattern and prompts** (extract → link → gaps → contradictions, each backed by a quote), not its code. Ghostlight is Next.js + Neon, so the code doesn't transfer.
- Models: Haiku 5.5 / Sonnet 5.5 via the constants in `convex/config.ts`. Transcription, concepts, whiskers/contradictions and the course quiz all run on Sonnet (Nae, Nov 5, 2026); Haiku stays on the older per-session study tools and chat.

## Patches (ChaosPatch `nugnotes`, tag `paper-v2`, in order)
1. Clean-out: remove the BlockNote typed-notes editor; hide study rooms (park, don't delete)
2. Courses + sessions + photo capture (phone, multi-page, R2) — no AI yet
3. Faithful transcription per page, with `[?]` flags and hand-fix
4. PDF sources in a course (slides/readings)
5. Concept extraction + threads within a course
6. Whiskers + contradictions, each backed by source lines; sources can answer whiskers
7. Nugget quiz from threads, session ranges and whiskers
8. Backfill test: PSYC 100's semester so far

## History
- Oct 4, 2026: v1 — NugNotes as a no-audio fork of ScribeCat-v3 with typed notes (study/exam rooms, quizzes, Nugget chat, themes; StudyQuest and audio stripped). Built to v0.9.0 Oct 4–5.
- Nov 4, 2026: v2 — Nae only takes notes on paper now → reframed around photographed handwritten notes and connections between sessions.
