// A/B text scripts. Every variant uses the same data, only the tone changes.
// Each variant has four stages: the first pitch, a soft follow-up after a decline,
// a follow-up after no answer, and the acceptance reply that points to the emailed invoice.
// ctx: { first, rep, two, three, build }

const INVOICE = () =>
  `META PCs will email an invoice to the email address on your order. Please review the coverage and price on the invoice before paying. If it doesn't arrive, reply here and I'll check on it.`;

export const VARIANTS = [
  {
    id: "v1",
    name: "Control",
    pitch: (c) => `Hello ${c.first}! This is ${c.rep} from META PCs, one quick message before your window is expired.

Your build already comes with lifetime phone & email support on us. The extended warranty covers the hardware if something breaks, our US-based repair team fixes or replaces it, no questions asked.

• 2 years – ${c.two}
• 3 years – ${c.three}

Can only add it before pickup or delivery. Would you like to add either of those options on?`,
    overcome: (c) => `Totally understand, ${c.first}. Most people don't expect to need it, it's really there for the one time something does fail. If keeping the total down is the concern, the 2-year at ${c.two} still covers the hardware. Want me to add that one? If not, no worries at all, enjoy the new build!`,
    nudge: (c) => `Hi ${c.first}, just following up on my last message about the extended warranty for your META PCs build. It can only be added before pickup or delivery, so I wanted to make sure you saw it. Would you like the 2-year (${c.two}) or the 3-year (${c.three})?`,
    accept: (c) => `Awesome, ${c.first}! I'll get the warranty added now. ${INVOICE(c)}`,
  },
  {
    id: "v2",
    name: "Golden pitch",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs here! Thanks again for your order.

Your build comes with 1-year hardware coverage plus lifetime phone & email support. Most of our customers choose to extend the warranty to protect their system longer:

• 2-year – ${c.two}
• 3-year – ${c.three}

It can only be added before pickup or delivery. Did you want to go with the 2-year or the 3-year option?`,
    overcome: (c) => `Totally fair, ${c.first}. The reason I recommend it is that if something does happen, it's a lot easier to have coverage in place than to deal with repair costs later. The catch is it can only be added before pickup or delivery; after that the option is gone. Want me to lock one in while you still can? Either way, no pressure!`,
    nudge: (c) => `Hi ${c.first}, ${c.rep} from META PCs again. Just following up on the warranty options I sent over. Since it can only be added before pickup or delivery, I didn't want you to miss the window. Did you want to go with the 2-year or the 3-year?`,
    accept: (c) => `Perfect, ${c.first}! I'll get that added so the system is protected. ${INVOICE(c)}`,
  },
  {
    id: "v3",
    name: "Friendly",
    pitch: (c) => `Hey ${c.first}! 👋 It's ${c.rep} over at META PCs. Thanks for ordering with us!

Quick heads up before pickup or delivery: you can extend your hardware warranty so if a part ever gives out, our US team fixes or replaces it for you.

• 2 years – ${c.two}
• 3 years – ${c.three}

Which one sounds good to you?`,
    overcome: (c) => `No worries at all, ${c.first}! I just didn't want you to miss it, since it's a one-time option that can only be added before pickup or delivery. If a part ever gives out, it's nice to just send it to us and have it handled. Want me to add one before it's too late? If not, enjoy the new setup! 🎮`,
    nudge: (c) => `Hey ${c.first}! 👋 Just bumping my last message in case it got buried. The warranty can only be added before pickup or delivery, so I wanted to catch you in time. Which one sounds good, 2 years or 3?`,
    accept: (c) => `Love it, ${c.first}! 🙌 Adding it now. ${INVOICE(c)}`,
  },
  {
    id: "v4",
    name: "Concise",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs. Before pickup or delivery, you can extend your PC's hardware warranty:

• 2 yr – ${c.two}
• 3 yr – ${c.three}

Which works better for you?`,
    overcome: (c) => `Understood, ${c.first}. Just know it can't be added once your PC is picked up or delivered. Want me to lock it in now? If not, all good.`,
    nudge: (c) => `Hi ${c.first}, quick follow-up: the extended warranty can only be added before pickup or delivery. 2 yr – ${c.two} or 3 yr – ${c.three}?`,
    accept: (c) => `Done, ${c.first}! Adding it now. ${INVOICE(c)}`,
  },
  {
    id: "v5",
    name: "Investment",
    pitch: (c) => `Hi ${c.first}, this is ${c.rep} from META PCs. Since ${c.build} is a real investment, I'd recommend protecting it before pickup or delivery.

A gaming PC has several high-value parts, and if one fails out of warranty it gets expensive fast. The extended warranty covers repair or replacement by our US-based team:

• 2 years – ${c.two}
• 3 years – ${c.three}

Which option works better for you?`,
    overcome: (c) => `I get it, ${c.first}. Compared to the cost of replacing a single major component, the coverage protects you from a much bigger expense later, and this is the only chance to add it before pickup or delivery. Want me to add it now? If not, no problem at all.`,
    nudge: (c) => `Hi ${c.first}, following up on protecting your new PC. A single failed component can cost more than the coverage itself, and this is the only chance to add it before pickup or delivery. Which option works better for you, the 2-year or the 3-year?`,
    accept: (c) => `Great call, ${c.first}! Your investment is protected. ${INVOICE(c)}`,
  },
  {
    id: "v6",
    name: "Peace of mind",
    pitch: (c) => `Hi ${c.first}! ${c.rep} from META PCs here. One quick thing before pickup or delivery.

If anything ever goes wrong, you shouldn't be stuck diagnosing it or dealing with manufacturer RMAs on your own. The extended warranty means you just send it to us and our US team handles the repair or replacement.

• 2 years – ${c.two}
• 3 years – ${c.three}

Did you want the 2-year or the 3-year?`,
    overcome: (c) => `Totally fair, ${c.first}. Hopefully you never need it, it's really just so you're not on your own if something does fail. Since it can only be added before pickup or delivery, I wanted to give you one last chance. Want me to add it? Otherwise no worries, enjoy it!`,
    nudge: (c) => `Hi ${c.first}, just checking back in. I'd hate for you to be stuck on your own if a part ever fails after the free 1 year warranty, and the warranty can only be added before pickup or delivery. Did you want the 2-year or the 3-year?`,
    accept: (c) => `Awesome, ${c.first}, you're covered! ${INVOICE(c)}`,
  },
  {
    id: "v8",
    name: "Tech recommendation",
    pitch: (c) => `Hi ${c.first}, it's ${c.rep} at META PCs. My recommendation: add the extended warranty to any gaming PC before pickup or delivery.

It covers the CPU, GPU, RAM, motherboard, storage and PSU. If anything fails, our US team fixes or replaces it, so you skip the diagnosing and manufacturer RMAs.

• 2 years – ${c.two}
• 3 years – ${c.three} (what I'd pick)

Which one works for you?`,
    overcome: (c) => `Fair enough, ${c.first}. Even if you know your way around a PC, it saves you from diagnosing and doing manufacturer RMAs yourself. It can only be added before pickup or delivery, so now is the window. Want me to add it? Either way, enjoy the build!`,
    nudge: (c) => `Hi ${c.first}, following up on my recommendation. The coverage handles CPU, GPU, RAM, motherboard, storage and PSU, and it can only be added before pickup or delivery. Would you want an additional 2 or 3-years of protection?`,
    accept: (c) => `Solid choice, ${c.first}! I'll add it now. ${INVOICE(c)}`,
  },
  {
    id: "v9",
    name: "Consultative",
    pitch: (c) => `Hi ${c.first}, ${c.rep} from META PCs! Quick question before pickup or delivery: how long are you planning to run this build?

A good PC is meant to last for years, which is why we offer extended hardware coverage. If a part fails, our US team repairs or replaces it:

• 2 years – ${c.two}
• 3 years – ${c.three}

Which lines up better with how long you'll keep it?`,
    overcome: (c) => `Makes sense, ${c.first}. The thing to keep in mind is this is the only time it can be added; once your PC is picked up or delivered, it's off the table for the life of the system. Want me to add it while the option's still open? If not, totally fine!`,
    nudge: (c) => `Hi ${c.first}, just following up. How long are you planning to keep this build? That'll tell you whether the 2-year or the 3-year fits better, and it can only be added before pickup or delivery.`,
    accept: (c) => `Sounds great, ${c.first}! I'll set that up. ${INVOICE(c)}`,
  },
  {
    id: "v10",
    name: "Concierge",
    pitch: (c) => `Good day ${c.first}, this is ${c.rep} with META PCs. Thank you again for your order.

Before pickup or delivery, we'd like to offer extended hardware protection. Should any covered component fail, our US-based team will repair or replace it at no cost to you.

• 2-year coverage – ${c.two}
• 3-year coverage – ${c.three}

Please let me know which option you'd prefer, and I'll take care of the rest.`,
    overcome: (c) => `Understood, ${c.first}, and thank you for letting me know. Please note that coverage can only be added before pickup or delivery, so should you change your mind, simply reply before then and I'll take care of it. Otherwise, we hope you thoroughly enjoy your new system.`,
    nudge: (c) => `Good day ${c.first}, I wanted to follow up on my previous message regarding extended hardware protection. As it can only be added before pickup or delivery, please let me know whether you'd prefer the 2-year or 3-year coverage, and I'll take care of the rest.`,
    accept: (c) => `Thank you, ${c.first}. I'll add the coverage to your order now. ${INVOICE(c)}`,
  },
];

