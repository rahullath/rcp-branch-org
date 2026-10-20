/**
 * The bookstall stock desk — what the branch owns and what's on order.
 * Built from data/education/books.txt with product links cross-referenced
 * against the Wellred catalogue sitemap.
 */

export interface OwnedBook {
  name: string;
  author?: string;
  copies: number;
  wellred?: string;
  note?: string;
}

const WR = "https://wellredbooks.co.uk/product";

export const OWNED_BOOKS: OwnedBook[] = [
  { name: "In Defence of Marxism", author: "Trotsky", copies: 2, wellred: `${WR}/in-defence-of-marxism/` },
  { name: "Bolshevism – The Road to Revolution", author: "Alan Woods", copies: 2, wellred: `${WR}/bolshevism-the-road-to-revolution-2nd-edition/` },
  { name: "What is Marxism?", author: "Alan Woods and Rob Sewell", copies: 1, wellred: `${WR}/what-is-marxism-new-edition/` },
  { name: "The Origin of the Family, Private Property and the State", author: "Engels", copies: 1, wellred: `${WR}/the-origin-of-the-family-private-property-and-the-state/` },
  { name: "Imperialism, the Highest Stage of Capitalism", author: "Lenin", copies: 1, wellred: `${WR}/imperialism-the-highest-stage-of-capitalism/` },
  { name: "China: From Permanent Revolution to Counter-Revolution", author: "Alan Woods", copies: 1, wellred: `${WR}/china-from-permanent-revolution-to-counter-revolution/` },
  { name: "The Class Struggles in France", author: "Marx", copies: 1, wellred: `${WR}/the-class-struggles-in-france/` },
  { name: "The Eighteenth Brumaire of Louis Bonaparte", author: "Marx", copies: 1, wellred: `${WR}/the-eighteenth-brumaire-of-louis-bonaparte/` },
  { name: "The Civil War in France", author: "Marx", copies: 1, wellred: `${WR}/the-civil-war-in-france/` },
  { name: "Ireland", author: "Marx and Engels", copies: 1 },
  { name: "What is to be Done?", author: "Lenin", copies: 1, wellred: `${WR}/what-is-to-be-done/` },
  { name: "The Permanent Revolution (with Results and Prospects)", author: "Trotsky", copies: 1, wellred: `${WR}/the-permanent-revolution-with-results-and-prospects/` },
  { name: "Venezuela: Revolution and Counter-Revolution, 1848 – 1999", author: "Alan Woods", copies: 3 },
  { name: "Marxism and USA", author: "Alan Woods", copies: 2, wellred: `${WR}/marxism-and-the-usa/` },
  { name: "Marxism and Anarchism", author: "Various authors", copies: 1, wellred: `${WR}/marxism-and-anarchism/` },
  { name: "The Revolutionary Legacy of Rosa Luxemburg", author: "Rob Sewell", copies: 2, wellred: `${WR}/the-revolutionary-legacy-of-rosa-luxemburg/` },
  { name: "Ted Grant: The Permanent Revolutionary (Complete Works Vol 1)", author: "Ted Grant", copies: 2, wellred: `${WR}/ted-grant-the-permanent-revolutionary/` },
  { name: "Ted Grant Complete Works Vol 2", author: "Ted Grant", copies: 2 },
  { name: "Lenin on the Imperialist War (Selected Writings 1)", author: "Lenin", copies: 2, wellred: `${WR}/lenin-selected-writings-1-on-imperialist-war/` },
  { name: "Lenin on the Revolutions of 1917 (Selected Writings 2)", author: "Lenin", copies: 2, wellred: `${WR}/lenins-selected-writings-2-the-revolutions-of-1917/` },
  { name: "Germany 1918-33: Socialism or Barbarism", author: "Rob Sewell", copies: 1, wellred: `${WR}/germany-1918-1933-socialism-or-barbarism/` },
  { name: "Materialism and Empirio-Criticism", author: "Lenin", copies: 1, wellred: `${WR}/materialism-and-empirio-criticism/` },
  { name: "The Arab Revolutions", author: "Alan Woods", copies: 1 },
  { name: "Dialectics of Nature", author: "Engels", copies: 1, wellred: `${WR}/dialectics-of-nature/` },
  { name: "The History of British Trotskyism", author: "Ted Grant", copies: 1, wellred: `${WR}/history-of-british-trotskyism/` },
  { name: "Chartist Revolution", author: "Rob Sewell", copies: 1, wellred: `${WR}/chartist-revolution/` },
  { name: "In the Cause of Labour", author: "Rob Sewell", copies: 1, wellred: `${WR}/in-the-cause-of-labour/` },
  { name: "Colossus: The Rise and Fall of US Imperialism", author: "Rob Sewell", copies: 1, wellred: `${WR}/colossus-the-rise-and-decline-of-us-imperialism/` },
  { name: "In Defence of Lenin Vol 1", author: "Rob Sewell and Alan Woods", copies: 1, wellred: `${WR}/in-defence-of-lenin/` },
  { name: "Trotsky's Writings on Britain", author: "Trotsky", copies: 1, wellred: `${WR}/trotskys-writings-on-britain/` },
  { name: "Understanding Marx's Capital", author: "Adam Booth", copies: 1, wellred: `${WR}/understanding-marxs-capital/` },
];

