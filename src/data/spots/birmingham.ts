import type { StarterPack, SuggestedLocation } from ".";

/*
 * Campus spots are from the University of Birmingham Edgbaston campus map
 * (building codes in the descriptions); the rest are the city's usual stall
 * and meeting spots.
 */

const spots: SuggestedLocation[] = [
  // ---- Campus (UoB Edgbaston) ----
  { name: "University Main Library", area: "Campus", category: "paper_sale", tags: ["good footfall", "outdoor", "students", "weekdays"], description: "R30 — outside the main entrance, facing the Green Heart" },
  { name: "Green Heart", area: "Campus", category: "uni_stall", tags: ["good footfall", "outdoor", "students"], description: "Open lawn between the Library and Aston Webb; Freshers' and society fairs" },
  { name: "University Centre", area: "Campus", category: "paper_sale", tags: ["good footfall", "students", "weekdays"], description: "R23 — food court and shop; busy 12–2" },
  { name: "Guild of Students", area: "Campus", category: "meeting", tags: ["indoor", "needs booking", "students"], description: "O1 — rooms booked through the Guild; society stalls in the atrium" },
  { name: "Chancellor's Court / Old Joe", area: "Campus", category: "uni_stall", tags: ["outdoor", "students"], description: "Under the clock tower, by Aston Webb" },
  { name: "Aston Webb Student Hub", area: "Campus", category: "paper_sale", tags: ["indoor", "students", "weekdays"], description: "R7 — the semicircle entrance" },
  { name: "University station", area: "Campus", category: "paper_sale", tags: ["good footfall", "outdoor", "commuters", "students", "weekdays"], description: "Station entrance by the Medical School — morning and 5pm rush" },
  { name: "Teaching and Learning Building", area: "Campus", category: "meeting", tags: ["indoor", "needs booking", "step-free"], description: "R32 — bookable rooms" },
  { name: "Nuffield Building", area: "Campus", category: "meeting", tags: ["indoor", "needs booking"], description: "R9 — reading groups" },
  { name: "Murray Learning Centre", area: "Campus", category: "meeting", tags: ["indoor", "free", "step-free"], description: "R28 — open study space, fine for small groups" },
  { name: "Muirhead Tower", area: "Campus", category: "meeting", tags: ["indoor", "needs booking"], description: "R21" },
  { name: "Arts Building", area: "Campus", category: "meeting", tags: ["indoor", "needs booking"], description: "R16" },
  { name: "Sport & Fitness", area: "Campus", category: "paper_sale", tags: ["good footfall", "students"], description: "O7 — outside the entrance" },
  { name: "Underpass near Food Trucks", area: "Campus", category: "uni_stall", tags: ["good footfall", "outdoor", "students"], description: "Bristol Road underpass towards the Vale" },
  { name: "The Vale (student village)", area: "Edgbaston", category: "paper_sale", tags: ["students", "door-knocking", "evenings"], description: "First-year halls — Freshers' fortnight especially" },
  // ---- City centre ----
  { name: "Victoria Square", area: "City centre", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "Near Popeyes" },
  { name: "Library Bridge", area: "City centre", category: "paper_sale", tags: ["good footfall", "outdoor"], description: "Best for 5–6 comrade sales" },
  { name: "Library of Birmingham", area: "City centre", category: "meeting", tags: ["indoor", "free", "step-free", "needs booking"], description: "Centenary Square — bookable rooms; free seating on the terraces" },
  { name: "Centenary Square", area: "City centre", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "In front of the Library and the REP" },
  { name: "New Street station (Stephenson Street)", area: "City centre", category: "paper_sale", tags: ["good footfall", "outdoor", "commuters"], description: "Outside the Grand Central entrance" },
  { name: "Bullring — St Martin's / Rotunda", area: "City centre", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "Top of the Bullring by the Rotunda; very busy Saturdays" },
  { name: "High Street / Corporation Street", area: "City centre", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "Pedestrianised shopping streets" },
  // ---- Selly Oak & Bournbrook ----
  { name: "Selly Oak — Bristol Road", area: "Selly Oak", category: "paper_sale", tags: ["good footfall", "outdoor", "students"], description: "By the Battery retail park / Sainsbury's" },
  { name: "Selly Oak station", area: "Selly Oak", category: "paper_sale", tags: ["commuters", "students", "outdoor"], description: "Station entrance on Bristol Road" },
  { name: "The Soak", area: "Selly Oak", category: "social", tags: ["drinks", "evenings", "students"], description: null },
  { name: "Bournbrook — Tiverton Road", area: "Bournbrook", category: "paper_sale", tags: ["students", "door-knocking", "evenings"], description: "Student houses — door-knocking" },
  // ---- Further out ----
  { name: "Moseley Village", area: "Moseley", category: "paper_sale", tags: ["outdoor", "weekends"], description: "Alcester Road by St Mary's Row" },
  { name: "Moseley Farmers' Market", area: "Moseley", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "Last Saturday of the month" },
  { name: "Kings Heath High Street", area: "Kings Heath", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "By York Road" },
  { name: "Stirchley High Street", area: "Stirchley", category: "paper_sale", tags: ["outdoor", "weekends"], description: "Pershore Road" },
  { name: "Custard Factory", area: "Digbeth", category: "social", tags: ["drinks", "evenings", "weekends"], description: "Gibb Street — cafés and events" },
  { name: "Digbeth High Street", area: "Digbeth", category: "paper_sale", tags: ["outdoor", "good footfall"], description: "Near the coach station" },
  { name: "Jewellery Quarter — Chamberlain Clock", area: "Jewellery Quarter", category: "paper_sale", tags: ["outdoor", "weekends"], description: null },
  { name: "Erdington High Street", area: "Erdington", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: null },
  { name: "Northfield — Bristol Road South", area: "Northfield", category: "paper_sale", tags: ["good footfall", "outdoor", "weekends"], description: "Pedestrian precinct" },
];

export const birmingham: StarterPack = {
  district: "Birmingham",
  areas: ["Campus", "City centre", "Selly Oak", "Bournbrook", "Edgbaston", "Moseley", "Kings Heath", "Stirchley", "Digbeth", "Jewellery Quarter", "Erdington", "Northfield"],
  campus: "University of Birmingham",
  spots,
};
