/**
 * Centralized AI prompt templates for NugNotes
 * Organized by lecture type for context-aware AI generation.
 */

export type LectureType = 'stem' | 'humanities' | 'discussion' | 'lab' | 'review' | 'general';

// --- Lecture-type-specific note structure instructions ---

const NOTE_STYLE: Record<LectureType, string> = {
  stem: `Structure notes with these priorities:
- Definitions and theorems (use blockquotes)
- Formulas and equations (use code blocks)
- Problem-solving steps (numbered lists)
- Key relationships between concepts
- Suggest diagrams for visual concepts (<!-- DIAGRAM: [description] -->)`,

  humanities: `Structure notes with these priorities:
- Central arguments and thesis statements
- Key historical dates, figures, and events
- Contrasting perspectives (use comparison format)
- Important quotes (use blockquotes with attribution)
- Cause-and-effect chains`,

  discussion: `Structure notes with these priorities:
- Main arguments raised by participants
- Points of agreement and disagreement
- Questions that were raised
- Decisions or conclusions reached
- Action items or follow-ups mentioned`,

  lab: `Structure notes with these priorities:
- Objective / goal of the lab or demo
- Step-by-step procedure (numbered lists)
- Observations and measurements
- Results and analysis
- Common pitfalls or errors mentioned`,

  review: `Structure notes with these priorities:
- Topics confirmed for the exam or assignment
- Key concepts to study (with brief definitions)
- Practice problems or sample questions mentioned
- Tips or strategies the professor shared
- Areas the professor emphasized or repeated`,

  general: `Structure notes with these priorities:
- Clear headings (# for main topics, ## for subtopics)
- Bullet points for lists
- **Bold** for key terms and concepts
- Numbered lists for sequential information
- Blockquotes (>) for important definitions
- Suggest diagrams where visuals would help (<!-- DIAGRAM: [description] -->)`,
};

/** What Nugget's key points focus on, per lecture type. */
const NUGGET_STYLE: Record<LectureType, string> = {
  stem: 'Focus on definitions, formulas, and key relationships.',
  humanities: 'Focus on arguments, key figures, and important quotes.',
  discussion: 'Focus on main points raised and areas of agreement/disagreement.',
  lab: 'Focus on procedure steps, observations, and results.',
  review: 'Focus on exam-relevant topics, key concepts, and study tips.',
  general: 'Capture the most important points being made.',
};

// --- Note generation ---

/**
 * Turn a session's uploaded documents into study notes. The student's own
 * notes, when there are any, are context to complement — not to repeat.
 */
export function getNoteGenerationPrompt(
  documentText: string,
  lectureType: LectureType,
  existingNotes?: string,
): string {
  const style = NOTE_STYLE[lectureType] || NOTE_STYLE.general;

  const existingNotesSection = existingNotes?.trim()
    ? `\nTHE STUDENT'S NOTES SO FAR:\n${existingNotes}\n\nUse these as context. Fill in gaps and add what they missed. Do NOT simply repeat their notes — complement them.\n`
    : '';

  return `You are an expert note-taking assistant. Given the following study material (text extracted from documents the student uploaded), create comprehensive, well-structured notes in markdown format.

${style}

FORMATTING GUIDELINES:
1. Use clear headings (# for main topics, ## for subtopics, ### for details)
2. Use **bold** for key terms and concepts
3. Use *italics* for emphasis
4. Keep notes concise but comprehensive
${existingNotesSection}
STUDY MATERIAL:
${documentText}

Generate well-structured markdown notes from this material.`;
}

// --- Nugget's key points ---

/** Most key points Nugget pulls out of one session. */
export const MAX_KEY_POINTS = 8;

/** Ask Nugget for the handful of points that matter most in a session. */
export function getKeyPointsPrompt(material: string, lectureType: LectureType): string {
  const style = NUGGET_STYLE[lectureType] || NUGGET_STYLE.general;
  return `You are Nugget, a study cat helping an ADHD student see what matters. Pull out the key points from this session's material.

${style}

RULES:
- Output 3-${MAX_KEY_POINTS} bullet points, most important first.
- One clear sentence each. No filler, no repeats.
- Only use what is in the material.

${material}

Output ONLY bullet points starting with "- ":`;
}

/** Bullet lines from the model's reply → clean key point texts. */
export function parseKeyPoints(reply: string): string[] {
  return reply
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.startsWith('•'))
    .map((line) =>
      line
        .replace(/^[-•]\s*/, '')
        .replace(/\*\*/g, '')
        .trim(),
    )
    .filter((text) => text.length >= 5)
    .slice(0, MAX_KEY_POINTS);
}