export const variantById = (id) => VARIANTS.find((v) => v.id === id) || null;

export const randomVariant = () =>
  VARIANTS[Math.floor(Math.random() * VARIANTS.length)];

// Stable pick for orders logged before A/B testing, so repeat copies keep one tone.
export function fallbackVariant(key) {
  let h = 0;
  for (const ch of String(key || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return VARIANTS[h % VARIANTS.length];
}

export const STAGE_FOR_STATUS = {
  declined: "overcome",
  none: "nudge",
  agreed: "accept",
};
export const stageFor = (status) => STAGE_FOR_STATUS[status] || "pitch";
export const STAGE_TITLE = {
  pitch: "Copy warranty pitch",
  overcome: "Copy soft follow-up (declined)",
  nudge: "Copy follow-up (no answer)",
  accept: "Copy invoice instructions (agreed)",
};

const WON = ["agreed", "paid"];
const LOST = ["declined", "none"];

// Win rate = (agreed + paid) / (agreed + paid + declined + no answer). Other statuses are pending/excluded.
export function variantStats(records) {
  const rows = VARIANTS.map((v, i) => ({
    id: v.id,
    n: i + 1,
    name: v.name,
    sent: 0,
    won: 0,
    lost: 0,
    followUps: 0,
    saves: 0,
    nudges: 0,
    revived: 0,
  }));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const e of records) {
    const r = byId[e.variant];
    if (!r || e.hidden) continue;
    r.sent++;
    if (WON.includes(e.status)) r.won++;
    if (LOST.includes(e.status)) r.lost++;
    if (e.overcome) {
      r.followUps++;
      if (WON.includes(e.status)) r.saves++;
    }
    if (e.nudged) {
      r.nudges++;
      if (WON.includes(e.status)) r.revived++;
    }
  }
  for (const r of rows) {
    const decided = r.won + r.lost;
    r.rate = decided ? r.won / decided : null;
  }
  return rows;
}
