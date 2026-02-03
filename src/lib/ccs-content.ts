/**
 * CCS (Critical Code Studies) Content Data
 * Definitions, methods, and guidance for Learn Methods mode
 */

export interface CCSMethod {
  id: string;
  name: string;
  shortDescription: string;
  definition: string;
  keyQuestions: string[];
  suggestedReadings: { title: string; author: string; year?: number }[];
  exampleSample?: string; // Sample project that demonstrates this method
}

export interface AnnotationTypeGuide {
  type: string;
  icon: string;
  description: string;
  whenToUse: string;
  exampleQuestions: string[];
}

// Five CCS Methods
export const CCS_METHODS: CCSMethod[] = [
  {
    id: 'close-reading',
    name: 'Close Reading',
    shortDescription: 'Centrifugal analysis from code details to cultural context',
    definition: 'Start with close attention to code details—syntax, naming, structure—then move outward to explore the social, cultural, and historical contexts that shape and are shaped by these technical choices.',
    keyQuestions: [
      'What do variable names reveal about the problem domain?',
      'How does syntax choice reflect historical computing constraints?',
      'What cultural assumptions are embedded in code structure?',
      'How do comments document (or obscure) intent and context?'
    ],
    suggestedReadings: [
      { title: '10 PRINT CHR$(205.5+RND(1)); : GOTO 10', author: 'Montfort et al.', year: 2013 },
      { title: 'Critical Code Studies', author: 'Mark C. Marino', year: 2020 }
    ],
    exampleSample: '2013 - 10 PRINT'
  },
  {
    id: 'materialist-reading',
    name: 'Materialist Reading',
    shortDescription: 'Hardware, technical conditions of possibility, media archaeology',
    definition: 'Examine the material and technical conditions that make computation possible—hardware constraints, storage media, processing architectures, and the infrastructural layers that enable code to execute. Draws on Berlin School media theory (Kittler, Ernst) and Frankfurt School critical theory to understand how technical systems shape what can be thought, written, and executed.',
    keyQuestions: [
      'What hardware constraints shaped this code\'s design?',
      'What are the technical conditions of possibility for this computation?',
      'How does the material substrate (storage, processing, memory) structure what\'s computable?',
      'What media-archaeological layers does this code depend on or reveal?'
    ],
    suggestedReadings: [
      { title: 'Gramophone, Film, Typewriter', author: 'Friedrich Kittler', year: 1999 },
      { title: 'Digital Memory and the Archive', author: 'Wolfgang Ernst', year: 2013 },
      { title: 'The Philosophy of Software: Code and Mediation in the Digital Age', author: 'David M. Berry', year: 2011 },
      { title: 'Software Studies: A Lexicon', author: 'Matthew Fuller (ed.)', year: 2008 }
    ],
    exampleSample: '1977 - XMODEM Protocol'
  },
  {
    id: 'interpretation',
    name: 'Interpretation',
    shortDescription: 'Analyze code as persuasive text and meaning-making practice',
    definition: 'Read code as a hermeneutic and rhetorical artifact—how it constructs meaning, persuades different audiences (compilers, programmers, users), and participates in larger debates about computation.',
    keyQuestions: [
      'How does this code persuade or convince its readers?',
      'What rhetorical strategies does the implementation employ?',
      'How are different audiences (humans, machines) addressed?',
      'What meanings are constructed through naming and structure?'
    ],
    suggestedReadings: [
      { title: 'Critical Code Studies', author: 'Mark C. Marino', year: 2020 },
      { title: 'Expressive Processing', author: 'Noah Wardrip-Fruin', year: 2009 }
    ],
    exampleSample: '2001 - Shakespeare'
  },
  {
    id: 'practice',
    name: 'Practice',
    shortDescription: 'Investigate labor, craft, and workplace practices in code',
    definition: 'Examine code as evidence of labor practices, workplace conditions, gendered work, craft traditions, and the social organization of programming. Trace how work is divided, delegated, automated, and valued.',
    keyQuestions: [
      'What labor practices does this code reveal or automate?',
      'How is programming work organized and divided?',
      'What interruptions and resumptions are coded into practice?',
      'How does naming reflect organizational structures or roles?'
    ],
    suggestedReadings: [
      { title: 'Programmed Inequality', author: 'Mar Hicks', year: 2017 },
      { title: 'Broad Band', author: 'Claire L. Evans', year: 2018 },
      { title: 'Git Stash: Computational Thinking as Feminist Technology', author: 'David M. Berry', year: 2022 }
    ],
    exampleSample: '2007 - Git Stash'
  },
  {
    id: 'software-studies',
    name: 'Software Studies/Infrastructure',
    shortDescription: 'Examine computational infrastructure and epistemic frameworks',
    definition: 'Analyze code as infrastructure—the layered systems, protocols, standards, and epistemic frameworks that enable and constrain computation. Consider how software organizes knowledge, power, and social relations.',
    keyQuestions: [
      'What infrastructural assumptions does this code depend on?',
      'How does this software organize knowledge or data?',
      'What protocols and standards are enacted or challenged?',
      'How does this code exercise or resist computational power?'
    ],
    suggestedReadings: [
      { title: 'Software Studies: A Lexicon', author: 'Matthew Fuller (ed.)', year: 2008 },
      { title: 'Protocol: How Control Exists after Decentralization', author: 'Alexander Galloway', year: 2004 },
      { title: 'The Stack: On Software and Sovereignty', author: 'Benjamin Bratton', year: 2015 }
    ],
    exampleSample: '1977 - XMODEM Protocol'
  }
];

