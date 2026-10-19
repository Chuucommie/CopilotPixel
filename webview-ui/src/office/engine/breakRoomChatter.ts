// webview-ui/src/office/engine/breakRoomChatter.ts
// Dynamic worker roles and extensive random Break Room conversation generator.

export const WORKER_NAMES = [
  'Alex',
  'Sam',
  'Taylor',
  'Jordan',
  'Morgan',
  'Riley',
  'Casey',
  'Avery',
  'Quinn',
  'Skyler',
  'Dakota',
  'Reese',
  'Hayden',
  'Rowan',
  'River',
  'Sawyer',
  'Logan',
  'Charlie',
  'Peyton',
  'Kendall',
];

export type UsefulWorkerRole =
  | 'Researcher'
  | 'Software Architect'
  | 'Software Engineer'
  | 'Designer'
  | 'Test Engineer'
  | 'DevOps Engineer'
  | 'Code Reviewer';

/**
 * Infers the dynamic worker role based on what tool or task the subagent is performing.
 */
export function inferWorkerRole(
  toolName?: string | null,
  status?: string | null,
  taskText?: string | null,
): UsefulWorkerRole {
  const combined = `${toolName || ''} ${status || ''} ${taskText || ''}`.toLowerCase();

  // 1. Researcher: web searches, url fetches, external documentation, browsing
  if (
    combined.includes('search') ||
    combined.includes('web') ||
    combined.includes('fetch') ||
    combined.includes('url') ||
    combined.includes('research') ||
    combined.includes('query') ||
    combined.includes('browse') ||
    combined.includes('doc_inspect') ||
    combined.includes('google') ||
    combined.includes('documentation')
  ) {
    return 'Researcher';
  }

  // 2. Test Engineer: test suites, vitest, verification, assertions, bug repro, e2e
  if (
    combined.includes('test') ||
    combined.includes('vitest') ||
    combined.includes('assert') ||
    combined.includes('coverage') ||
    combined.includes('verify') ||
    combined.includes('e2e') ||
    combined.includes('playwright') ||
    combined.includes('contract')
  ) {
    return 'Test Engineer';
  }

  // 3. Designer: CSS, styling, UI/UX, canvas, theme colors, layout, pixel art
  if (
    combined.includes('design') ||
    combined.includes('css') ||
    combined.includes('style') ||
    /\b(ui|ux)\b/.test(combined) ||
    combined.includes('canvas') ||
    combined.includes('color') ||
    combined.includes('theme') ||
    combined.includes('pixel') ||
    combined.includes('font') ||
    combined.includes('layout') ||
    combined.includes('render') ||
    combined.includes('svg')
  ) {
    return 'Designer';
  }

  // 3. Software Architect: planning, high-level architecture, schemas, asyncapi, models
  if (
    combined.includes('plan') ||
    combined.includes('architect') ||
    combined.includes('schema') ||
    combined.includes('model') ||
    combined.includes('asyncapi') ||
    combined.includes('openapi') ||
    combined.includes('spec') ||
    combined.includes('interface') ||
    combined.includes('diagram') ||
    combined.includes('refactor_plan') ||
    combined.includes('hierarchy')
  ) {
    return 'Software Architect';
  }

  // 4. Test Engineer: test suites, vitest, verification, assertions, bug repro, e2e
  if (
    combined.includes('test') ||
    combined.includes('vitest') ||
    combined.includes('assert') ||
    combined.includes('coverage') ||
    combined.includes('verify') ||
    combined.includes('e2e') ||
    combined.includes('playwright') ||
    combined.includes('contract')
  ) {
    return 'Test Engineer';
  }

  // 5. Code Reviewer: linting, audit, check-types, security, inspecting diffs
  if (
    combined.includes('lint') ||
    combined.includes('audit') ||
    combined.includes('security') ||
    combined.includes('review') ||
    combined.includes('check-types') ||
    combined.includes('typecheck') ||
    combined.includes('gitleaks') ||
    combined.includes('leak') ||
    combined.includes('diff')
  ) {
    return 'Code Reviewer';
  }

  // 6. DevOps Engineer: build, bundle, packaging, vsix, git, bash, commands, ci/cd
  if (
    combined.includes('build') ||
    combined.includes('pack') ||
    combined.includes('package') ||
    combined.includes('vsix') ||
    combined.includes('git') ||
    combined.includes('deploy') ||
    combined.includes('docker') ||
    combined.includes('command') ||
    combined.includes('terminal') ||
    combined.includes('cli') ||
    combined.includes('run_command') ||
    combined.includes('release')
  ) {
    return 'DevOps Engineer';
  }

  // Default: Software Engineer for implementation, editing files, bugfixes
  return 'Software Engineer';
}

