/**
 * The agenda-declaration library.
 *
 * Everything here is a prep link with a kind, gathered from past branch
 * agendas, the party's sites and the recent news sitemap, so a political
 * item can be declared with prep links in a couple of taps.
 *
 * LISTENING_LIBRARY holds audio (Spotify, podcasts).
 */

type ResourceKind = "article" | "youtube" | "spotify" | "podcast";

export interface AgendaResource {
  title: string;
  url: string;
  kind: ResourceKind;
  source?: string;
}

export interface SuggestedTopic {
  title: string;
  leadoff?: string;
  description?: string;
  prep: AgendaResource[];
}

const MARXIST = "https://www.marxist.com";

/** Recurring political topics the branch actually runs, with prep links from the archive. */
export const TOPIC_LIBRARY: SuggestedTopic[] = [
  {
    title: "Cuba and the Restoration of Capitalism",
    leadoff: "JT",
    description: "Fidel Castro's death and why the revolution still lives — the fight for socialist Cuba today.",
    prep: [
      { title: "Fidel Castro has died. The Cuban revolution must live!", url: `${MARXIST}/fidel-castro-has-died-the-cuban-revolution-must-live.htm`, kind: "article", source: "Marxist.com" },
      { title: "Leadoff video: Cuba and the Restoration of Capitalism", url: "https://www.youtube.com/watch?v=LUlEzx5M-lg", kind: "youtube" },
    ],
  },
  {
    title: "The Rise and Fall of the Communist International",
    leadoff: "JT",
    description: "The Comintern's history: from founding to its Stalinist strangling.",
    prep: [
      { title: "The Rise and Fall of the Communist International", url: `${MARXIST}/the-rise-and-fall-of-the-communist-international.htm`, kind: "article", source: "Marxist.com" },
      { title: "History of the RCI Education Hub", url: "https://communist.red/history-of-the-rci-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Mao and the Fight Against Imperialism",
    leadoff: "ML",
    description: "Mao's role in the Chinese revolution and the fight against imperialism.",
    prep: [
      { title: "The new Chinese translation campaign — why we must get the history right", url: `${MARXIST}/the-new-chinese-translation-of-ten-years-war-and-revolution.htm`, kind: "article", source: "Marxist.com" },
      { title: "The Long March to Capitalism", url: `${MARXIST}/china-from-permanent-revolution-to-counter-revolution.htm`, kind: "article", source: "Wellred" },
      { title: "Imperialism Education Hub", url: "https://communist.red/imperialism-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "The American Revolution of 1776",
    leadoff: "FB",
    description: "A Marxist perspective on the founding of the United States.",
    prep: [
      { title: "Revolution and Counter-revolution in America", url: "https://wellredbooks.co.uk/product/revolution-and-counterrevolution-in-america-a-marxist-perspective/", kind: "article", source: "Wellred" },
    ],
  },
  {
    title: "Freshers FAQs — Why We Need a Socialist Revolution",
    leadoff: "All",
    description: "The freshers-facing intro session: answering the questions new members actually ask.",
    prep: [
      { title: "Why you should be a communist (pamphlet)", url: "https://wellredbooks.co.uk/product/why-you-should-be-a-communist-fiona-lali/", kind: "article", source: "Wellred" },
      { title: "Revolution Festival 2026", url: "https://revolutionfestival.co.uk", kind: "article", source: "Freshers" },
    ],
  },
  {
    title: "The National Question",
    leadoff: "KT",
    description: "Lenin on national self-determination and the modern national question.",
    prep: [
      { title: "Marxist.com — the national question", url: `${MARXIST}/national-question.htm`, kind: "article", source: "Marxist.com" },
      { title: "Lenin's Selected Writings 3: The National Question", url: "https://wellredbooks.co.uk/product/lenins-selected-writings-3-the-national-question/", kind: "article", source: "Wellred" },
    ],
  },
  {
    title: "Bonapartism and Fascism",
    leadoff: "WD",
    description: "From Grant's 1946 pamphlet to Trump and the capitalists in command.",
    prep: [
      { title: "Bonapartism and Fascism (Ted Grant, 1946)", url: "https://www.marxists.org/archive/grant/1946/08/frank.htm", kind: "article", source: "Marxists.org" },
      { title: "The Meaning of Donald Trump — a Marxist analysis", url: `${MARXIST}/the-meaning-of-donald-trump-a-marxist-analysis.htm`, kind: "article", source: "Wellred" },
      { title: "Democracy, Bonapartism, Fascism", url: "https://wellredbooks.co.uk/product/democracy-bonapartism-fascism/", kind: "article", source: "Wellred" },
    ],
  },
  {
    title: "What is Imperialism?",
    leadoff: "SR",
    description: "Lenin's theory of imperialism and why it still explains the world.",
    prep: [
      { title: "The relevance of Lenin's Imperialism today", url: `${MARXIST}/the-relevance-of-lenins-imperialism-today.htm`, kind: "article", source: "Marxist.com" },
      { title: "Imperialism, the Highest Stage of Capitalism (chapter 10)", url: "https://www.marxists.org/archive/lenin/works/1916/imp-hsc/ch10.htm", kind: "article", source: "Marxists.org" },
      { title: "Imperialism Education Hub", url: "https://communist.red/imperialism-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "The Revolutionary Solution to Palestine",
    leadoff: "KT",
    description: "The strategy for the Palestinian struggle and how socialists organise in diasporas.",
    prep: [
      { title: "Leadoff: Palestine", url: "https://www.youtube.com/watch?v=Ua_tGtzTHnw", kind: "youtube" },
      { title: "Palestine Education Hub", url: "https://communist.red/palestine-education-hub/", kind: "article", source: "Communist.red" },
      { title: "Israel-Palestine: A Revolutionary Way Forward", url: "https://wellredbooks.co.uk/product/israel-palestine-a-revolutionary-way-forward-2/", kind: "article", source: "Wellred" },
    ],
  },
  {
    title: "The World on Fire — Britain's Austerity Generation",
    leadoff: "SB",
    description: "The youth generation's conditions and the road forward.",
    prep: [
      { title: "The World on Fire movies", url: "https://www.youtube.com/watch?v=KwTm9KKCzSk", kind: "youtube" },
    ],
  },
  {
    title: "Capitalist Crisis and the 2008 Crash",
    leadoff: "GC",
    description: "From the 2008 crash to today's accelerating crisis.",
    prep: [
      { title: "The 2008 crash to now: a decade of crisis", url: "https://communist.red/the-2008-crash-to-now-a-decade-of-crisis/", kind: "article", source: "Communist.red" },
      { title: "Economics Education Hub", url: "https://communist.red/economics-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "The Lessons of 1905 and the Uneven Development of the Revolution",
    leadoff: "MT",
    description: "Trotsky on the 1905 revolution and its lessons.",
    prep: [
      { title: "Colonised states and barbaric backwardness (leadoff, Education Caucus)", url: "https://open.spotify.com/episode/4xny3qnkNwuiYzwn4t9Es0", kind: "spotify", source: "Spotify" },
      { title: "Revolutionary History Education Hub", url: "https://communist.red/revolutionary-history-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Dialectical Materialism",
    leadoff: "SB",
    description: "The Marxist method — how to think dialectically.",
    prep: [
      { title: "Marxism and Philosophy", url: `${MARXIST}/marxism-and-philosophy.htm`, kind: "article", source: "Marxist.com" },
      { title: "Marx's Revolution in Philosophy", url: `${MARXIST}/marx-revolution-in-philosophy.htm`, kind: "article", source: "Marxist.com" },
      { title: "Dialectical Materialism Education Hub", url: "https://communist.red/dialectical-materialism-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Marxism and Art",
    leadoff: "MP",
    description: "Literature and art from a Marxist standpoint.",
    prep: [
      { title: "Is Art Necessary?", url: `${MARXIST}/is-art-necessary.htm`, kind: "article", source: "Marxist.com" },
      { title: "Trotsky, Literature and Revolution", url: "https://www.marxists.org/archive/trotsky/1924/lit_revo/", kind: "article", source: "Marxists.org" },
      { title: "Art Education Hub", url: "https://communist.red/art-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Lenin and the Bolshevik Party",
    leadoff: "JT",
    description: "How Lenin built a party capable of making the revolution.",
    prep: [
      { title: "Base building or Bolshevism?", url: `${MARXIST}/base-building-or-bolshevism.htm`, kind: "article", source: "Marxist.com" },
      { title: "Revolutionary Strategy Education Hub", url: "https://communist.red/revolutionary-strategy-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "The 1917 Revolution",
    leadoff: "SR",
    description: "February to October 1917 — how the workers took power.",
    prep: [
      { title: "Leadoff: 1917", url: "https://www.youtube.com/watch?v=eXzg544UyJ0", kind: "youtube" },
      { title: "Revolutionary History Education Hub", url: "https://communist.red/revolutionary-history-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Iran: Imperialist Plunder and the Working Class",
    leadoff: "KT",
    description: "From the 1979 revolution to today's imperialist interference.",
    prep: [
      { title: "The imperialists and the Pahlavis — hands off Iran", url: `${MARXIST}/imperialists-and-pahlavis-hands-off-iran.htm`, kind: "article", source: "Marxist.com" },
      { title: "Imperialism Education Hub", url: "https://communist.red/imperialism-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "ICE and the General Strike in Minneapolis",
    leadoff: "SB",
    description: "How a city turned against ICE and what the general strike teaches us.",
    prep: [
      { title: "Minneapolis: where is the rebellion going?", url: `${MARXIST}/minnesota-where-is-the-rebellion-going.htm`, kind: "article", source: "Marxist.com" },
      { title: "Fortify or dismantle: an anti-ICE strategy", url: `${MARXIST}/anti-ice.htm`, kind: "article", source: "Marxist.com" },
      { title: "How the police state was rocked", url: "https://www.youtube.com/watch?v=EGBrOxhSqjs", kind: "youtube" },
      { title: "Minneapolis solidarity stream", url: "https://www.youtube.com/watch?v=7FdO671bTjY", kind: "youtube" },
      { title: "State Education Hub", url: "https://communist.red/state-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Malcolm X and the Role of the Individual in History",
    leadoff: "SB",
    description: "The individual's role in history, through Malcolm X's life.",
    prep: [
      { title: "Malcolm X — brotherhood of man", url: `${MARXIST}/malcolm-x-brotherhood-of-man.htm`, kind: "article", source: "Marxist.com" },
      { title: "The Role of the Individual in History", url: `${MARXIST}/the-role-of-the-individual-in-history.htm`, kind: "article", source: "Marxist.com" },
      { title: "Leadoff: Malcolm X", url: "https://www.youtube.com/watch?v=JL9VRNJC8aQ", kind: "youtube" },
      { title: "Revolutionary History Education Hub", url: "https://communist.red/revolutionary-history-education-hub/", kind: "article", source: "Communist.red" },
    ],
  },
  {
    title: "Sudan: From Revolution to Revolution",
    leadoff: "NS",
    description: "The Sudanese revolution and its fate — fresh back from the branch's Sudan drive.",
    prep: [
      { title: "Thawra hatta'l-nasr — Revolution until Victory", url: "https://wellredbooks.co.uk/product/thawra-hattal-nasr-revolution-until-victory/", kind: "article", source: "Wellred" },
    ],
  },
  {
    title: "How to Fight the Far Right",
    leadoff: "District",
    description: "The district's session: mobilising against fascism and the far right.",
    prep: [
      { title: "Fascism Education Hub", url: "https://communist.red/fascism-education-hub/", kind: "article", source: "Communist.red" },
      { title: "Fascism, What it is and How to Fight it", url: "https://wellredbooks.co.uk/product/fascism-what-it-is-and-how-to-fight-it/", kind: "article", source: "Wellred" },
    ],
  },
  {
    title: "The World School of Communism",
    leadoff: "District",
    description: "The World School and how the party trains cadres.",
    prep: [
      { title: "The World School of Communism", url: `${MARXIST}/world-school-of-communism.htm`, kind: "article", source: "Marxist.com" },
    ],
  },
];

/** Recent party coverage — current events for topical sessions. (Dated, Aug 2026.) */
const NEWS_LIBRARY: AgendaResource[] = [
  { title: "Ukraine: drones, delusions and defeat", url: `${MARXIST}/ukraine-drones-delusions-and-defeat.htm`, kind: "article", source: "27 Aug 26" },
  { title: "Burnham commits to prolonging the slaughter", url: `${MARXIST}/buying-time-with-ukrainian-blood-burnham-commits-to-prolonging-the-slaughter.htm`, kind: "article", source: "27 Aug 26" },
  { title: "The existential crisis of European capitalism", url: `${MARXIST}/the-existential-crisis-of-european-capitalism.htm`, kind: "article", source: "24 Aug 26" },
  { title: "Ted Grant: Trotsky's relevance today", url: `${MARXIST}/ted-grant-trotsky-relevance-today.htm`, kind: "article", source: "20 Aug 26" },
  { title: "53 days of struggle — Bolivia's mass movement", url: `${MARXIST}/53-days-of-struggle-a-balance-of-the-bolivian-mass-movement.htm`, kind: "article", source: "27 Aug 26" },
  { title: "The stark fate of Kashmir", url: `${MARXIST}/the-stark-fate-of-kashmir.htm`, kind: "article", source: "19 Aug 26" },
  { title: "Canada: for a working-class response to the trade war", url: `${MARXIST}/canada-for-a-working-class-response-to-the-trade-war.htm`, kind: "article", source: "26 Aug 26" },
  { title: "Burnham and British capitalism bouncing into an abyss", url: `${MARXIST}/burnham-and-british-capitalism-bouncing-into-an-abyss.htm`, kind: "article", source: "19 Aug 26" },
  { title: "Solidarity with Bogdan Syrotiuk, sentenced in Ukraine", url: `${MARXIST}/ukraine-marxist-bogdan-syrotiuk-sentenced-to-15-years-in-prison-a-call-for-solidarity.htm`, kind: "article", source: "19 Aug 26" },
  { title: "15,000 at the first Pan-American Cadre School", url: `${MARXIST}/15-000-for-the-first-pan-american-cadre-school-of-the-revolutionary-communist-international.htm`, kind: "article", source: "24 Aug 26" },
];

/** Audio + video prep for sessions. Add the branch's Spotify dump here. */
const LISTENING_LIBRARY: AgendaResource[] = [
  // Spotify links coming — paste the dump in here as { title, url, kind: "spotify" }.
  { title: "Against the Stream (weekly podcast)", url: `${MARXIST}/against-the-stream.htm`, kind: "podcast", source: "Marxist.com" },
  { title: "The Education Caucus — leadoff on 1905", url: "https://open.spotify.com/episode/4xny3qnkNwuiYzwn4t9Es0", kind: "spotify", source: "Spotify" },
  { title: "Spectre of Communism (podcast)", url: "https://www.youtube.com/@revolutionarycommunists", kind: "youtube", source: "YouTube" },
  { title: "Communist International — rise and fall (audio)", url: `${MARXIST}/the-rise-and-fall-of-the-communist-international.htm`, kind: "podcast", source: "Marxist.com" },
];

const RAW_ALL_RESOURCES: AgendaResource[] = [
  ...TOPIC_LIBRARY.flatMap((t) => t.prep),
  ...NEWS_LIBRARY,
  ...LISTENING_LIBRARY,
];

/** Several topics share a prep link (e.g. multiple imperialism-adjacent
 * sessions all pointing at the same education hub) — dedupe by url so the
 * flat picker list doesn't show (or key) the same resource twice. */
export const ALL_RESOURCES: AgendaResource[] = [...new Map(RAW_ALL_RESOURCES.map((r) => [r.url, r])).values()];