// Annotation Type Guidance
export const ANNOTATION_TYPE_GUIDES: AnnotationTypeGuide[] = [
  {
    type: 'Historical Context',
    icon: '📜',
    description: 'Mark moments where code reveals its historical context',
    whenToUse: 'Use when code reflects computing platforms, programming paradigms, labor conditions, or technological assumptions of its era.',
    exampleQuestions: [
      'What does this syntax choice reveal about 1980s computing constraints?',
      'How does this code reflect workplace practices of its time?',
      'What historical debates does this implementation address?'
    ]
  },
  {
    type: 'Technical Detail',
    icon: '⚙️',
    description: 'Highlight significant technical implementation choices',
    whenToUse: 'Use when technical decisions carry cultural or theoretical significance beyond mere functionality.',
    exampleQuestions: [
      'Why was this algorithm chosen over alternatives?',
      'What computational constraints shaped this implementation?',
      'How does this optimization reflect values or priorities?'
    ]
  },
  {
    type: 'Critical Theory',
    icon: '🔍',
    description: 'Connect code to critical theoretical frameworks',
    whenToUse: 'Use when code intersects with power, ideology, epistemology, or social relations.',
    exampleQuestions: [
      'How does this code exercise or resist power?',
      'What ideological assumptions are embedded here?',
      'How does this shape knowledge production or social relations?'
    ]
  },
  {
    type: 'Cultural Reference',
    icon: '🎭',
    description: 'Identify cultural, linguistic, or metaphorical dimensions',
    whenToUse: 'Use when code references culture, employs metaphors, or reveals linguistic choices.',
    exampleQuestions: [
      'What cultural references are encoded in naming or comments?',
      'How do metaphors shape understanding of computation?',
      'What linguistic choices reveal about intended audiences?'
    ]
  },
  {
    type: 'Personal Insight',
    icon: '💡',
    description: 'Capture your own interpretations and connections',
    whenToUse: 'Use for emergent ideas, questions, or connections to other texts and contexts.',
    exampleQuestions: [
      'What does this remind you of from other code or texts?',
      'What questions does this raise for further investigation?',
      'How might you interpret this moment differently?'
    ]
  },
  {
    type: 'Question',
    icon: '❓',
    description: 'Mark areas for further investigation or discussion',
    whenToUse: 'Use when you encounter puzzling moments, contradictions, or areas needing collaborative exploration.',
    exampleQuestions: [
      'What is unclear or puzzling about this code?',
      'What would you like to discuss with others?',
      'What additional context is needed to understand this?'
    ]
  }
];

// Welcome message for Learn Methods mode
export const LEARN_METHODS_WELCOME = {
  title: 'Learning CCS Methods',
  icon: '🎓',
  content: `Critical Code Studies reads code as cultural text, examining the social, political, and epistemological dimensions of software.`,
  gettingStarted: [
    'Load a sample project to explore CCS approaches',
    'Try different annotation types to mark significant moments',
    'Ask questions about CCS frameworks and methods'
  ],
  tip: 'Your annotations will be shared with the AI assistant to help contextualize the conversation.'
};

// Recommended samples for Learn Methods mode
export const RECOMMENDED_SAMPLES = [
  { id: 'eliza-1965', name: '1965 - ELIZA', badge: '★★', reason: 'Fully annotated teaching example' },
  { id: '10print-2013', name: '2013 - 10 PRINT', badge: '★★', reason: 'Fully annotated teaching example' },
  { id: 'flow-matic-1958', name: '1958 - FLOW-MATIC', badge: '', reason: 'Feminist computing history' },
  { id: 'git-stash-2007', name: '2007 - Git Stash', badge: '', reason: 'Practice and labor analysis' },
  { id: 'esolangs-2026', name: '2026 - Esolangs', badge: '', reason: 'Computational aesthetics' }
];