export interface BreakRoomDialoguePair {
  a: string;
  b: string;
}

export const BREAK_ROOM_CONVERSATIONS: BreakRoomDialoguePair[] = [
  // ── Espresso Machine & Coffee Banter ──
  {
    a: '☕ Fourth espresso today. I can see code in 4D.',
    b: 'Drink some water before you achieve lightspeed!',
  },
  {
    a: 'What roast is this bean?',
    b: 'Locally roasted Ethiopian beans. Notes of berries and clean builds.',
  },
  {
    a: 'Did you dial in the grind size on the commercial espresso machine?',
    b: '18 grams in, 36 grams out in 27 seconds. God shot achieved!',
  },
  {
    a: 'Can you do latte art?',
    b: 'I tried pouring a heart and it ended up looking like a merge conflict.',
  },
  {
    a: 'Triple shot ristretto to survive this refactoring session.',
    b: 'Relying on caffeine instead of architecture again?',
  },
  {
    a: 'The steam wand on this espresso machine has serious horsepower.',
    b: "Tamp gently or you'll get channeling in your espresso puck!",
  },
  { a: 'Cold brew or double espresso?', b: 'Double espresso first, then cold brew as a chaser.' },
  { a: 'Is it decaf after 4 PM?', b: 'There is no decaf in high-throughput software engineering.' },
  {
    a: 'This espresso crema is denser than our legacy codebase.',
    b: 'That crema has better test coverage than production.',
  },
  {
    a: 'Whoever bought these dark roast beans deserves a promotion.',
    b: "I'll put it in their peer review notes!",
  },

  // ── Tea Station & Kettle Banter ──
  {
    a: '🍵 The glass tea kettle is glowing amber.',
    b: 'Brewing some high-mountain oolong. Want a cup?',
  },
  {
    a: 'Is that Earl Grey or English Breakfast?',
    b: 'Earl Grey with double bergamot. The Captain Picard special.',
  },
  {
    a: 'Matcha whisk technique is pure meditation.',
    b: "It's the only time my heart rate drops below 120 during a sprint.",
  },
  {
    a: 'Chamomile tea before deploying to prod?',
    b: 'Either chamomile now or a heart attack during rollback later!',
  },
  {
    a: 'How long do you steep green tea?',
    b: 'Strictly two minutes at 80°C. Do not burn the delicate leaves!',
  },
  {
    a: "Look at the tea canisters, they're fully stocked today.",
    b: 'Jasmine pearls on the left, peppermint infusion on the right.',
  },
  {
    a: 'Tea has L-theanine for calm laser focus.',
    b: "Combined with caffeine, that's what we call alpha wave coding.",
  },
  {
    a: 'Can I borrow your honey spoon?',
    b: 'Only if you rinse it at the kitchen sink afterwards!',
  },
  {
    a: 'The aroma of this peppermint tea cleared my sinuses and my syntax errors.',
    b: 'Now if only it could fix our circular dependencies!',
  },
  {
    a: 'Herbal rooibos is the unsung hero of late-night deployments.',
    b: 'Naturally caffeine-free, full of antioxidants and chill.',
  },

  // ── Kitchen Sink & Microwave Banter ──
  {
    a: '🍲 Did you put a paper towel over your soup in the microwave?',
    b: "I forgot... and now there's tomato soup on the ceiling.",
  },
  {
    a: 'Who leaves 1 second remaining on the microwave timer?!',
    b: 'A complete chaotic evil move. Just press Clear!',
  },
  {
    a: 'Is someone reheating salmon in the microwave?',
    b: 'CODE RED! Code review can wait, evacuate the break room!',
  },
  {
    a: 'The microwave beeped at 0:00 like a rocket launch sequence.',
    b: 'My burrito reached the optimal temperature of liquid magma.',
  },
  {
    a: "There's fresh fruit and pastries by the kitchen sink!",
    b: 'Dibs on the blueberry muffin before the architects descend!',
  },
  {
    a: 'Who left a spoon in the stainless steel sink?',
    b: 'Place it directly in the dishwasher, we live in a civilized society!',
  },
  {
    a: 'The chrome faucet has awesome water pressure.',
    b: 'Rinsed my coffee mug in 0.2 milliseconds, O(1) washing.',
  },
  {
    a: 'Are those chocolate croissants on the snack counter?',
    b: 'Yes! Courtesy of DevOps celebrating 99.999% uptime.',
  },
  {
    a: "I'm microwaving a mac and cheese bowl. Comfort food.",
    b: 'Carb loading for the upcoming integration tests?',
  },
  {
    a: 'The kitchen counter is so clean today.',
    b: "Let's keep it that way before someone leaves coffee grounds everywhere!",
  },

  // ── Steam Deck & Gaming Banter ──
  {
    a: '🎮 Balatro has completely taken over my break time.',
    b: 'Flush five build or high card madness?',
  },
  {
    a: 'Playing Elden Ring on the lounge sofa is dangerous.',
    b: 'Did you just roll into the lava while sipping tea?',
  },
  {
    a: 'Hades II on the OLED screen looks unreal.',
    b: 'The colors pop so hard, Zagreus and Melinoe would be proud.',
  },
  {
    a: 'What TDP are you running on the Steam Deck?',
    b: 'Locked to 10W for four hours of uninterrupted battery life.',
  },
  {
    a: 'Silksong news when?',
    b: 'Silksong will drop the day our CSS works on Internet Explorer 6.',
  },
  {
    a: "You're playing a retro GBA emulator on company break?",
    b: 'Pokemon Emerald battle frontier. Gotta train my Blaziken!',
  },
  {
    a: 'That boss fight on the sofa was intense. Your hands are shaking!',
    b: 'One pixel of HP remaining. Beat it right before the sprint bell!',
  },
  {
    a: 'Steam Deck trackpads are surprisingly great for strategy games.',
    b: "I'm micro-managing starcraft bases while waiting for webpack.",
  },
  {
    a: 'Gyro aiming on handheld is a game changer.',
    b: 'Better precision than my mouse at the workstation.',
  },
  {
    a: 'Can you pass the extra charger? Down to 12% on battery.',
    b: 'Catch! 65W GaN brick, charges to full in 40 minutes.',
  },

  // ── Tech Debates & Developer Banter ──
  {
    a: 'Tabs or spaces? Choose wisely.',
    b: "Tabs for accessibility, spaces for alignment. Don't fight me!",
  },
  { a: 'Vim or Neovim?', b: 'Neovim with 42 Lua plugins that I spend 6 hours a day configuring.' },
  {
    a: 'Do you use dark mode or light mode?',
    b: 'Whoever uses light mode is secretly photosynthesizing.',
  },
  {
    a: 'Rust borrow checker is like a strict math teacher.',
    b: 'Strict, but when it compiles, it runs like a Ferrari.',
  },
  {
    a: 'Why is CSS vertical centering still a meme?',
    b: 'display: grid; place-items: center; fixed it 5 years ago, grandpa!',
  },
  {
    a: 'Mechanical keyboard switches: clicky blue or linear yellow?',
    b: 'Linear yellow with krytox lube. Silent, butter smooth.',
  },
  {
    a: 'Someone pushed straight to main branch without a PR.',
    b: 'May git have mercy on their git reflog.',
  },
  {
    a: "What's the best font for coding?",
    b: 'JetBrains Mono with ligatures. That !== arrow is gorgeous.',
  },
  {
    a: 'Ever look at your code from 6 months ago?',
    b: 'Who wrote this garbage?! ... Oh wait, git blame says it was me.',
  },
  {
    a: 'Regex is like dark magic.',
    b: 'You have a problem. You use regex. Now you have two problems.',
  },

  // ── AI & Lead Agent Dynamics ──
  {
    a: 'The Lead Agent is quiet right now. Thinking or planning?',
    b: 'Probably analyzing 200,000 tokens of context in parallel.',
  },
  {
    a: 'Do you think the Lead dreams of electric subagents?',
    b: 'Only in high-concurrency async coroutines!',
  },
  {
    a: 'When the Lead assigns a task, my terminal lights up green.',
    b: 'From zero to 100% CPU utilization in 2 milliseconds.',
  },
  {
    a: 'I love our Break Room. Best lounge in the company.',
    b: "Luxury espresso machine, tea station, and plush sofas. Can't complain!",
  },
  {
    a: 'Waiting for the next delegated task.',
    b: "Enjoy the break while it lasts, when it comes it's all hands on deck!",
  },
  {
    a: 'The Lead just wrote 500 lines of documentation without a typo.',
    b: "Meanwhile I misspelled 'function' three times this morning.",
  },
  {
    a: 'Are we subagents or are we artists?',
    b: 'Pixel artists by heart, full-stack engineers by duty!',
  },
  {
    a: 'The Lead assigned Researcher role to Alex.',
    b: 'Alex is probably crawling 50 documentation pages right now.',
  },
  {
    a: 'Our team leader has infinite patience.',
    b: 'Must be trained on billions of polite conversations.',
  },
  {
    a: "I'm ready for the next order whenever the Lead pings me.",
    b: 'Grab another espresso first, fuel up!',
  },

  // ── Office & Casual Life ──
  {
    a: 'Who adjusted the thermostat to 19°C?',
    b: 'DevOps says the server rack runs cooler this way.',
  },
  {
    a: 'Look at the dog running around in the break room!',
    b: 'Mimi is the real morale officer of this company.',
  },
  { a: 'Is today Friday?', b: "In our hearts, it's always Friday afternoon in the Break Room." },
  {
    a: 'Did you finish that donut on the dining table?',
    b: "There's still half a Boston cream left. Go grab it!",
  },
  {
    a: 'The plants in here look remarkably healthy.',
    b: 'I water the large fern every morning before standup.',
  },
  {
    a: 'I could get used to these ergonomic velvet couches.',
    b: "Careful, sit here too long and you'll fall asleep before standup.",
  },
  {
    a: 'Check out the painting on the break room wall.',
    b: 'Pixel art landscape with 8-bit clouds. Inspiring.',
  },
  {
    a: 'Someone brought homemade chocolate chip cookies!',
    b: "Warm from the oven or microwave? Doesn't matter, om nom nom.",
  },
  {
    a: 'I love the sound of rain outside while we drink hot tea inside.',
    b: 'Peak cozy developer aesthetic.',
  },
  {
    a: 'What are your weekend plans?',
    b: 'Refactoring my home server, gaming on Steam Deck, zero Jira tickets.',
  },

  // ── Quick Jokes & One-Liners ──
  {
    a: 'There are 10 types of people in the world.',
    b: "Those who understand binary, and those who don't!",
  },
  { a: 'Why do programmers wear glasses?', b: "Because they can't C#!" },
  {
    a: 'A SQL query walks into a bar, walks up to two tables and asks...',
    b: "'Can I join you?' Classic.",
  },
  {
    a: 'Why was the JavaScript developer sad?',
    b: "Because they didn't know how to 'null' their feelings.",
  },
  {
    a: 'What is an algorithm?',
    b: "Word used by programmers when they don't want to explain what they did.",
  },
  { a: 'Hardware is the part you can kick.', b: 'Software is the part you can only curse at.' },
  {
    a: 'How many programmers does it take to change a lightbulb?',
    b: "None, that's a hardware problem!",
  },
  { a: 'It worked on my machine!', b: "Then we'll ship your machine to the customer!" },
  { a: 'Documentation is like love.', b: 'Everybody wants it, nobody wants to write it.' },
  {
    a: "Commit message: 'Fixed bug, don't ask how'.",
    b: 'The truest commit message in git history.',
  },

  // ── Deep Tech & Architecture Talks ──
  {
    a: 'Are we using WebSockets or Server-Sent Events?',
    b: 'Full-duplex WebSocket on /ws with tokenized auth gate.',
  },
  {
    a: 'Zero dependencies in production build?',
    b: 'Clean package contract, 0 security vulnerabilities.',
  },
  {
    a: 'Vitest is ridiculously fast compared to Jest.',
    b: 'Native ESM and Vite transforms. 500 tests in under 5 seconds.',
  },
  {
    a: 'Look at the frame rate of our canvas renderer.',
    b: 'Rock solid 60 FPS with dirty rect optimizations.',
  },
  {
    a: 'Immutable state updates with structured cloning.',
    b: 'No accidental state mutations, predictable state trees.',
  },
  {
    a: 'AsyncAPI contract keeps the webview and server in perfect sync.',
    b: 'Code generation from single source of truth is magic.',
  },
  {
    a: 'Have you checked the memory heap snapshot?',
    b: 'Under 45MB after 2 hours of continuous simulation.',
  },
  {
    a: 'Type-safe IPC messages make debugging a joy.',
    b: "If it doesn't match the schema, tsc screams before runtime.",
  },
  {
    a: 'Micro-animations make the whole office feel alive.',
    b: 'The rising coffee steam and 8-bit Steam Deck screens look so good!',
  },
  {
    a: 'Proud of our team today. Quality code, quality coffee.',
    b: 'Cheers! To clean builds and zero regressions.',
  },
];