export const OWNED_PAMPHLETS: OwnedBook[] = [
  { name: "General Strikes", copies: 3, wellred: `${WR}/general-strike-in-the-cause-of-labour-bundle/` },
  { name: "Marxism vs Identity Politics", copies: 2, wellred: `${WR}/marxism-or-identity-politics/` },
  { name: "Israel-Palestine: A Revolutionary Way Forward", copies: 5, wellred: `${WR}/israel-palestine-a-revolutionary-way-forward-2/` },
  { name: "Introduction to Dialectics", copies: 6 },
  { name: "Marxism and Science", copies: 3 },
  { name: "Germany: Revolution to Counter-Revolution", copies: 1 },
  { name: "How to be a Communist", copies: 2 },
  { name: "Build the Revolutionary Press", copies: 2 },
  { name: "Fascism and How to Fight it", copies: 2, wellred: `${WR}/fascism-what-it-is-and-how-to-fight-it/` },
  { name: "The Programme of the International", copies: 5, wellred: `${WR}/programme-of-the-international/` },
  { name: "The Meaning of Donald Trump", copies: 2, wellred: `${WR}/the-meaning-of-donald-trump-a-marxist-analysis/` },
  { name: "The Transitional Programme", copies: 5, wellred: `${WR}/transitional-programme/` },
  { name: "Introduction to Economics", copies: 5 },
];

export interface PlannedBook {
  name: string;
  wellred?: string;
  note?: string;
}

export const PLANNED_ORDER: PlannedBook[] = [
  { name: "Why You Should Be a Communist", wellred: `${WR}/why-you-should-be-a-communist-fiona-lali/` },
  { name: "The Classics of Marxism Volume 1 (new edition)", wellred: `${WR}/the-classics-of-marxism-volume-one/` },
  { name: "The Classics of Marxism Volume 2", wellred: `${WR}/the-classics-of-marxism-volume-two/` },
  { name: "The Communist Manifesto (pamphlet)", wellred: `${WR}/the-communist-manifesto/` },
  { name: "The Fall of Woman (IDOM)", note: "link TBC" },
  { name: "Reform or Revolution (IDOM)", wellred: `${WR}/reformism-or-revolution/` },
  { name: "Identity Politics (pamphlet)", wellred: `${WR}/marxism-or-identity-politics/` },
  { name: "The Rojava Revolution (IDOM)", wellred: `${WR}/idom-53-the-rojava-revolution/` },
  { name: "China (pamphlet)", wellred: `${WR}/china-from-permanent-revolution-to-counter-revolution/` },
];