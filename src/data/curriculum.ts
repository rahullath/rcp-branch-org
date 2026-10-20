/**
 * The branch teaching curriculum, taken from the party's education
 * spreadsheet (data/education/Educational spreadsheet - Sheet1.csv).
 * `wellred` links to the product page so a chapter is one tap from the
 * bookshop that carries it.
 */

export interface CurriculumChapter {
  title: string;
  author: string;
  wellred?: string;
}

export interface CurriculumTrack {
  id: string;
  name: string;
  description: string;
  items: CurriculumChapter[];
}

const WR = "https://wellredbooks.co.uk/product";

export const CURRICULUM: CurriculumTrack[] = [
  {
    id: "intro",
    name: "Introductory Programme",
    description: "Months 1–12 — the foundation every new member works through.",
    items: [
      { title: "What is Marxism?", author: "Alan Woods and Rob Sewell", wellred: `${WR}/what-is-marxism-new-edition/` },
      { title: "Marxism 101", author: "Key articles and a Marxist FAQ on Marxist.com" },
      { title: "What will socialism look like?", author: "Ben Gliniecki" },
      { title: "The Communist Manifesto", author: "Marx and Engels", wellred: `${WR}/the-communist-manifesto/` },
      { title: "Socialism: Utopian and Scientific", author: "Engels" },
      { title: "The State and Revolution", author: "Lenin", wellred: `${WR}/state-and-revolution/` },
      { title: "The Transitional Programme", author: "Trotsky", wellred: `${WR}/transitional-programme/` },
      { title: "Wage Labour and Capital", author: "Marx" },
      { title: "Value, Price and Profit", author: "Marx" },
      { title: "“Left-Wing” Communism: an Infantile Disorder", author: "Lenin", wellred: `${WR}/left-wing-communism-an-infantile-disorder/` },
      { title: "In Defence of October", author: "Alan Woods" },
      { title: "Stalinism and Bolshevism", author: "Trotsky" },
      { title: "Preface to A Contribution to the Critique of Political Economy", author: "Marx" },
      { title: "The Origin of the Family, Private Property and the State", author: "Engels", wellred: `${WR}/the-origin-of-the-family-private-property-and-the-state/` },
      { title: "Imperialism, the Highest Stage of Capitalism", author: "Lenin", wellred: `${WR}/imperialism-the-highest-stage-of-capitalism/` },
      { title: "Lessons of October", author: "Trotsky" },
      { title: "The Revolution Betrayed", author: "Trotsky", wellred: `${WR}/the-revolution-betrayed/` },
      { title: "The ABC of Materialist Dialectics", author: "Trotsky" },
      { title: "The Programme of the International", author: "Ted Grant", wellred: `${WR}/programme-of-the-international/` },
      { title: "The Theory of Permanent Revolution: Basic Postulates", author: "Trotsky" },
      { title: "Marxism vs Identity Politics", author: "Marxist.com", wellred: `${WR}/marxism-or-identity-politics/` },
      { title: "Marxism vs Postmodernism", author: "Marxist.com" },
      { title: "Why Marxists Oppose Individual Terrorism", author: "Trotsky" },
      { title: "Marxism and Religion", author: "Alan Woods" },
      { title: "Introduction to What is To Be Done", author: "Rob Sewell", wellred: `${WR}/what-is-to-be-done/` },
    ],
  },
  {
    id: "intermediate",
    name: "Intermediate Programme",
    description: "To be read in the first 1–3 years.",
    items: [
      { title: "Bolshevism – The Road to Revolution", author: "Alan Woods", wellred: `${WR}/bolshevism-the-road-to-revolution-2nd-edition/` },
      { title: "Ludwig Feuerbach and the End of German Classical Philosophy", author: "Engels" },
      { title: "The Class, The Party, and the Leadership", author: "Trotsky" },
      { title: "Critique of the Gotha Programme", author: "Marx" },
      { title: "Anti-Dühring", author: "Engels", wellred: `${WR}/anti-duhring/` },
      { title: "Their Morals and Ours", author: "Trotsky" },
      { title: "Results and Prospects", author: "Trotsky", wellred: `${WR}/the-permanent-revolution-with-results-and-prospects/` },
      { title: "The Permanent Revolution", author: "Trotsky", wellred: `${WR}/the-permanent-revolution-and-results-and-prospects/` },
      { title: "What is to be Done?", author: "Lenin", wellred: `${WR}/what-is-to-be-done/` },
      { title: "The Right of Nations to Self Determination", author: "Lenin" },
      { title: "Fascism: What it is and how to fight it", author: "Trotsky", wellred: `${WR}/fascism-what-it-is-and-how-to-fight-it/` },
      { title: "Reform or Revolution?", author: "Rosa Luxemburg", wellred: `${WR}/reformism-or-revolution/` },
      { title: "Ted Grant: The Permanent Revolutionary", author: "Alan Woods", wellred: `${WR}/ted-grant-the-permanent-revolutionary/` },
      { title: "The Class Struggles in France", author: "Marx", wellred: `${WR}/the-class-struggles-in-france/` },
      { title: "The Eighteenth Brumaire of Louis Bonaparte", author: "Marx", wellred: `${WR}/the-eighteenth-brumaire-of-louis-bonaparte/` },
      { title: "The Civil War in France", author: "Marx", wellred: `${WR}/the-civil-war-in-france/` },
      { title: "Understanding Marx's Capital", author: "Adam Booth", wellred: `${WR}/understanding-marxs-capital/` },
      { title: "In The Cause of Labour", author: "Rob Sewell", wellred: `${WR}/in-the-cause-of-labour/` },
      { title: "Lenin and Trotsky: What they really stood for", author: "Alan Woods and Ted Grant", wellred: `${WR}/lenin-and-trotsky-what-they-really-stood-for/` },
      { title: "Marxism and Anarchism", author: "Various authors", wellred: `${WR}/marxism-and-anarchism/` },
      { title: "Russia – From Revolution to Counter-revolution", author: "Ted Grant", wellred: `${WR}/russia-from-revolution-to-counter-revolution/` },
      { title: "Ten Days That Shook the World", author: "John Reed", wellred: `${WR}/ten-days-that-shook-the-world-2/` },
      { title: "The History of Philosophy", author: "Alan Woods", wellred: `${WR}/the-history-of-philosophy/` },
      { title: "Germany 1918-33: Socialism or Barbarism", author: "Rob Sewell", wellred: `${WR}/germany-1918-1933-socialism-or-barbarism/` },
      { title: "Marxism vs Sectarianism", author: "Marxist.com" },
      { title: "The Origins of Class Society", author: "Marxist.com" },
      { title: "Marxism vs Queer Theory", author: "Marxist.com" },
      { title: "The American Civil War", author: "Marxist.com" },
    ],
  },
  {
    id: "advanced",
    name: "Advanced Programme",
    description: "The longer works, for comrades who have been through the basics.",
    items: [
      { title: "The History of the Russian Revolution", author: "Trotsky", wellred: `${WR}/the-history-of-the-russian-revolution-complete-set/` },
      { title: "Stalin", author: "Trotsky", wellred: `${WR}/stalin/` },
      { title: "In Defence of Marxism", author: "Trotsky", wellred: `${WR}/in-defence-of-marxism/` },
      { title: "My Life", author: "Trotsky", wellred: `${WR}/my-life/` },
      { title: "The Unbroken Thread", author: "Ted Grant" },
      { title: "Dialectics of Nature", author: "Engels", wellred: `${WR}/dialectics-of-nature/` },
      { title: "Reason in Revolt", author: "Ted Grant and Alan Woods", wellred: `${WR}/reason-in-revolt/` },
      { title: "Trotsky's Writings on Britain", author: "Trotsky", wellred: `${WR}/trotskys-writings-on-britain/` },
      { title: "The First Five Years of the Communist International", author: "Trotsky", wellred: `${WR}/the-first-five-years-of-the-communist-international/` },
      { title: "The Crisis of the French Section", author: "Trotsky", wellred: `${WR}/the-crisis-of-the-french-section-1935-36/` },
      { title: "Materialism and Empirio-Criticism", author: "Lenin", wellred: `${WR}/materialism-and-empirio-criticism/` },
      { title: "The German Ideology", author: "Marx and Engels" },
      { title: "Marx and Engels – Selected Correspondence", author: "Marx and Engels" },
      { title: "The History of British Trotskyism", author: "Ted Grant", wellred: `${WR}/history-of-british-trotskyism/` },
      { title: "Problems of Everyday Life", author: "Trotsky", wellred: `${WR}/problems-of-everyday-life/` },
      { title: "The Struggle for a Proletarian Party", author: "Cannon", wellred: `${WR}/the-struggle-for-a-proletarian-party/` },
      { title: "The Third International after Lenin", author: "Trotsky" },
      { title: "Chartist Revolution", author: "Rob Sewell", wellred: `${WR}/chartist-revolution/` },
      { title: "China: From Permanent Revolution to Counter-Revolution", author: "Alan Woods", wellred: `${WR}/china-from-permanent-revolution-to-counter-revolution/` },
      { title: "In Defence of Lenin", author: "Rob Sewell and Alan Woods", wellred: `${WR}/in-defence-of-lenin/` },
      { title: "In Defence of Marxism 1 – 44", author: "Theory journal (back issues)", wellred: `${WR}/in-defence-of-marxism-subscription/` },
    ],
  },
  {
    id: "big-ones",
    name: "The Big Ones",
    description: "The mountains. Companion volumes exist for each.",
    items: [
      { title: "Capital", author: "Marx", wellred: `${WR}/capital-volume-i-penguin/` },
      { title: "Lenin's Selected Works (3 Volumes)", author: "Lenin" },
      { title: "Trotsky's Writings 1929 – 1940", author: "Trotsky", wellred: `${WR}/writings-of-leon-trotsky-1929/` },
    ],
  },
];

/** The series the app actually schedules against (education/programme pages). */
export const PROGRAMME_SERIES: { id: string; name: string; description: string }[] = [
  {
    id: "classics",
    name: "The Six Classics",
    description: "The core texts every comrade reads through — the branch's reading-group spine.",
  },
  { id: "intro", name: "Introductory Programme", description: "Months 1–12 — the foundation every new member works through." },
  { id: "intermediate", name: "Intermediate Programme", description: "To be read in the first 1–3 years." },
  { id: "advanced", name: "Advanced Programme", description: "The longer works, for comrades who have been through the basics." },
  { id: "big-ones", name: "The Big Ones", description: "The mountains. Companion volumes exist for each." },
];

export function seriesName(seriesId: string): string {
  return PROGRAMME_SERIES.find((s) => s.id === seriesId)?.name ?? `Series ${seriesId}`;
}

export function seriesDescription(seriesId: string): string {
  return PROGRAMME_SERIES.find((s) => s.id === seriesId)?.description ?? "";
}