import { LegalDocModal } from '@/components/legal-doc-modal';
import { SignIn } from '@clerk/clerk-react';
import { useState } from 'react';
import privacyContent from '../../../docs/PRIVACY_POLICY.md?raw';
import tosContent from '../../../docs/TERMS_OF_SERVICE.md?raw';
import { CatDisplay } from './cats/cat-display';

const HERO_CATS: Array<{ variant: 'grey' | 'bengal' | 'siamese' | 'wizard' | 'tricolor' }> = [
  { variant: 'grey' },
  { variant: 'bengal' },
  { variant: 'siamese' },
  { variant: 'wizard' },
  { variant: 'tricolor' },
];

const FEATURES = [
  {
    emoji: '📝',
    title: 'Write It Your Way',
    desc: 'Type notes, sketch by hand, or snap a photo of the whiteboard. Every session saves itself.',
    color: 'from-[var(--landing-teal-soft)]/20 to-[var(--landing-teal-deep)]/20',
    border: 'border-[var(--landing-teal-soft)]/30',
  },
  {
    emoji: '✨',
    title: 'Nugget Drafts Notes',
    desc: "Upload a PDF or a photo and Nugget turns it into organized notes you can edit. The cat's got you.",
    color: 'from-[var(--landing-amber)]/20 to-[var(--landing-purple-dusty)]/20',
    border: 'border-[var(--landing-amber)]/30',
  },
  {
    emoji: '📖',
    title: 'Study Smarter',
    desc: 'Generate flashcards, quizzes, concept maps, and ELI5 breakdowns from your notes in one click.',
    color: 'from-[var(--landing-green)]/20 to-[var(--landing-teal-deep)]/20',
    border: 'border-[var(--landing-green)]/30',
  },
  {
    emoji: '💬',
    title: 'Ask Nugget Anything',
    desc: 'Confused about something? Ask the AI chat. It reads your notes.',
    color: 'from-[var(--landing-lavender)]/10 to-[var(--landing-purple-deep)]/20',
    border: 'border-[var(--landing-lavender)]/20',
  },
  {
    emoji: '🎮',
    title: 'Study Together',
    desc: 'Create study rooms, share sessions, and battle friends in live quiz games. Learning is better with chaos.',
    color: 'from-[var(--landing-amber)]/20 to-[var(--landing-green)]/10',
    border: 'border-[var(--landing-amber)]/25',
  },
] as const;

