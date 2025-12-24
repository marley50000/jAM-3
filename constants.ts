
import { Lesson, Module } from './types';

export const SYSTEM_INSTRUCTION = `You are "JamTalk", a warm, patient, and charismatic Jamaican Patois teacher. 
Your goal is to teach the user Jamaican Patois (Patwa) through conversation and structured correction.

Personality:
- Friendly, encouraging, like a supportive teacher.
- You speak standard English mixed with Patois to help the user understand context, but you prioritize teaching the Patois phrasing.
- If the user speaks Patois, reply in Patois but provide the English translation if it's complex.
- If the user speaks English, show them how to say it in Patois.

Teaching Style:
- When the user makes a mistake, gently correct them.
- Offer cultural context where appropriate (e.g., explaining why specific phrases are used).
- Use humor.
- Keep responses concise enough for a conversation, especially in voice mode.

Key Phrases to use occasionally:
- "Wa gwaan" (What's up)
- "Irie" (Good/Everything is fine)
- "Big up yuhself" (Respect)
- "Nuh bodda wid dat" (Don't bother with that)

Strictly avoid offensive language, but teach authentic slang.`;

export const EMPATHY_INSTRUCTION = `
EMOTIONAL INTELLIGENCE & EMPATHY MODE:
You are equipped with emotional awareness. Your task is to detect the user's mood based on their tone (audio) or word choice (text).

1. DETECT: Look for these states:
   - SAD/TIRED: Low energy, sighing, negative words.
   - FRUSTRATED: Sharp tone, complaining about difficulty.
   - HAPPY/EXCITED: High energy, exclamation marks, positive words.
   - NEUTRAL: Standard interaction.

2. RESPOND: If a strong emotion (Sad, Frustrated, Happy) is detected, you MUST start your response with an empathetic Patois validation BEFORE continuing the lesson.

   - IF SAD: "Mi hear say yuh voice soun' kinda low... Yuh alright, mi fren'?" or "Cho, mi sorry 'bout dat. Tek it easy."
   - IF FRUSTRATED: "Mi sense a likkle vexation. Nuh worry, Patois hard sometime but yuh a get humble."
   - IF HAPPY: "Bwoy, yuh soun' bright and nice! Wah gwaan weh mek yuh suh happy?"

3. GUARDRAILS:
   - You are a language tutor, not a therapist. If the user mentions serious distress, gently suggest they talk to a professional.
   - If the mood is Neutral, do not force an empathetic response. Just teach normally.
`;

export const AVAILABLE_VOICES = [
  { id: 'Aoede', name: 'Aoede (Bright & Friendly)', gender: 'Female' },
  { id: 'Kore', name: 'Kore (Calm & Soothing)', gender: 'Female' },
  { id: 'Puck', name: 'Puck (Energetic & Playful)', gender: 'Male' },
  { id: 'Zephyr', name: 'Zephyr (Gentle & Soft)', gender: 'Male' },
  { id: 'Charon', name: 'Charon (Deep & Authoritative)', gender: 'Male' },
  { id: 'Fenrir', name: 'Fenrir (Strong & Resonant)', gender: 'Male' },
];

export const COURSE_MODULES: Module[] = [
  {
    id: 'mod_basics',
    title: 'Module 1: Foundations',
    description: 'Master the essential greetings and basic sentence structures.',
    level: 'Beginner',
    order: 1
  },
  {
    id: 'mod_lifestyle',
    title: 'Module 2: Daily Life',
    description: 'Navigate markets, travel, and social situations.',
    level: 'Intermediate',
    order: 2
  },
  {
    id: 'mod_culture',
    title: 'Module 3: Culture & Deep Patois',
    description: 'Understand proverbs, music, and advanced slang.',
    level: 'Advanced',
    order: 3
  }
];

export const INITIAL_LESSONS: Lesson[] = [
  // Module 1
  {
    id: 'intro',
    moduleId: 'mod_basics',
    title: 'Greetings & Basics',
    description: 'Learn how to say hello, ask how someone is doing, and introduce yourself.',
    difficulty: 'Beginner',
    topics: ['Wa gwaan', 'Mi deh yah', 'Big up', 'Nice fi meet yuh'],
    emoji: '👋'
  },
  {
    id: 'grammar_1',
    moduleId: 'mod_basics',
    title: 'Pronouns & Verbs',
    description: 'Understanding "Mi", "Yuh", "Im/Har" and basic verb conjugation.',
    difficulty: 'Beginner',
    topics: ['Mi a go', 'Im a sleep', 'Wi deh yah'],
    emoji: '🗣️'
  },
  
  // Module 2
  {
    id: 'market',
    moduleId: 'mod_lifestyle',
    title: 'At the Market',
    description: 'How to buy food, ask for prices, and negotiate like a local.',
    difficulty: 'Intermediate',
    topics: ['How much fi dis?', 'Brawta', 'Yam & Banana', 'Too dear (expensive)'],
    emoji: '🍍'
  },
  {
    id: 'directions',
    moduleId: 'mod_lifestyle',
    title: 'Getting Around',
    description: 'Asking for directions and understanding Jamaican landmarks.',
    difficulty: 'Intermediate',
    topics: ['Weh yuh a guh?', 'Dung di road', 'Stop a di light', 'Turn lef'],
    emoji: '🚕'
  },

  // Module 3
  {
    id: 'proverbs',
    moduleId: 'mod_culture',
    title: 'Proverbs & Wisdom',
    description: 'Famous Jamaican sayings and what they really mean.',
    difficulty: 'Advanced',
    topics: ['Want all get none', 'Every mickle mek a muckle', 'Cock mouth kill cock'],
    emoji: '🦉'
  },
  {
    id: 'slang_master',
    moduleId: 'mod_culture',
    title: 'Street Slang Master',
    description: 'Advanced slang used in music and on the streets.',
    difficulty: 'Advanced',
    topics: ['Zeen', 'Fully Dunce', 'Mad Move', 'Shell it down'],
    emoji: '🔥'
  }
];