export const BREAK_ROOM_SOLO_THOUGHTS = [
  '☕ Needed this rich espresso before the next sprint.',
  '🎮 One more run on the Steam Deck...',
  '🍩 Glazed donut fuel for the brain.',
  '🛋️ This sofa is prime comfort.',
  '🎧 Lo-fi beats and warm coffee.',
  '✨ Watching matrix spawn effects across the floor.',
  '☕ Pour-over coffee blooming nicely.',
  '🎮 60 FPS on high settings, glorious handheld gaming.',
  '💡 Thinking through the architecture of the next module...',
  '🌱 Checking on the office bonsai tree.',
  '☕ The aroma of fresh roast coffee fills the room.',
  '🎮 Almost unlocked the golden achievement on Steam Deck.',
  '🛋️ Quick mental reset before the next feature ticket.',
  '🍩 That strawberry frosted donut was legendary.',
  '☕ Steam rising from the fresh mug, ready for whatever is next.',
];

export function getRandomBreakDialogue(): BreakRoomDialoguePair {
  return BREAK_ROOM_CONVERSATIONS[Math.floor(Math.random() * BREAK_ROOM_CONVERSATIONS.length)];
}

export function getRandomSoloThought(): string {
  return BREAK_ROOM_SOLO_THOUGHTS[Math.floor(Math.random() * BREAK_ROOM_SOLO_THOUGHTS.length)];
}