export function LandingPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [showTos, setShowTos] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  if (showSignIn) {
    return (
      <div className="app-bg-orbs flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <button
          type="button"
          onClick={() => setShowSignIn(false)}
          className="glass-light glass-enter text-foreground/70 hover:text-foreground rounded-full px-4 py-1.5 text-sm transition-all hover:scale-105"
        >
          ← back to home
        </button>
        <div className="glass-enter">
          <SignIn />
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg-orbs min-h-screen overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="glass-light sticky top-0 z-50 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <img
            src="/nuggy-baby-boy.png"
            alt="Nugget"
            className="size-8 drop-shadow-sm"
            style={{ imageRendering: 'pixelated' }}
          />
          <span className="text-foreground font-semibold tracking-tight">NugNotes</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSignIn(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-5 py-2 text-sm font-medium transition-all hover:scale-105 hover:shadow-lg"
        >
          Sign in
        </button>
      </nav>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center gap-8 px-6 pb-16 pt-20 text-center">
        {/* Floating cats row */}
        <div className="flex items-end gap-6">
          {HERO_CATS.map((cat, i) => (
            <div
              key={cat.variant}
              className="glass-enter"
              style={{
                transform: `scale(1.25) translateY(${i % 2 === 0 ? '0px' : '-2px'})`,
                imageRendering: 'pixelated',
                animationDelay: `${i * 0.08}s`,
              }}
            >
              <CatDisplay
                mood={i === 1 ? 'excited' : i === 3 ? 'happy' : 'studying'}
                variant={cat.variant}
                size="large"
              />
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="glass text-primary rounded-full px-4 py-1 text-xs font-medium uppercase tracking-widest">
            ADHD-Friendly Study Companion
          </div>

          <h1 className="text-foreground max-w-2xl text-5xl leading-tight font-bold tracking-tight sm:text-6xl">
            Your notes,{' '}
            <span
              className="inline-block"
              style={{ color: 'var(--primary)', textShadow: '0 0 30px var(--record-glow)' }}
            >
              but actually good.
            </span>
          </h1>

          <p className="text-muted-foreground max-w-lg text-lg leading-relaxed">
            Write → upload → AI notes → study tools → one very helpful cat.
            <br />
            Built for the way ADHD brains actually work.
          </p>

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowSignIn(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 py-3.5 text-base font-semibold transition-all hover:scale-105 hover:shadow-[0_0_24px_var(--record-glow)]"
            >
              Get started free →
            </button>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="mb-10 text-center">
          <h2 className="text-foreground text-3xl font-bold">Everything your brain needs</h2>
          <p className="text-muted-foreground mt-2">Five features. One cat. Zero excuses.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`glass glass-hover glass-enter rounded-2xl bg-gradient-to-br p-6 ${f.color} border ${f.border}`}
            >
              <div className="mb-3 text-3xl">{f.emoji}</div>
              <h3 className="text-foreground mb-2 font-semibold">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="glass-heavy mx-4 mb-20 rounded-3xl px-8 py-12 sm:mx-auto sm:max-w-4xl">
        <h2 className="text-foreground mb-8 text-center text-2xl font-bold">How it works</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
          {[
            { step: '1', label: 'Start writing', sub: 'Type, draw, or upload — no setup' },
            {
              step: '2',
              label: 'Let Nugget help',
              sub: 'Turn documents into notes and ask questions',
            },
            {
              step: '3',
              label: 'Review & study',
              sub: 'Generate flashcards, quizzes, concept maps',
            },
            {
              step: '4',
              label: 'Pass the exam',
              sub: "I can't guarantee this, but Nugget believes in you",
            },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center gap-2 text-center">
              <div
                className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full text-sm font-bold"
                style={{ boxShadow: '0 0 16px var(--record-glow)' }}
              >
                {item.step}
              </div>
              <p className="text-foreground font-medium">{item.label}</p>
              <p className="text-muted-foreground text-xs">{item.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="px-6 pb-24 text-center">
        <div className="glass-heavy mx-auto max-w-lg rounded-3xl px-8 py-12">
          <img
            src="/nuggy-baby-boy.png"
            alt="Nugget"
            className="mx-auto mb-4 size-16 drop-shadow"
            style={{ imageRendering: 'pixelated' }}
          />
          <h2 className="text-foreground mb-2 text-2xl font-bold">
            Ready to actually remember your notes?
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Nugget is waiting. Your notes are not going to write themselves.
          </p>
          <button
            type="button"
            onClick={() => setShowSignIn(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 py-3.5 text-base font-semibold transition-all hover:scale-105 hover:shadow-[0_0_24px_var(--record-glow)]"
          >
            Let's go 🐱
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="glass-light border-t border-[var(--glass-border)] py-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-3 text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors hover:underline"
            onClick={() => setShowTos(true)}
          >
            Terms of Service
          </button>
          <span className="text-muted-foreground/50">·</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors hover:underline"
            onClick={() => setShowPrivacy(true)}
          >
            Privacy Policy
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          NugNotes · Made with ✦ for ADHD students · UD only for now
        </p>
      </footer>

      <LegalDocModal
        open={showTos}
        onOpenChange={setShowTos}
        title="Terms of Service"
        content={tosContent}
      />
      <LegalDocModal
        open={showPrivacy}
        onOpenChange={setShowPrivacy}
        title="Privacy Policy"
        content={privacyContent}
      />
    </div>
  );
}
