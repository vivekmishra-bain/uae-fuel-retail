"use client"

import dynamic from "next/dynamic"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, ChevronDown, ChevronLeft, Fuel, Layers3, Store } from "lucide-react"
import type { OperatorFilter } from "@/components/netsight-map"
import type { Station, Zone, MeasuredNfrFormat, NfrFormatId, NfrOppBucket, NfrValueTier } from "@/lib/netsight"
import { ABSENCE_FILL, ABSENCE_STROKE, ARCHETYPE_LABEL, DEFAULT_LOWER, DEFAULT_UPPER, EMARAT_COUNT, EMARAT_STATIONS, FORMATS, NFR_BUCKET_LABEL, NO_DEMAND_DASH, NO_TRAFFIC_DASH, ACTION_GROUP, ACTION_GROUP_FILL, ACTION_GROUP_KEYS, ACTION_GROUP_META, ARCHETYPE_NOTE, MEASURED_NFR_FORMATS, MEASURED_NFR_FORMAT_FILL, MEASURED_NFR_SHORT_LABEL, OPP_DEPTH_RAMP, SUGGESTED_NFR_FORMATS, isShortOn, measuredGapCount, nfrFormatViewFill, nfrFormatViewLabel, type ActionGroupKey, type NfrFormatView, fuelClassColors, NFR_BUCKET_NOTE, NFR_BUCKET_ORDER, NFR_DEFAULT_LOWER, NFR_DEFAULT_UPPER, NFR_VALUE_TIERS, analyticalStatus, archetype, breakpoint, cannibalisationAssumptions, category, dataStatus, dataValid, flaggedCannibalisationStationIds, fuelAction, gapType, hav, huffSplit, isMeasuredNfrFormat, measuredGapFormats, nearestStation, networkStationScores, nfrFormatState, nfrMultiFormatById, nfrOppBucket, nfrOpportunityCounts, nfrOpportunityZones, nfrSupplyCount, nfrValueTier, oppServedFill, stationHuffResults, winsorizeLQ, stationZone, stations, zones } from "@/lib/netsight"

const Map = dynamic(()=>import("@/components/netsight-map").then((m)=>m.NetSightMap),{ssr:false,loading:()=> <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">Loading analytical geography…</div>})
type Tab="fuel"|"nfr"|"combined"|"sources"
const operatorOptions:{id:OperatorFilter;label:string;dot:string|null;tip?:string}[]=[{id:"All",label:"All",dot:null},{id:"Emarat",label:"Emarat",dot:"#16834a"},{id:"ENOC/EPPCO",label:"ENOC/EPPCO",dot:"#e8781c"},{id:"ADNOC",label:"ADNOC",dot:"#2166ae"},// "Other" named nothing. The chip is a real category — everyone who is not one of the three named
// brands — so it says so, with the full definition on hover rather than leaving the reader to guess
// whether it means "unknown operator" or "the rest of the market".
{id:"Other",label:"Other",dot:"#808892",tip:"Independents and unbranded stations — not Emarat, ENOC/EPPCO or ADNOC."}]
const tabs:{id:Tab;label:string}[]=[{id:"fuel",label:"Fuel gaps"},{id:"nfr",label:"Non-fuel gaps"},{id:"combined",label:"Action map"},{id:"sources",label:"Sources & Definitions"}]
const nfrFormatOptions:{id:NfrFormatId;label:string}[]=[
 {id:"f_and_b",label:"Restaurants / F&B"},{id:"cstore",label:"C-Store / convenience"},{id:"bakeria",label:"Bakeria / bakery"},
 {id:"carwash",label:"Car wash"},{id:"lube",label:"Lube / oil change"},{id:"vtc",label:"Vehicle testing centre"},
]
// NO LOCATION-PROFILE FILTER OR COLOUR MODE ON THIS TAB. The affluence / land-use tier no longer
// drives the opportunity colour at all — the colour is the measured shortfall and its count — and it
// is still not exposed as a second colouring of the same hexes or as a filter. One map, one meaning
// for its colour. Where an area IS is now named in words: on the sticker's kicker, and as the chips
// breaking down the opportunity card.
// ONE SUGGESTIONS BUCKET. The panel used to split "Measured gaps — set the colour" from
// "Suggestions", which asked the reader to hold two lists in mind and made the measured entries
// look like a different kind of recommendation. Both are now one list of things to consider; what
// differs is the REASON tag each entry carries, which is the only honest distinction between them.
//
// STILL KEYED BY `nfrValueTier`, and this is now the tier's ONLY job. It is the right key here
// because what to propose genuinely does depend on buying power — a high-end C-Store and a value
// C-Store are different propositions in the same-sized gap — whereas what the map paints and what the
// chips count depend on the measured shortfall and the land use, which is why those moved off it.
// Deliberately not a second archetype-keyed table: an older one let a commercial hex be shown premium
// copy while the map disagreed. The guardrails below still prove this wording cannot reach the
// measured result.
//
// `format` is present ONLY on the three measured formats and is what lets a measured entry pick up
// its evidence tag. The affluence variant is WORDING on that entry — it renames the proposition
// ("high-end convenience" vs "value convenience") without touching which formats are surveyed or
// what the index says, which is the guardrail asserted below.
type Suggestion={label:string;format?:MeasuredNfrFormat}
const SUGGESTIONS_BY_TIER:Record<NfrValueTier,Suggestion[]>={
 premium:[
  {label:"High-end convenience C-Store",format:"cstore"},
  {label:"Artisan Bakeria"},
  {label:"Premium car wash & detailing",format:"carwash"},
  {label:"Pharmacy / specialty"},
  {label:"Cafe / casual dining",format:"f_and_b"},
 ],
 mid:[
  {label:"Value convenience C-Store",format:"cstore"},
  {label:"Value bakery"},
  {label:"Car wash",format:"carwash"},
  {label:"LubeX"},
  {label:"Food & beverage",format:"f_and_b"},
 ],
 functional:[
  {label:"Bulk / forecourt convenience C-Store",format:"cstore"},
  {label:"LubeX"},
  {label:"Tyre & quick service"},
  {label:"Workers’ cafeteria",format:"f_and_b"},
  {label:"Car wash",format:"carwash"},
 ],
 // Land use is not established, so no format can be suggested for it at all.
 "profile-unknown":[],
}
// The tier's own name for a measured format. Falls back to nothing so a tier that names only some
// formats says nothing about the rest, rather than inventing a label.
const variantLabel=(tier:NfrValueTier,format:MeasuredNfrFormat)=>SUGGESTIONS_BY_TIER[tier].find((entry)=>entry.format===format)?.label
// Read through a mutable holder so the independence check below can genuinely empty the table and
// recompute, instead of asserting independence by inspection.
let suggestionTable:Record<NfrValueTier,Suggestion[]>=SUGGESTIONS_BY_TIER
const suggestionsFor=(tier:NfrValueTier)=>suggestionTable[tier]
// ONE definition of the measured set, shared by the grid and the checks below, so a check can
// never be testing a different three formats from the ones the panel renders.
const measuredOptions=nfrFormatOptions.filter(({id})=>isMeasuredNfrFormat(id))
const unsurveyedLiveCount=zones.filter((z)=>z.live&&nfrOppBucket(z)==="not-observed").length
if(typeof window!=="undefined"){
 const live=zones.filter((z)=>z.live)
 // 1. Emptying every Class 2 list must leave the gap count AND the colour bucket untouched.
 const fingerprint=()=>live.map((z)=>`${measuredGapFormats(z,NFR_DEFAULT_LOWER).join("+")}@${nfrOppBucket(z,NFR_DEFAULT_LOWER)}`).join(",")
 const original=suggestionTable
 const before=fingerprint()
 suggestionTable={premium:[],mid:[],functional:[],"profile-unknown":[]}
 const emptied=fingerprint()
 suggestionTable=original
 if(before!==emptied)console.warn("[v0] Class 2 suggestions are reaching the gap count or the hex colour — emptying the suggestion table changed the measured result.")
 // 2. THE STATED GUARDRAIL: renaming a suggestion is WORDING ONLY. Rewrite every label to a
 // nonsense string — keeping each entry's `format` — and the gap count and hex colour must be
 // byte-identical. This is stronger than check 1 (which empties the table) because it proves the
 // affluence variant specifically, i.e. that "high-end convenience" vs "value convenience" cannot
 // reach the measured result even though those entries DO carry a format id.
 const renamed=Object.fromEntries(NFR_VALUE_TIERS.map((tier)=>[tier,SUGGESTIONS_BY_TIER[tier].map((entry,index)=>({...entry,label:`renamed-${index}`}))])) as Record<NfrValueTier,Suggestion[]>
 suggestionTable=renamed
 const afterRename=fingerprint()
 suggestionTable=original
 if(before!==afterRename)console.warn("[v0] Renaming a suggestion changed the gap count or the hex colour — the affluence variant is reaching the measured result.")
 // 3. Each tier may name a measured format AT MOST ONCE, or one format would appear twice in the
 // single list with two different names and the reader could not tell which one the evidence
 // belongs to.
 const dupeFormats=NFR_VALUE_TIERS.flatMap((tier)=>{
  const named=SUGGESTIONS_BY_TIER[tier].map((entry)=>entry.format).filter(Boolean)
  return named.filter((format,index)=>named.indexOf(format)!==index).map((format)=>`${tier}:${format}`)
 })
 if(dupeFormats.length>0)console.warn(`[v0] A tier names one measured format more than once, so it would render twice: ${dupeFormats.join(", ")}.`)
 // 4. Every tier that suggests anything must name ALL THREE measured formats. A tier that omitted
 // one could never show its evidence tag, so a real shortfall would silently render as a plain
 // archetype suggestion — the understatement this panel exists to avoid.
 const missingFormats=NFR_VALUE_TIERS.filter((tier)=>SUGGESTIONS_BY_TIER[tier].length>0).flatMap((tier)=>{
  const named=new Set(SUGGESTIONS_BY_TIER[tier].map((entry)=>entry.format).filter(Boolean))
  return measuredOptions.filter(({id})=>!named.has(id as MeasuredNfrFormat)).map(({id})=>`${tier}:${id}`)
 })
 if(missingFormats.length>0)console.warn(`[v0] A tier does not name every measured format, so a shortfall there would render untagged: ${missingFormats.join(", ")}.`)
 // 5. Vacuity guard: supply must actually vary across live hexes, or checks 1-2 would pass without
 // ever exercising a measured entry.
 const supplyPatterns=new Set(live.map((z)=>measuredOptions.map(({id})=>(nfrSupplyCount(z,id)>0?"1":"0")).join("")))
 if(supplyPatterns.size<2)console.warn("[v0] Suggestion-independence checks are vacuous: observed supply does not vary across live hexes.")
}
  // THE FIVE ACTIONS ARE KEYED TO THE MAP'S OWN GROUP KEYS, not retyped as free text. An earlier card
  // named four actions when the map paints five, and used a retired label ("Consolidate / relocate") —
  // exactly the drift a hand-kept list invites. Keying to ACTION_GROUP_KEYS means the card enumerates
  // the same five groups the Action map does, and a group added or removed shows up here immediately.
  //
  // The PHRASING is the landing's own plain-verb form rather than the legend string, because the legend
  // labels carry qualifiers ("(add retail to an existing station)", "Over-served / potential
  // cannibalisation") that read as map keys, not as a sentence. So the words differ deliberately while
  // the SET cannot: the assert below fires if a key ever exists without a phrase, which is the failure
  // that would otherwise silently shorten the list back to four.
  const ACTION_PHRASE:Record<(typeof ACTION_GROUP_KEYS)[number],string>={integrate:"integrate a new site",grow:"grow",fuel:"add or relocate fuel",overserved:"consolidate",retain:"retain"}
  const actionLabels=ACTION_GROUP_KEYS.map((k)=>ACTION_PHRASE[k])
  if(actionLabels.some((l)=>!l))console.warn("[v0] Landing card 3 is missing a phrase for an Action-map group — the card now names fewer actions than the map paints.")
  // TWO TIERS PER CARD, NO THIRD BLOCK. `lead` is the bold near-black sentence, `text` the grey
  // support sentence, and every card carries exactly those two — the step numeral and card 3's
  // separate label line are both gone. Card 3's five actions are now FOLDED INTO ITS LEAD as a plain
  // clause, which is what lets all three share one structure and keeps card 3 to a single extra line.
  // The action words still route through `actionLabels`, so the card cannot name an action the map
  // does not paint, and the British-vs-legend spelling divergence is still flagged by the assert above.
  // Order follows ACTION_GROUP_KEYS, i.e. the order the map's own legend lists them, so a reader
  // comparing card to legend walks the same sequence. The phrases are already lowercase sentence-case,
  // so no case-forcing is applied that could mangle a future proper noun.
  const actionClause=`${actionLabels.slice(0,-1).join(", ")} or ${actionLabels[actionLabels.length-1]}`
  const features=[
  {icon:Fuel,title:"Fuel gaps",lead:"Scores each area's fuel provision against observed traffic demand.",text:"Shows at a glance where the network looks over-served and where fuel looks short."},
  {icon:Store,title:"Non-fuel gaps",lead:"Treats C-Store, Bakeria, Car Wash, LubeX, VTC and Shop Rentals as six distinct lines.",text:"This demo covers only that observable subset; the full engagement spans the complete network."},
  {icon:Layers3,title:"Action map",lead:`Crosses the fuel and non-fuel reads into one recommendation per area: ${actionClause}.`,text:"Fuel demand decides whether an area acts; the retail read shapes the kind of opportunity."},
  ]

function Stamp({onDark=false}:{onDark?:boolean}){return <span className={`whitespace-nowrap border px-2.5 py-1 text-[13px] font-bold uppercase tracking-[.12em] ${onDark?"border-white/25 bg-white/10 text-white/85":"border-border bg-muted text-muted-foreground"}`}>Demo · Dubai urban study area · based on preliminary data</span>}
// EVERY LABEL CARRIES ITS UNIT. "Traffic 200" beside "Stations 236" invited the reader to compare
// two counts of different things; the unit is what makes each row self-explanatory.
//
// THE EMARAT ROW REPORTS WHAT WE HOLD, NOT WHAT WE EXPECT TO HOLD. This box is a census of the
// files the analysis actually ran on, and its footer asserts they are loaded and aligned — so the
// count here has to be the measured one (66 records), which is also what every station figure
// elsewhere in the app is derived from. Emarat's published list is ~62 inside the Dubai boundary
// excluding Hatta, and exactly 1 of our 66 sits in Hatta, so excluding it gives 65 and leaves ~3
// unexplained. That gap is a real open reconciliation, so it is STATED as its own line rather than
// resolved by overwriting the census with the target — a printed 62 would contradict the 66 records
// driving the map and would make an unfinished reconciliation look finished.
// Counted, not asserted. The Hatta exclave sits east of the main emirate, so the stations there are
// the ones the published Dubai list excludes; deriving the figure means the sentence re-states
// itself if the dataset changes rather than going on claiming a number that was true once.
// THE COVERAGE QA CARD IS GONE: hex, population, affluence, polygon and station counts, coordinate
// mismatches, missing hex associations and the "all core files loaded and geographically aligned"
// line. Those were build diagnostics, readable to whoever assembled the files and not to the client.
//
// THE STATION COUNT RECONCILIATION CARD IS ALSO GONE, removed on instruction and deliberately NOT
// re-homed elsewhere on the tab. It had been held here as the one client-facing disclosure that the
// count is unsettled, so note what its removal costs: the tab no longer says anywhere that the ~62
// published Emarat stations and the records the map is built on disagree. Flagged in the reply.
// THE QA METRICS SURVIVE FOR ONE CALLER ONLY: the app-wide load-failure screen, which is what the
// `!dataValid` gate renders instead of the tool. That screen exists to say WHICH file or join broke,
// so stripping its counts there would have turned a diagnostic into a bare error with no diagnosis.
// It is a different screen from the Sources tab, and this pass is scoped to the tab, so the component
// is simply no longer rendered beside the definitions.
function LoadFailure(){const rows=[["Traffic",`${dataStatus.traffic} hexes`],["Population",`${dataStatus.population} hexes`],["Affluence",`${dataStatus.affluence} hexes`],["NFR active polygons",`${dataStatus.nfrFormats} polygons`],["Stations",`${dataStatus.stations} stations`],["Emarat stations",`${EMARAT_COUNT} stations`],["Raw joined hexes",`${analyticalStatus.rawJoined} hexes`],["Dubai analytical zones",`${analyticalStatus.dubaiZones} zones`],["Coordinate mismatches",`${dataStatus.coordinateMismatches}`],["Missing hex associations",`${dataStatus.missingHexAssociations}`]];return <section className="border border-primary bg-primary/5 p-4" aria-label="Data load failure"><div className="mb-3 flex items-center justify-between"><h3 className="text-[15px] font-bold uppercase tracking-[.14em]">Coverage (analysis hexes and stations)</h3><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"/></div><dl className="grid gap-y-2 text-[16px]">{rows.map(([k,v])=><div className="flex justify-between gap-3" key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-mono font-bold tabular-nums">{v}</dd></div>)}</dl><p className="mt-3 border-t pt-2.5 text-[16px] font-semibold">Error · file counts, ids or coordinates are not aligned</p></section>}

export function NetSightApp(){const [landing,setLanding]=useState(true);const [tab,setTab]=useState<Tab>("fuel");const [lower,setLower]=useState(DEFAULT_LOWER);const [upper,setUpper]=useState(DEFAULT_UPPER);const [nfrLower,setNfrLower]=useState(NFR_DEFAULT_LOWER);const [nfrUpper,setNfrUpper]=useState(NFR_DEFAULT_UPPER);const [selectedZone,setSelectedZone]=useState<Zone|null>(null);const [selectedStation,setSelectedStation]=useState<Station|null>(null);const [showZones,setShowZones]=useState(true);const [networkView,setNetworkView]=useState(false);const [activeInsight,setActiveInsight]=useState<Insight|null>(null);const [operatorFilter,setOperatorFilter]=useState<OperatorFilter>("All")
 const associatedZone=useMemo(()=>selectedStation?stationZone(selectedStation):selectedZone,[selectedStation,selectedZone])
 const split=useMemo(()=>{if(selectedStation)return stationHuffResults.get(selectedStation.id)??null;return selectedZone?huffSplit(selectedZone.lat,selectedZone.lon):null},[selectedStation,selectedZone])
 // The `reilly` memo is deleted along with the overlay and the sentence it fed. Nothing computes a
 // breakpoint at render time now, so the callout cannot be revived by accident from leftover state.
 function open(t:Tab){setLanding(false);setTab(t);setSelectedZone(null);setSelectedStation(null);setActiveInsight(null)}
 if(landing)return <Landing onOpen={()=>open("fuel")}/>
 return <main className="min-h-dvh bg-background"><header className="sticky top-0 z-[1000] bg-black text-white"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-5 px-4 py-3 lg:px-7"><button onClick={()=>setLanding(true)} className="flex items-center gap-3 text-left"><img src="/logo.png" alt="Logo" className="h-12 w-auto shrink-0 self-start -mt-2 object-contain" /><span><span className="block text-xl font-black leading-none text-white">Network Health Explorer</span><span className="mt-1 block text-[13px] uppercase tracking-[.15em] text-white/70">Dubai demo · public data only</span></span></button><Stamp onDark/></div><nav className="mx-auto flex max-w-[1600px] overflow-x-auto px-4 lg:px-7" aria-label="Application sections">{tabs.map((t)=><button key={t.id} onClick={()=>open(t.id)} className={`shrink-0 border-b-[3px] px-4 py-3 text-base font-semibold ${tab===t.id?"border-primary text-white":"border-transparent text-white/65 hover:text-white"}`}>{t.label}</button>)}</nav></header>
 {!dataValid?<div className="mx-auto max-w-3xl p-8"><LoadFailure/></div>:tab==="sources"?<Sources/>:<Workspace tab={tab} lower={lower} upper={upper} onLower={setLower} onUpper={setUpper} nfrLower={nfrLower} nfrUpper={nfrUpper} onNfrLower={setNfrLower} onNfrUpper={setNfrUpper} selectedZone={selectedZone} selectedStation={selectedStation} onZone={(z)=>{setSelectedZone(z);setSelectedStation(null)}} onStation={(s)=>{setSelectedStation(s);setSelectedZone(null)}} split={split} associatedZone={associatedZone} showZones={showZones} onToggleZones={setShowZones} networkView={networkView} onNetworkView={setNetworkView} activeInsight={activeInsight} onInsight={(insight)=>{setActiveInsight(insight);setSelectedZone(null);setSelectedStation(null)}} operatorFilter={operatorFilter} onOperatorFilter={setOperatorFilter}/>}</main>
}

function Landing({onOpen}:{onOpen:()=>void}){return <main className="min-h-dvh bg-background"><header className="bg-black text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4"><div className="flex items-center gap-3"><img src="/logo.png" alt="Logo" className="h-12 w-auto shrink-0 self-start -mt-2 object-contain" /><span className="text-xl font-black text-white">Fuel Retail Network Health Explorer</span></div><Stamp onDark/></div></header><section className="mx-auto max-w-7xl px-5 py-8"><div><p className="mb-3 text-sm font-bold uppercase tracking-[.18em] text-primary">Retail network intelligence</p>{/* H1 down one step (7xl to 6xl) so it still dominates but stops pushing the cards past the fold,
    and the callout-to-CTA gap closes from mt-6 to mt-5. The callout and the DEMO stamp are untouched. */}
<h1 className="max-w-4xl text-balance text-5xl font-black leading-[.95] tracking-[-.04em] lg:text-6xl">Fuel Retail Network Health Explorer</h1><p className="mt-4 max-w-3xl border-l-4 border-primary bg-muted px-4 py-3 text-pretty text-base font-semibold leading-relaxed">Dubai demo built on public data only. The full engagement extends across all 166 stations in the UAE, calibrated with Emarat&apos;s own data.</p><button onClick={onOpen} className="mt-5 inline-flex items-center gap-3 bg-primary px-6 py-3.5 text-base font-bold text-primary-foreground hover:opacity-90">Open the tool <ArrowRight className="h-5 w-5"/></button></div>
{/* EQUAL HEIGHTS COME FROM THE GRID, not a min-height guess: `items-stretch` plus `h-full` on the
    article makes every card as tall as the tallest in the row, so the bottom edges align at any width
    and no hand-set height can be outgrown by a copy edit later. */}
<div className="mt-10 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">{features.map((f)=><article key={f.title} className="flex h-full flex-col border-t-[3px] border-t-primary bg-card p-7 shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)]">
{/* The step numeral is DELETED, not hidden: the three cards are a pipeline, but the icons and titles
    already carry that, and a numeral competing with each title bought nothing. Icon tile 56px with a
    28px glyph, one size and one colour across all three.
    TWO TIERS, ONE RHYTHM. Every card is title -> bold lead -> grey support, with the same sizes and the
    same mt-* steps, because the only way three cards read as one row is if the spacing is literally the
    same expression in all three. No card carries a third text block; card 3's action list lives inside
    its lead. */}
<div className="grid h-14 w-14 place-items-center bg-primary/10 text-primary"><f.icon className="h-7 w-7"/></div><h2 className="mt-5 text-[22px] font-bold leading-tight">{f.title}</h2><p className="mt-3 text-base font-semibold leading-relaxed text-foreground">{f.lead}</p><p className="mt-2 text-base leading-relaxed text-muted-foreground">{f.text}</p></article>)}</div></section></main>}
// `group` keeps the two UNIVERSES apart. Stations and areas are different populations with
// different denominators, so they are never rendered as one list that looks summable.
// "flag" is a property a station can carry on top of its bucket, never a bucket itself.
export type InsightGroup="station"|"flag"|"area"
// `accent` lets a card carry the exact colour its hexes are painted with, so a card and the map can
// never imply different groupings of the same areas.
// `chips` are SUBSETS of this card's own areas, rendered inside it and selectable in their own right.
// Typed as full Insights rather than a lighter shape so a chip goes through the same selection and
// filtering path as a card — a parallel path is how a chip ends up filtering to something its parent
// does not contain. A chip never carries chips of its own; nothing renders a second level.
// `nfrFormat` recolours the non-fuel map to ONE measured format while this insight is selected. It is
// read as `insight.nfrFormat ?? null`, so any card or chip without one restores the gap-count ramp
// simply by being selected — a format colouring cannot outlive the tally that asked for it.
// `swatch` lets a chip wear the exact fill its hexes will take, so chip and map cannot imply different
// colours for one selection.
//
// THE LABEL AND THE NOTE BELONG TO THE BREAKDOWN, not to the card. A note like "counts overlap" is a
// statement about one row's arithmetic, so pinning it to the card would let it sit under a row it does
// not describe the moment a card carries two. Every card happens to carry exactly one row today — the
// action map's location-type row was removed — but the ownership is what keeps that honest, and the row
// is where the label and note are actually read.
export type ChipRow={id:string;label:string;note?:string;chips:Insight[]}
export type Insight={id:string;count:number;unit:string;subject:string;finding:string;action?:string;tone:"review"|"gap"|"keep"|"neutral";group?:InsightGroup;title?:string;accent?:string;chipRows?:ChipRow[];swatch?:string;nfrFormat?:NfrFormatView;filter:{stations:string[];zones:number[]}}

function basisNote(tab:Exclude<Tab,"sources">,lowerForNote:number,upperForNote:number){
 const emaratTotal=EMARAT_COUNT
 const measuredStations=emaratPairs().filter((p)=>p.zone.live&&p.zone.fuelLQ!==null).length
 const withheld=emaratTotal-measuredStations
 const liveZones=zones.filter((z)=>z.live).length
 const ratedZones=zones.filter((z)=>z.live&&z.fuelLQ!==null).length
 // The arithmetic is printed FROM the same partition the cards render, so the sentence cannot
 // drift from the counts above it.
 // The non-fuel tab prints NO basis note. Each card names its own base in `unit` and the legend
 // footnote states the measured-format limit, so the paragraph restated both. The partition is
 // still checked, silently, so a drift in the arithmetic still surfaces in the console.
 if(tab==="nfr"){
  const {counts,opportunities,live}=nfrOpportunityCounts(lowerForNote)
  const summed=NFR_BUCKET_ORDER.reduce((sum,bucket)=>sum+counts[bucket],0)
  if(summed!==live)console.warn(`[v0] non-fuel buckets sum to ${summed} but ${live} areas are in play`)
  if(opportunities>live)console.warn(`[v0] non-fuel opportunity tiers (${opportunities}) exceed the ${live} live areas`)
  return ""
 }
 // The action tab prints NO basis note either, matching the other two tabs: the reconciliation
 // sentence spelled out an arithmetic identity the five card counts already demonstrate, and doing so
 // in prose meant a second place for the same figures to be stated. The PARTITION CHECK STAYS, and
 // stays silent — it guards a real defect (an area double-counted or missed across the five groups),
 // which is a different thing from the sentence that used to report it.
 // Chips are deliberately outside this sum: they are subsets of a card already counted.
 if(tab==="combined"){
  const summed=combinedInsights(lowerForNote,upperForNote).reduce((s,i)=>s+i.count,0)
  if(summed!==ratedZones)console.warn(`[v0] action groups sum to ${summed} but ${ratedZones} areas carry a reading — an area is double-counted or missing`)
  return ""
 }
 // The fuel tab prints NO basis note. It used to reconcile the station and area bases in prose;
 // each card now states its own base in `unit`, so the paragraph restated what the cards already
 // said. The arithmetic is still checked — silently, in the console partition check in InsightList.
 if(withheld>0&&measuredStations+withheld!==emaratTotal)console.warn(`[v0] Emarat station split does not close: ${measuredStations} read + ${withheld} unread ≠ ${emaratTotal}`)
 void ratedZones
 return ""
}

function emaratPairs(){const out:{station:Station;zone:Zone}[]=[];for(const station of stations){if(station.operator!=="Emarat")continue;const zone=stationZone(station);if(zone)out.push({station,zone})}return out}

function fuelInsights(lower:number,upper:number):Insight[]{
 // ONE PARTITION OF EVERY EMARAT STATION INSIDE THE STUDY AREA. Stations with no study-area hex
 // (for example Hatta) are outside this analysis rather than entering its unassessed bucket. Each
 // included station is assigned exactly once, by its own zone, in a fixed priority order, so the
 // buckets cannot double-count or miss any study-area station.
 const lqOf=(z:{fuelLQ:number|null})=>winsorizeLQ(z.fuelLQ as number)
 const allEmarat=EMARAT_STATIONS.filter((s)=>stationZone(s)!==null)
 const over:{station:Station;zone:Zone}[]=[]
 const thin:{station:Station;zone:Zone}[]=[]
 const wellPlaced:{station:Station;zone:Zone}[]=[]
 const notAssessed:{station:Station;zone:Zone|null}[]=[]
 for(const station of allEmarat){
  const zone=stationZone(station)
  // A station with no zone, a zone with no material demand, or a zone gated for thin traffic
  // all mean the same thing here: there is no reading to judge it on. Never a zero, never a
  // silent drop.
  if(!zone||!zone.live||zone.fuelLQ===null){notAssessed.push({station,zone});continue}
  const lq=lqOf(zone)
  if(lq>upper)over.push({station,zone})
  else if(lq<lower)thin.push({station,zone})
  else wellPlaced.push({station,zone})
 }
 // The base is the ASSESSED study-area stations, not every study-area station. The "not assessed"
 // card was removed, so using allEmarat.length would leave the three remaining counts short of their
 // stated base with nothing on screen to explain the difference. The denominator names the subset it
 // counts, so the absence is disclosed where the figure is read.
 const whiteSpace=zones.filter((z)=>z.live&&z.fuelLQ!==null&&lqOf(z)<lower&&z.hasEmarat===0)
 // Overlap is a SEPARATE question from provision-vs-demand: it comes from the Huff split, not
 // the location quotient. A station can be well placed AND still overlap the network, so this
 // is a flag on top of the partition and is deliberately excluded from the sum.
 const assessed=[...over,...thin,...wellPlaced]
 const flaggedStations=allEmarat.filter((station)=>flaggedCannibalisationStationIds.has(station.id))
 // NO DENOMINATOR ON ANY CARD. `unit` is left empty rather than removed, because it is required
 // across all three tabs and the renderer already skips an empty one — so the tail disappears without
 // a second card shape to keep in step. The two bases that used to print here (assessed stations,
 // readable areas) were different populations one line apart, which invited a share reading across
 // them; each card now states only what it counted.
 const list:Insight[]=[
  // Headlines speak the LEGEND's words — over-served, well-served, under-served, cannibalization,
  // white-space — so a card and the map it filters name the same verdict. Those five stay hyphenated
  // as fixed terms; nothing else in this copy carries a hyphen or a dash.
  // The verbs are DELIBERATELY UNCERTAIN ("may", "worth a look"): every figure here is modelled from
  // public data on a demo dataset, so an asserted verdict would claim more than the evidence carries.
  {id:"fuel-over",count:over.length,unit:"",group:"station",subject:over.length===1?"Emarat station in an over-served area":"Emarat stations in over-served areas",finding:"Reachable provision here looks higher than the area's share of traffic. That may reflect genuine over-capacity, or a demand driver the traffic view misses such as through-traffic or seasonal peaks, worth a look.",tone:"review",filter:{stations:over.map((p)=>p.station.id),zones:[...new Set(over.map((p)=>p.zone.id))]}},
  {id:"fuel-thin",count:thin.length,unit:"",group:"station",subject:thin.length===1?"Emarat station in an under-served area":"Emarat stations in under-served areas",finding:"Emarat is present, but reachable provision across the area still sits below its share of traffic. A relative gap, not a measured volume shortfall.",tone:"gap",filter:{stations:thin.map((p)=>p.station.id),zones:[...new Set(thin.map((p)=>p.zone.id))]}},
  {id:"fuel-keep",count:wellPlaced.length,unit:"",group:"station",subject:wellPlaced.length===1?"Emarat station in a well-served area":"Emarat stations in well-served areas",finding:"Reachable provision around these sites sits in line with the area's share of traffic, neither crowded nor short.",tone:"keep",filter:{stations:wellPlaced.map((p)=>p.station.id),zones:[...new Set(wellPlaced.map((p)=>p.zone.id))]}},
  // "potential cannibalization" IN THE HEADLINE, matching the legend, so the reader meets the term
  // where the count is rather than having to infer it from the sentence below.
  {id:"fuel-overlap",count:flaggedStations.length,unit:"",group:"flag",subject:flaggedStations.length===1?"Emarat station with potential cannibalization":"Emarat stations with potential cannibalization",finding:"These may draw most of their nearby demand from other Emarat sites rather than competitors.",tone:"review",filter:{stations:flaggedStations.map((station)=>station.id),zones:[...new Set(flaggedStations.map((station)=>stationZone(station)?.id).filter((id):id is number=>id!==undefined))]}},
  {id:"fuel-white",count:whiteSpace.length,unit:"",group:"area",subject:whiteSpace.length===1?"white-space identified":"white-spaces identified",finding:"Reachable fuel provision here sits below the area's share of traffic, and none of it is Emarat.",tone:"gap",filter:{stations:[],zones:whiteSpace.map((z)=>z.id)}},
 ]
 return list
}

// Opportunity tiers. Each card is one bucket of the SAME partition the map paints, and every
// card's zone list comes from nfrOpportunityZones, so tapping a card can only ever select the
// hexes already carrying that colour.
// No `action` field on any bucket. Each card keeps its explanatory sentence and ends there, matching
// the Fuel gaps tab — the reader draws the conclusion from the evidence rather than being handed one.
const nfrBucketCopy:Record<NfrOppBucket,{subjectOne:string;subjectMany:string;tone:Insight["tone"]}>={
 // THE SUBJECT NAMES THE UNIT OF COUNT — "area" — because the denominator line is gone: "4 premium
 // opportunities" beside a map of hexes left the reader to guess whether an opportunity was a site,
 // a format or an area. It does NOT name the domain: "NFR" is internal shorthand, and the tab title
 // already establishes the non-fuel context, so repeating it in every headline spends the reader on
 // something the surrounding chrome has already said. No client-facing string on this tab uses it.
 // ONE OPPORTUNITY CARD, not four graded ones. The four cards it replaces split the same shortfall
 // by buying power, so the tab's headline count was never on screen: a reader had to add four numbers
 // to learn how many areas are short. The breakdown is not lost — it moves to the chips under this
 // card, in the same location vocabulary the action map now uses.
 opportunity:{subjectOne:"area with a retail opportunity",subjectMany:"areas with a retail opportunity",tone:"gap"},
 // "may already be served" rather than "already served": this bucket rests on the same modelled
 // public data as every other, so it states a reading, not a settled fact about the area.
 served:{subjectOne:"area that may already be served",subjectMany:"areas that may already be served",tone:"neutral"},
 "no-material-demand":{subjectOne:"area with no material demand",subjectMany:"areas with no material demand",tone:"neutral"},
 "not-observed":{subjectOne:"area the survey did not reach",subjectMany:"areas the survey did not reach",tone:"neutral"},
}
// The unsurveyed and no-material-demand buckets lose their CARDS only. Both stay in
// NFR_BUCKET_ORDER, so the map still paints them, the legend still names them and the model still
// partitions on them — dropping either from the shared order would have changed what the tab
// measures, not just what the panel says. This is why the silent partition check in basisNote still
// sums over NFR_BUCKET_ORDER and not over the cards: the panel is now a subset of the partition by
// intent, so a check written against the visible cards would never close again.
const NFR_CARD_BUCKETS=NFR_BUCKET_ORDER.filter((bucket)=>bucket!=="not-observed"&&bucket!=="no-material-demand")
// `archetypeChips` IS DELETED, not left unused. It was the last location-type breakdown on any card,
// and a builder with no caller is worse than no builder: the next reader takes it for a live surface and
// maintains it. The eight labels it worded still exist in ARCHETYPE_LABEL, which the hex detail on both
// tabs reads, so the shared vocabulary that stopped the action map saying "premium" where the non-fuel
// panel said "Industrial" is unaffected.
//
// THE NON-FUEL BREAKDOWN: which measured format is short. This asks the question the tab is named after,
// where the location-type row asked a question the tab does not measure.
//
// THESE TALLIES OVERLAP AND ARE NOT A PARTITION. An area short on F&B and C-store is counted in both, so
// a reconciliation that fails when the chips do not SUM to the card — which is what the deleted
// location-type builder used, correctly, on a genuine partition — would be wrong here twice over: it
// would fire on correct data, and relaxing it to stop firing would protect nothing. So this builder
// asserts the right invariant instead: the UNION must equal the card, which is what makes the headline
// reproducible from the breakdown. The overlap is also stated to the reader in the row's own `note`,
// not just guarded in code.
//
// Chips are filtered from the card's OWN `areas`, so a tally is structurally a subset of its parent.
function formatTallyChips({idPrefix,areas,lower}:{idPrefix:string;areas:Zone[];lower:number}):Insight[]{
 // The reset comes FIRST and carries no format, so selecting it restores the gap-count ramp through
 // the same `nfrFormat ?? null` path every other card uses. It deliberately has NO swatch: the absence
 // of a colour dot is what separates "all areas, coloured by count" from the four coloured tallies,
 // and no single swatch could stand for a three-shade ramp. It is named "All areas" rather than "All
 // formats" because "All three formats" sits two chips along and means something quite different.
 const all:Insight={
  id:`${idPrefix}-all`,count:areas.length,unit:"",subject:"All areas · by gap count",
  finding:"Every area with a measured shortfall, coloured by how many of the three formats are short.",
  tone:"gap",filter:{stations:[],zones:areas.map((z)=>z.id)},
 }
 const tallies=([...MEASURED_NFR_FORMATS,"all-three"] as NfrFormatView[]).map((view)=>{
  const inView=areas.filter((z)=>isShortOn(z,view,lower))
  const isAllThree=view==="all-three"
  return {
   id:`${idPrefix}-format-${view}`,count:inView.length,unit:"",
   subject:isAllThree?"All three formats":`${MEASURED_NFR_SHORT_LABEL[view as MeasuredNfrFormat]} short`,
   finding:isAllThree
    ?"Short on F&B, C-Store and car wash. These are the darkest hexes on the gap-count view, so this tally re-lights that same set rather than introducing a new one."
    :`Areas where ${MEASURED_NFR_SHORT_LABEL[view as MeasuredNfrFormat]} provision sits below this area's share of demand. Counted here whatever else the area is short on.`,
   tone:"gap" as const,
   nfrFormat:view,
   swatch:nfrFormatViewFill(view),
   filter:{stations:[],zones:inView.map((z)=>z.id)},
  } satisfies Insight
 })
 if(process.env.NODE_ENV!=="production"){
  const union=new Set<number>()
  for(const tally of tallies)if(tally.nfrFormat!=="all-three")for(const id of tally.filter.zones)union.add(id)
  if(union.size!==areas.length)console.warn(`[v0] Format tallies do not cover ${idPrefix}: ${union.size} distinct areas across the three format tallies vs ${areas.length} on the card.`)
 }
 // No zero-count filter. Unlike a location type — of which there are eight and most cards touch a few
 // — there are exactly three measured formats, and "0 Car wash short" is a FINDING on this tab: it says
 // the survey looked and found car wash provision adequate everywhere. Hiding it would leave the reader
 // to infer from silence whether it was measured at all. The button renders disabled, as it already
 // does for an empty chip.
 return [all,...tallies]
}
// THE ACTION MAP'S RETAIL READ: which measured format is short in the areas behind an integrate or grow
// recommendation. Same three formats, same labels and same hues as the non-fuel tab, because a reader
// carrying a fact between tabs must not have to translate it. This is the second half of naming the
// recommendation: the location-type row says what kind of area it is, this says what retail is missing.
//
// THE THRESHOLD IS NOT THIS TAB'S SLIDER. `category()` walls retail shortness on its `nfrLower`
// argument, which `combinedInsights` does not pass, so the action predicate uses NFR_DEFAULT_LOWER while
// the combined tab's own `lower` is the FUEL threshold. Feeding `lower` in here would tally against a
// wall the recommendation never used and could report zero areas short on anything beneath a card
// stating that fourteen areas are retail-short. So the default is passed explicitly, named, and the
// union check below is what would catch it if the two ever drift apart again.
const ACTION_RETAIL_LOWER=NFR_DEFAULT_LOWER
// DESCRIPTIVE ONLY. Nothing here is consulted when a hex is assigned an action: `category()` already
// decided that, above, off fuel state and `measuredGapCount>0`. This re-reads the same measurement to
// say which formats made up that count.
function retailGapChips({idPrefix,areas,tone,stationsOf}:{idPrefix:string;areas:Zone[];tone:Insight["tone"];stationsOf:(list:Zone[])=>string[]}):Insight[]{
 const chips=MEASURED_NFR_FORMATS.map((format)=>{
  const inFormat=areas.filter((z)=>isShortOn(z,format,ACTION_RETAIL_LOWER))
  return {
   id:`${idPrefix}-retail-${format}`,count:inFormat.length,unit:"",
   subject:`${MEASURED_NFR_SHORT_LABEL[format]} short`,
   finding:`Areas in this recommendation where ${MEASURED_NFR_SHORT_LABEL[format]} provision sits below the area's share of demand. Counted here whatever else the area is short on.`,
   tone,
   // The hue is the FORMAT'S IDENTITY, shared with the non-fuel tab, not a prediction about this map:
   // the action map stays coloured by action group, as it must, since that is the judgement it exists to
   // show. So these chips deliberately carry no `nfrFormat` and recolour nothing. What the dot buys is
   // that F&B looks the same wherever F&B is named in the tool.
   swatch:MEASURED_NFR_FORMAT_FILL[format],
   filter:{stations:stationsOf(inFormat),zones:inFormat.map((z)=>z.id)},
  } satisfies Insight
 })
 if(process.env.NODE_ENV!=="production"){
  // THE UNION MUST EQUAL THE CARD, and here that is a claim about two separate pieces of code agreeing:
  // every area on an integrate or grow card is there BECAUSE `measuredGapCount>0`, so each one has to
  // appear under at least one format. A shortfall would mean the recommendation and this breakdown are
  // reading different walls, which is the defect that would let a card recommend retail while its own
  // format row shows nothing short.
  const union=new Set<number>()
  for(const chip of chips)for(const id of chip.filter.zones)union.add(id)
  if(union.size!==areas.length)console.warn(`[v0] Retail-gap chips do not cover ${idPrefix}: ${union.size} distinct areas across the three formats vs ${areas.length} on the card. The action predicate and the format tallies are reading different thresholds.`)
  // Suggested formats have no measurement behind them, so they may never appear in a tally. Structural
  // already (the map is over MEASURED_NFR_FORMATS), asserted because the wall matters more than the loop.
  if(MEASURED_NFR_FORMATS.some((format)=>(SUGGESTED_NFR_FORMATS as readonly string[]).includes(format)))console.warn("[v0] A suggested format has reached the measured retail-gap tallies.")
 }
 // Zeroes are KEPT here, unlike the location-type row above. There are exactly three measured formats,
 // so "0 Car wash short" is a finding: it says the survey looked across these areas and found car wash
 // provision adequate in all of them. An absent chip would leave that to be inferred from silence.
 // Eight location types behave differently, which is why that row still hides its empties.
 return chips
}
function nfrOpportunityInsights(lower:number):Insight[]{
 // `opportunities` and `live` are no longer read here. The hex IS the method on this tab, so each
 // card is a plain count of areas and states no base — the denominators invited a share calculation
 // against two different bases sitting one line apart.
 const {counts,gaps}=nfrOpportunityCounts(lower)
 return NFR_CARD_BUCKETS.map((bucket)=>{
  const copy=nfrBucketCopy[bucket]
  const count=counts[bucket]
  const isOpportunity=bucket==="opportunity"
  // SOFTENED, BUT THE UNIT STAYS TRUE. `gaps` sums measuredGapCount per area, so it counts SHORT
  // FORMATS, not short areas — a figure that EXCEEDS the card's own area count wherever any area is
  // short in more than one format. Wording it as "a shortfall in N of these areas" would therefore be
  // false, and now that all opportunities sit on ONE card the overshoot is guaranteed rather than
  // tier-dependent. So the verb stays cautious and the noun keeps saying what was actually counted.
  const gapNote=isOpportunity?` Public data may suggest a shortfall in ${gaps[bucket]} ${gaps[bucket]===1?"format":"formats"} across them.`:""
  const areas=nfrOpportunityZones(bucket,lower)
  return {
   id:`nfr-opp-${bucket}`,
   count,
   // Empty, not absent: `unit` is required across all three tabs, and the renderer already guards on
   // it, so the line simply does not render here.
   unit:"",
   subject:count===1?copy.subjectOne:copy.subjectMany,
   finding:`${NFR_BUCKET_NOTE[bucket]}${gapNote}`,
   tone:copy.tone,
   // No `not-observed` or `no-material-demand` branch — neither renders a card any more, so an
   // accent for either would be unreachable code.
   // The darkest shade of the one opportunity ramp, so the card wears a colour its hexes actually
   // carry. Reading the ramp's last entry rather than an index keeps this true if a fourth measured
   // format ever lengthens it.
   accent:bucket==="served"?oppServedFill:OPP_DEPTH_RAMP[OPP_DEPTH_RAMP.length-1],
   filter:{stations:[],zones:areas.map((z)=>z.id)},
   // BY MEASURED FORMAT, NOT BY LOCATION TYPE. The breakdown under a card should answer the question
   // its own tab measures, and this tab measures which formats are short; land use is named per area on
   // the sticker and in the panel instead. Only the opportunity card takes chips: "served" is an
   // ABSENCE of a shortfall, so breaking it down by format would invite the reader to hunt for a gap
   // inside the one card that says there is none.
   chipRows:isOpportunity?[{
    id:`nfr-opp-${bucket}-formats`,label:"Short on",
    chips:formatTallyChips({idPrefix:`nfr-opp-${bucket}`,areas,lower}),
   // SAYS THE COUNTS OVERLAP AND NAMES WHAT THEIR SUM IS. The three format tallies add to
   // `gaps[bucket]` — the short-FORMAT figure this same card already prints in `gapNote` — because both
   // count the same area-by-format shortfalls, once per area and once per format. Stopping at "these do
   // not sum to 48" would leave a reader who added them to 102 looking at 102 in the sentence just
   // above with no way to tell whether that agreement meant anything. It does, and lib asserts it as
   // `formatTalliesSumToShortFormatCount`.
    note:`Counts overlap: an area short on two formats is counted under both, so these do not sum to ${areas.length} areas. They sum to the ${gaps[bucket]} short formats above. “All three formats” is a subset of the other three.`,
   }]:undefined,
  }
 })
}

// ONE CARD PER DISPLAY GROUP, all the same shape: a count headline, one explanation, and — on the two
// retail-led groups only — a row of tier chips. The old shape put a header card above four tier cards
// per retail action, which made the two most important recommendations ten cards long and gave a
// buying-power grade the same visual weight as the recommendation it graded.
//
// NO RECOMMENDATION SENTENCE. The headline already names the action ("15 areas to integrate a new
// site"), so a takeaway line under it could only restate it — in a second copy of the wording, free
// to drift from ACTION_META the way this tab's legend table already had. What sits here is one
// EXPLANATION per group, and only that.
// It is one sentence, not the old fuel-then-retail pair: the two reads are what the click panel is
// for, and printing both in every card restated the panel five times.
// `overserved` names its own split, because it is the one group covering two verdicts — an Emarat site
// to consolidate, and an area with no site of ours to act on — and a merged card that hid that would
// report an untouchable market as a project.
const groupCopy:Record<ActionGroupKey,{explain:string;tone:Insight["tone"]}>={
 integrate:{explain:"No Emarat site here, fuel looks under-served and nearby retail sits below the area's share of demand, so a new site here may be considered as fuel plus retail.",tone:"gap"},
 grow:{explain:"An Emarat site already stands on real fuel demand and nearby retail looks thin, so adding retail to the forecourt is worth considering.",tone:"gap"},
 fuel:{explain:"Fuel provision looks below the area's share of traffic while nearby retail already looks adequate, so this may be a fuel decision rather than a retail one.",tone:"gap"},
 overserved:{explain:"Fuel provision may already exceed the area's share of traffic, or a new site would draw mostly from other Emarat stations. Click a hex to see which: consolidate or relocate where Emarat holds a site, nothing to act on where it holds none.",tone:"review"},
 retain:{explain:"Fuel and retail both look about level with the area's fair share, so nothing is suggested here.",tone:"neutral"},
}
// TIER_CHIP is gone with the tier it worded. Chips now carry ARCHETYPE_LABEL, and the full sentence
// for each still travels as the chip's `finding` for hover and screen readers.

function combinedInsights(lower:number,upper:number):Insight[]{
 const verdicts=zones.map((z)=>({z,v:category(z,z.canRate,upper,lower)}))
 // Matched by DISPLAY GROUP, so the card's count is the population its legend swatch paints — one
 // card, one colour, one number. ACTION_GROUP is the only place the consolidate/watch merge lives.
 const matchedFor=(group:ActionGroupKey)=>verdicts.filter((r)=>r.v&&ACTION_GROUP[r.v.key]===group).map((r)=>r.z)
 return ACTION_GROUP_KEYS.map((group)=>{
  const copy=groupCopy[group]
  const matched=matchedFor(group)
  const meta=ACTION_GROUP_META[group]
  // Stations are highlighted only where the group is ABOUT an existing site. `integrate` has no
  // Emarat site by definition, and a `retain` highlight would light up most of the estate.
  const carriesStations=group==="grow"||group==="overserved"
  const stationsOf=(list:typeof matched)=>carriesStations?list.flatMap((z)=>z.emaratStationIds):[]
  return {
   id:`combined-${group}`,count:matched.length,
   // NO DENOMINATOR. The card counts areas in one group and says so; the old "of 31 areas with
   // something to do" invited the five counts to be read as shares of a base only four of them sat in.
   unit:"",
   subject:matched.length===1?meta.subject.one:meta.subject.many,
   finding:copy.explain,tone:copy.tone,accent:ACTION_GROUP_FILL[group],
   filter:{stations:stationsOf(matched),zones:matched.map((z)=>z.id)},
   // BY LOCATION TYPE, NOT BY BUYING-POWER TIER. These chips used to read "premium / mid /
   // functional" off `verdict.tier` while the non-fuel sticker described the same hex as
   // "Industrial" or "Affluent neighbourhood" — two vocabularies for one property, so a reader
   // could not carry a fact from one tab to the other. Both now read ARCHETYPE_LABEL.
   //
   // This is a DESCRIPTIVE breakdown only. Nothing here touches which hex got which action: the
   // groups are still matched by `ACTION_GROUP[verdict.key]` above, so relabelling the chips cannot
   // move a hex between cards or re-sort anything.
   // ONE BREAKDOWN: WHAT RETAIL IS SHORT. The location-type row that used to sit above this is gone.
   // It answered a different question from the one the card asks — what KIND of area this is, rather
   // than what is missing from it — and as an eight-way aggregate it was the weaker form of that
   // answer: knowing four of fourteen areas are industrial does not tell you which area to visit,
   // whereas the tier of the hex you are actually looking at does. That per-area tier is already on the
   // hex detail (see `CombinedPanel`), gated on `c.tier`, which `category()` sets on exactly the
   // integrate and grow rules — the same two cards this row was on. So nothing became unreachable.
   //
   // Still gated on `meta.tiered`, true of exactly integrate and grow: add-fuel, consolidate and retain
   // rest on no retail tiering, so a retail breakdown under them would break down something their
   // recommendation does not use.
   chipRows:meta.tiered?[
    {
     id:`combined-${group}-retail`,label:"Short on",
     chips:retailGapChips({idPrefix:`combined-${group}`,areas:matched,tone:copy.tone,stationsOf}),
     // Names the sum rather than only denying the wrong one. "These do not sum to 14" leaves a reader
     // who added them to 25 with an unexplained number; saying what 25 IS makes the row reconcile
     // instead of merely disclaiming. Both figures are derived, so neither can go stale.
     note:`Counts overlap: an area short on two formats is counted under both, so these sum to the ${matched.reduce((total,z)=>total+measuredGapCount(z,ACTION_RETAIL_LOWER),0)} short formats across these ${matched.length} areas, not to ${matched.length}.`,
    },
   ]:undefined,
  } satisfies Insight
 })
}

const toneStyles:Record<Insight["tone"],string>={review:"border-l-[#b5382d]",gap:"border-l-primary",keep:"border-l-[#16834a]",neutral:"border-l-[#b7bcc2]"}

function InsightCard({insight,activeId,onSelect}:{insight:Insight;activeId:string|null;onSelect:(insight:Insight)=>void}){
 const disabled=insight.count===0
 const active=activeId===insight.id
 const body=<>
  {insight.title&&<p className="mb-2 text-sm font-bold uppercase tracking-[.12em]">{insight.title}</p>}
  <p className="text-lg font-bold leading-snug"><span className="text-3xl font-black tabular-nums">{insight.count}</span> {insight.subject}</p>
  {insight.unit&&<p className="mt-1.5 text-[15px] text-muted-foreground">{insight.unit}</p>}
  <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{insight.finding}</p>
  {/* The zero state still speaks, because a card reading 0 with no line under it looks unfinished
      rather than empty. A card with no takeaway simply ends after its explanation. */}
  {(disabled||insight.action)&&<p className="mt-2.5 text-[15px] font-semibold">{disabled?"Nothing to act on in this view.":insight.action}</p>}
 </>
 // An explicit accent wins over the tone class, so a card wears the exact fill its hexes do.
 const shell=`border border-l-4 bg-card ${toneStyles[insight.tone]} ${active?"ring-2 ring-primary":""}`
 const accent=insight.accent?{borderLeftColor:insight.accent}:undefined
 // A row whose chips all resolved away contributes nothing, so a card left with no populated row falls
 // back to the plain button rather than growing an empty bordered strip.
 const rows=insight.chipRows?.filter((row)=>row.chips.length)??[]
 if(!rows.length)return <button type="button" disabled={disabled} onClick={()=>onSelect(insight)} aria-pressed={active} style={accent} className={`w-full p-4 text-left transition-colors ${shell} ${disabled?"cursor-default opacity-55":"hover:bg-muted"}`}>{body}</button>
 // A CARD WITH CHIPS CANNOT BE A BUTTON — a button inside a button is invalid, and the chips have to
 // be separately clickable. So the shell becomes a div, the headline keeps its own button, and hover
 // is scoped to that button so pointing at a chip does not light up the whole card.
 return <div style={accent} className={shell}>
  <button type="button" disabled={disabled} onClick={()=>onSelect(insight)} aria-pressed={active} className={`block w-full p-4 text-left transition-colors ${disabled?"cursor-default opacity-55":"hover:bg-muted"}`}>{body}</button>
  {/* The chips sit INSIDE the card, under a hairline, so the tier reads as a property of this
      recommendation rather than as four more findings. Each names the tier it filters to; the full
      sentence for that tier rides along as its title and for screen readers, so nothing that used to
      be on the tier cards is lost — it is just no longer five cards deep. */}
  {/* ONE HAIRLINE PER ROW, so two breakdowns read as two answers rather than one long strip of chips
      whose labels a reader has to parse to find the boundary. */}
  {rows.map((row)=><div key={row.id} className="border-t px-4 py-3">
   <div className="flex flex-wrap items-center gap-1.5">
    <span className="mr-1 text-[13px] font-semibold text-muted-foreground">{row.label}</span>
    {row.chips.map((chip)=>{
     const chipActive=activeId===chip.id
     const chipEmpty=chip.count===0
     return <button key={chip.id} type="button" disabled={chipEmpty} onClick={()=>onSelect(chip)} aria-pressed={chipActive} title={chip.finding} className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-sm font-semibold transition-colors ${chipEmpty?"cursor-default border-dashed text-muted-foreground opacity-60":chipActive?"border-foreground bg-foreground text-background":"hover:bg-muted"}`}>
      {/* The chip wears the exact fill its hexes take, so the reader is never asked to remember which
          colour a named format maps to. Hidden while the chip is empty: a swatch beside a 0 would
          advertise a colour that appears nowhere on the map. */}
      {chip.swatch&&!chipEmpty&&<i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:chip.swatch}} aria-hidden/>}
      <span><span className="tabular-nums">{chip.count}</span> {chip.subject}</span>
      <span className="sr-only"> — {chip.finding}</span>
     </button>
    })}
   </div>
   {/* Sits UNDER THE ROW IT QUALIFIES, not on the card and not in a tooltip. On a card carrying both a
       partition and a set of overlapping counts, an honesty note attached to the card would describe
       one row's arithmetic while sitting beneath the other's; and needing it means it cannot depend on
       hovering the right chip. */}
   {row.note&&<p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{row.note}</p>}
  </div>)}
 </div>
}

function InsightList({tab,lower,upper,active,onSelect,onClear}:{tab:Exclude<Tab,"sources">;lower:number;upper:number;active:Insight|null;onSelect:(i:Insight)=>void;onClear:()=>void}){
 const insights=useMemo(()=>tab==="fuel"?fuelInsights(lower,upper):tab==="nfr"?nfrOpportunityInsights(lower):combinedInsights(lower,upper),[tab,lower,upper])
 return <section className="grid gap-3">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2 className="text-xl font-black">Preliminary insights</h2>
   {active&&<button type="button" onClick={onClear} className="border border-primary px-3 py-1.5 text-[15px] font-semibold text-primary hover:bg-primary/10">Clear</button>}
  </div>
  {/* Non-fuel findings select AREAS only — none of its cards carry a station list — so the prompt
      names just areas there. Promising "and stations" on a tab where a click never highlights one
      would describe an effect the control does not have. */}
  <p className="text-[15px] leading-relaxed text-muted-foreground">{active?`Showing only the areas${tab==="nfr"?"":" and stations"} behind this finding. Tap one on the map for its detail.`:`Select any finding to highlight the areas${tab==="nfr"?"":" and stations"} it covers. Insights are preliminary and may evolve as the full dataset is applied during engagement.`}</p>
  {(["station","flag","area"] as const).map((group)=>{
   const inGroup=insights.filter((i)=>(i.group??"area")===group)
   if(!inGroup.length)return null
   const showHeading=insights.some((i)=>(i.group??"area")==="station")
   // The arithmetic is summed FROM THE RENDERED CARDS, so the printed total cannot drift from
   // the counts above it. Only the partition group is summable; the flag deliberately is not.
   // SILENT. The partition check still runs — it is what guarantees no station is double-counted
   // or dropped — but it is an engineering assertion, not a finding, so it warns to the console
   // instead of spending a line of the reader's attention on arithmetic they did not ask to audit.
   // Checks the property that actually matters — no station counted twice and none silently
   // dropped — by comparing the summed counts to the SIZE OF THEIR UNION. Asserting against
   // EMARAT_COUNT instead would have failed the moment the unread bucket stopped being a card,
   // reporting a deliberate change in scope as an arithmetic fault.
   const sum=inGroup.reduce((a,i)=>a+i.count,0)
   if(group==="station"){
    const union=new Set(inGroup.flatMap((i)=>i.filter.stations))
    if(union.size!==sum)console.warn(`[v0] station cards sum to ${sum} but cover ${union.size} distinct stations — a station is double-counted or missing`)
   }
   return <div key={group} className="grid gap-3">
    {showHeading&&<div className="mt-1">
     {/* "Flag on top of the buckets above" described our data model. What the reader needs to know
         is that these stations are ALSO counted in a group above, which is why the number must not
         be added to the others. */}
     <h3 className="text-sm font-bold uppercase tracking-[.12em] text-muted-foreground">{group==="station"?"Emarat stations":group==="flag"?"Also worth a look, already counted above":"Areas"}</h3>
    </div>}
    {inGroup.map((insight)=><InsightCard key={insight.id} insight={insight} activeId={active?.id??null} onSelect={onSelect}/>)}
   </div>
  })}
  {/* Both reconciliation sentences are gone. Each card's own `unit` names the base it counts
      against, so the bases are disclosed where the figures are read rather than in a paragraph
      explaining why they do not add up. The `&&` guard keeps an empty bordered box off the page
      when a tab's basis note is blank. */}
  {basisNote(tab,lower,upper)&&<p className="border-t pt-3 text-[15px] leading-relaxed text-muted-foreground">{basisNote(tab,lower,upper)}</p>}
 </section>
}

function OperatorControl({value,onChange,counts}:{value:OperatorFilter;onChange:(next:OperatorFilter)=>void;counts:Record<OperatorFilter,number>}){
 return <section className="border bg-card p-4" aria-label="Station operator filter">
  <h3 className="text-sm font-bold uppercase tracking-[.12em]">Stations covered in demo</h3>
  {/* The count beside each operator is the number of stations IN THIS DUBAI STUDY AREA, not a
      national estate. Saying so here stops the 66 below being read as Emarat's UAE network of
      166 named in the banner. */}
  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">Counts are stations inside the Dubai study area only.</p>
  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter stations by operator">
   {operatorOptions.map((option)=>{const active=value===option.id;return <button key={option.id} type="button" onClick={()=>onChange(option.id)} aria-pressed={active} title={option.tip} className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[15px] font-semibold transition-colors ${active?"border-foreground bg-foreground text-background":"border-border bg-background hover:bg-muted"}`}>{option.dot&&<i className="h-2.5 w-2.5 rounded-full" style={{background:option.dot}}/>}{option.label}<span className="font-mono text-[13px] opacity-70 tabular-nums">{counts[option.id]}</span></button>})}
  </div>
  {/* Names the CONSEQUENCE, not just the scope. "Areas are unaffected" left a reader who had just
      hidden every competitor unsure whether the gap colours had been recomputed around Emarat
      alone — they are not; supply is always measured against all operators. */}
  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">This filter shows stations of the selected operator.</p>
 </section>
}

// Renamed off "Analyst": the word is banned from this control's user-facing wording, and leaving it on
// the component invites the next edit to surface it in a heading or aria-label by reflex.
function ThresholdControls({lower,upper,onLower,onUpper,resetLower=DEFAULT_LOWER,resetUpper=DEFAULT_UPPER,showCannibalisation=false}:{lower:number;upper:number;onLower:(n:number)=>void;onUpper:(n:number)=>void;resetLower?:number;resetUpper?:number;showCannibalisation?:boolean}){
 return <details className="border bg-card"><summary className="cursor-pointer list-none p-4 text-base font-bold" title="Move the over- and under-served cut-offs. This re-labels areas; it does not change the underlying data.">Thresholds &amp; assumptions<span className="ml-1.5 cursor-help font-normal text-muted-foreground" aria-hidden>ⓘ</span><span className="sr-only"> — move the over- and under-served cut-offs. This re-labels areas; it does not change the underlying data.</span></summary><div className="border-t p-4"><Thresholds lower={lower} upper={upper} onLower={onLower} onUpper={onUpper} resetLower={resetLower} resetUpper={resetUpper}/>{showCannibalisation&&<div className="mt-5 border-t pt-4 text-sm leading-relaxed text-muted-foreground"><p className="font-bold text-foreground">Cannibalisation assumptions</p><p className="mt-2">Directional drive-time Gaussian: τ = <strong>{cannibalisationAssumptions.tauMinutes.toFixed(1)} minutes</strong>; outside option U₀ = <strong>{cannibalisationAssumptions.outsideOption.toFixed(2)}</strong>; station attractiveness A = <strong>{cannibalisationAssumptions.attractiveness.toFixed(1)}</strong>.</p><p className="mt-2">These are precomputed model assumptions, not fitted parameters. Changing τ requires rerunning the offline network model; the UI does not pretend to recalculate routed results in the browser.</p></div>}</div></details>
}

function Workspace({tab,lower,upper,onLower,onUpper,nfrLower,nfrUpper,onNfrLower,onNfrUpper,selectedZone,selectedStation,onZone,onStation,split,associatedZone,showZones,onToggleZones,networkView,onNetworkView,activeInsight,onInsight,operatorFilter,onOperatorFilter}:{tab:Exclude<Tab,"sources">;lower:number;upper:number;onLower:(n:number)=>void;onUpper:(n:number)=>void;nfrLower:number;nfrUpper:number;onNfrLower:(n:number)=>void;onNfrUpper:(n:number)=>void;selectedZone:Zone|null;selectedStation:Station|null;onZone:(z:Zone)=>void;onStation:(s:Station)=>void;split:ReturnType<typeof huffSplit>|null;associatedZone:Zone|null;showZones:boolean;onToggleZones:(next:boolean)=>void;networkView:boolean;onNetworkView:(next:boolean)=>void;activeInsight:Insight|null;onInsight:(insight:Insight|null)=>void;operatorFilter:OperatorFilter;onOperatorFilter:(next:OperatorFilter)=>void}){
 const hasDetail=Boolean(selectedZone||selectedStation)
 const activeLower=tab==="nfr"?nfrLower:lower
 const activeUpper=tab==="nfr"?nfrUpper:upper
 // Derived from the SELECTED insight rather than held as its own state, so the map's colouring and the
 // pressed chip cannot disagree, and clearing or selecting anything else restores the gap-count ramp
 // for free. A separate piece of state here is how a format colouring would survive a jump to another
 // card and leave the legend describing a colour the map had stopped using.
 const nfrFormat=tab==="nfr"?activeInsight?.nfrFormat??null:null
 // Every chip uses the SAME study-area predicate: a station counts only when stationZone resolves a
 // hex for it. `All` increments in the same loop as each operator, so it is the sum of the visible
 // operator populations rather than the full register with out-of-area stations mixed in.
 const operatorCounts=useMemo(()=>{const base={All:0,Emarat:0,"ENOC/EPPCO":0,ADNOC:0,Other:0} as Record<OperatorFilter,number>;for(const s of stations){
  if(!stationZone(s))continue
  const key=(operatorOptions.some((o)=>o.id===s.operator)?s.operator:"Other") as OperatorFilter
  base[key]+=1
  base.All+=1
 }
  return base},[])
 return <div className="mx-auto grid max-w-[1600px] gap-0 lg:h-[calc(100dvh-121px)] lg:grid-cols-[minmax(0,1fr)_460px]">
  <section className="relative h-[58vh] min-h-[480px] border-b lg:h-full lg:border-b-0 lg:border-r">
   <Map zones={zones} stations={stations} view={tab} lower={activeLower} upper={activeUpper} onZone={onZone} onStation={onStation} mapFilter={activeInsight?.filter??null} showZones={showZones} onToggleZones={onToggleZones} networkView={tab==="fuel"&&networkView} onNetworkView={tab==="fuel"?onNetworkView:undefined} showOverlapPartners={activeInsight?.id==="fuel-overlap"} selectedOverlapStationId={activeInsight?.id==="fuel-overlap"?selectedStation?.id:null} operatorFilter={operatorFilter} nfrFormat={nfrFormat}/>
   {/* Capped at 30rem. Left uncapped, the legend grew to 97% of the map width and 22% of its
       height, covering the hexes it exists to explain — an overlay that hides the picture is worse
       than no overlay. The cap forces the rows to wrap into a compact block. */}
   {/* EVERY LEGEND IS NOW THE SAME CONTROL: collapsed by default, top-left, opens on click. The fuel
       tab used to be the exception, pinned open bottom-left on the reasoning that three rows do not
       obstruct the map. That reasoning was the weaker half of the argument it came from: a control
       that moves position AND changes behaviour between tabs is two controls to learn, and the fuel
       key is the one a reader opens most, so it is the worst one to make behave differently. The chip
       still names itself, so the reader can see there IS a key and open it.
       One branch decides CONTENTS only, never placement, so a future tab cannot reintroduce a
       differently-placed legend by accident. */}
   {/* The legend takes the SAME derived value the map paints with. A legend that kept describing the
       depth ramp while the map showed one format's colour would be the worst version of this feature:
       a key that contradicts the picture it is a key to. */}
   <CollapsibleLegend>{tab==="nfr"?<NfrOpportunityLegend format={nfrFormat}/>:<Legend tab={tab}/>}</CollapsibleLegend>
  </section>
  <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto bg-muted/50 p-5 lg:p-6">
   <OperatorControl value={operatorFilter} onChange={onOperatorFilter} counts={operatorCounts}/>
   <InsightList tab={tab} lower={activeLower} upper={activeUpper} active={activeInsight} onSelect={onInsight} onClear={()=>onInsight(null)}/>
   {tab==="nfr"&&!selectedZone&&<section className="border border-l-4 border-l-primary bg-card p-4"><h3 className="font-bold">Select a location</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Click a polygon to see its population, land coverage and which formats are short. Affluence is shown only for residential locations.</p></section>}
   {hasDetail&&<div className="border-t pt-5">{tab==="fuel"?<FuelPanel zone={associatedZone} station={selectedStation} split={split} lower={lower} upper={upper}/>:tab==="nfr"?<NfrPanel zone={selectedZone} lower={nfrLower} upper={nfrUpper}/>:<CombinedPanel zone={selectedZone} lower={lower} upper={upper}/>}</div>}
   <div className="mt-auto pt-2"><ThresholdControls lower={activeLower} upper={activeUpper} onLower={tab==="nfr"?onNfrLower:onLower} onUpper={tab==="nfr"?onNfrUpper:onUpper} resetLower={tab==="nfr"?NFR_DEFAULT_LOWER:DEFAULT_LOWER} resetUpper={tab==="nfr"?NFR_DEFAULT_UPPER:DEFAULT_UPPER} showCannibalisation={tab==="fuel"}/></div>
  </aside>
 </div>
}
function Thresholds({lower,upper,onLower,onUpper,resetLower,resetUpper}:{lower:number;upper:number;onLower:(n:number)=>void;onUpper:(n:number)=>void;resetLower:number;resetUpper:number}){
 // Ranges must SPAN the derived defaults, or the starting values would sit off their own sliders.
 const atDerived=Math.abs(lower-resetLower)<1e-9&&Math.abs(upper-resetUpper)<1e-9
 return <section className="border bg-muted/40 p-4">
  {/* Named in full to match the Sources tab's "Thresholds and assumptions" wording. The enclosing
      summary uses an ampersand for width; spelled out here since this heading has the room. */}
  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Thresholds and assumptions</h3><span className="text-sm text-muted-foreground">{atDerived?"Derived from this study area":"Your override"}</span></div>
  {/* Bare "Lower / Upper" named the variable, not what it decides. The label now says which verdict
      the slider draws the line for, and the value carries its unit — a share of a fair share, where
      1.00 is fair — so 0.80 is not read as 80%. */}
  <label className="mt-4 block text-[15px] font-semibold">Under-served below · {lower.toFixed(2)}× fair share<input className="mt-2 w-full accent-primary" type="range" min="0.1" max="0.95" step="0.01" value={lower} onChange={(e)=>onLower(Number(e.target.value))}/></label>
  <label className="mt-3 block text-[15px] font-semibold">Over-served above · {upper.toFixed(2)}× fair share<input className="mt-2 w-full accent-primary" type="range" min="1.05" max="5" step="0.01" value={upper} onChange={(e)=>onUpper(Number(e.target.value))}/></label>
  <button type="button" onClick={()=>{onLower(resetLower);onUpper(resetUpper)}} disabled={atDerived} className="mt-3 w-full border border-border bg-background px-3 py-2 text-[15px] font-semibold hover:bg-muted disabled:opacity-45">{atDerived?`At default values · ${resetLower.toFixed(2)} / ${resetUpper.toFixed(2)}`:`Reset to defaults · ${resetLower.toFixed(2)} / ${resetUpper.toFixed(2)}`}</button>
  <div className="mt-4 grid gap-2 border-t pt-3 text-[15px] leading-relaxed text-muted-foreground">
   <p>These set how far from a fair share counts as a problem. Fair share is always 1.00 and does not move.</p>
   <p><span className="font-semibold text-foreground">Under-served below {lower.toFixed(2)}:</span> raise it to flag more gaps; lower it to flag only the most starved.</p>
   <p><span className="font-semibold text-foreground">Over-served above {upper.toFixed(2)}:</span> lower it to flag more crowding; raise it to flag only the most saturated.</p>
   <p>Widening the gap between them makes more areas well-served (conservative); narrowing it flags more areas either way (aggressive).</p>
   <p>This is a sensitivity control: it re-labels areas, it does not change the underlying data. The counts above move with it.</p>
  </div>
 </section>
}
// Only the fuel and combined tabs reach this legend; the non-fuel tab has its own two.
// The swatch is the SAME SHAPE as the thing it keys — a hexagon, drawn as SVG so its outline can
// carry the same stroke-dasharray Leaflet paints on the hex. A square swatch with a CSS border
// could not show a dashed edge, which is why the old legend had to fake "no material demand" with
// an opacity the map never applied.
function HexSwatch({colour,dash,stroke,opacity=1}:{colour:string;dash?:string;stroke?:string;opacity?:number}){
 return <svg aria-hidden viewBox="0 0 20 22" className="h-[20px] w-[18px] shrink-0"><polygon points="10,1 19,6.4 19,15.6 10,21 1,15.6 1,6.4" fill={colour} fillOpacity={opacity} stroke={stroke??"#ffffff"} strokeWidth={dash?1.3:0.8} strokeDasharray={dash}/></svg>
}
// Legend rows are BUILT from the palettes and dash constants the map paints with, so a swatch
// cannot fall out of step with a hex. The two absence rows are shared by both maps because both
// maps paint them.
// NO OPACITY FUDGE. The swatch takes the same fill AND the same outline colour the map paints, so
// the legend is a literal sample of the hex rather than an approximation of it. The two absence
// states differ on fill, on dash and on nothing else — which is exactly how they differ on the map.
// TWO LABELLED ROWS, ONE DEFINITION, ALL THREE TABS. This replaces a single unlabelled row that
// carried both swatches under one heading ("Not enough to assess") on the fuel and action tabs, while
// the non-fuel tab labelled the two states separately. One label over two visibly different hexes
// asked the reader to treat as one thing what the map draws as two, and "assessed, nothing to serve"
// is a different finding from "could not be scored": the first is a settled answer, the second is an
// admission. Only the second is a candidate for better data.
//
// Every legend on every tab renders THIS array, so the labels, the fills, the outlines and the order
// cannot drift apart between tabs. Wording follows the non-fuel tab, which already had it right.
const NO_READING=[
 {label:"No material demand",colour:ABSENCE_FILL.noDemand,dash:NO_DEMAND_DASH,tip:"The area was assessed and has too little demand to serve, so there is nothing to act on here. A settled reading, not a gap in the data."},
 {label:"No data · not assessed",colour:ABSENCE_FILL.noTraffic,dash:NO_TRAFFIC_DASH,tip:"The area could not be scored from the data available, either because a reading is missing or because it sits outside the analysed set. Not a finding about the area itself."},
] as const
// One renderer for the pair, so a tab cannot show them in a different order or at a different size.
function NoReadingRows(){return <>{NO_READING.map((state)=><LegendRow key={state.label} tip={state.tip}><HexSwatch colour={state.colour} dash={state.dash} stroke={ABSENCE_STROKE}/>{state.label}</LegendRow>)}</>}
// One place for the hover treatment, so a keyed row and its explanation cannot be styled apart.
// `title` carries it for the mouse; the same text is exposed to screen readers, since a tooltip a
// keyboard user cannot reach would leave the distinction available only to sighted mouse users.
function LegendRow({tip,children}:{tip:string;children:React.ReactNode}){
 return <span className="flex cursor-help items-center gap-1.5" title={tip}>{children}<span className="sr-only"> — {tip}</span></span>
}
function Legend({tab}:{tab:string}){
 const isAction=tab==="combined"
 // ONE ROW PER DISPLAY GROUP, read straight off ACTION_GROUP_KEYS and the same ACTION_GROUP_FILL the
 // hexes are painted with, so the legend cannot list an outcome the map no longer paints — or paint
 // one it does not list. "Add or relocate fuel" stays its own row: a fuel-only gap is a different
 // recommendation from an integrated new site, and merging them would merge two findings.
 const measured=isAction?ACTION_GROUP_KEYS.map((group)=>({
  colour:ACTION_GROUP_FILL[group],label:ACTION_GROUP_META[group].legend,
  // Only the merged row needs a note, and it is the one thing the shorter legend gives up, so it
  // says where the distinction is still available rather than leaving the reader to find out.
  tip:group==="overserved"?"Two verdicts under one colour: where Emarat holds a site here, consolidate or relocate it; where it holds none, the area is already crowded and there is nothing to act on. Click a hex to see which it is.":undefined,
 })):[
  {colour:fuelClassColors.over[1],label:"Over-served",tip:undefined},
  {colour:fuelClassColors.bal[1],label:"Well served",tip:undefined},
  {colour:fuelClassColors.fuel[1],label:"Under-served",tip:undefined},
 ]
 return <div>
  {/* Naming what the colour MEANS, per map, so three differently-coloured maps of the same hexes
      are not read as one scale. */}
  <p className="text-[13px] font-bold uppercase tracking-[.14em] text-muted-foreground">{isAction?"Action map":"Fuel gaps"}</p>
  <p className={`mb-2.5 text-sm font-bold ${isAction?"border-l-4 border-foreground pl-2":""}`}>{isAction?"Colour = recommended action.":"Colour = provision vs demand"}</p>
  <div className="flex flex-wrap gap-x-4 gap-y-2">
   {measured.map((row)=>{
    const swatch=<><HexSwatch colour={row.colour}/>{row.label}</>
    return row.tip
     ? <span className="text-sm" key={row.label}><LegendRow tip={row.tip}>{swatch}</LegendRow></span>
     : <span className="flex items-center gap-1.5 text-sm" key={row.label}>{swatch}</span>
   })}
  </div>
  {/* NO DEPTH BLOCK. It explained a second colour channel — depth = retail buying power on two of the
      actions — and cost six lines and a four-column grid to do it, over a map it partly covered. The
      tier is now text: chips on the two retail-led cards, and a named row in the click panel. One
      channel on the map means the legend is a list of colours and nothing else. */}
  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-2.5 text-sm">
   <span className="text-[13px] font-semibold text-muted-foreground">No reading to judge on</span>
   <NoReadingRows/>
  </div>
  {/* The red ring is drawn on the MAP but was never named in the legend, so the one marker a reader
      cannot decode from the fills had no key. Reads the same #cc0000 ring the map draws. */}
  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-2.5 text-sm">
   <span className="text-[13px] font-semibold text-muted-foreground">Station marker</span>
   <LegendRow tip="More than half of this station's modelled captured demand is drawn from other Emarat stations, based on directional drive time and congestion-adjusted road demand."><span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-[#cc0000]"><span className="h-1.5 w-1.5 rounded-full bg-[#16834a]"/></span>Cannibalization — draws mainly from other Emarat sites</LegendRow>
  </div>
 </div>
}
// NfrLocationLegend is gone with the colour-mode toggle. The non-fuel map has exactly one meaning
// for its colour, so it needs exactly one key.
//
// The chip is pinned to the top-left, clear of Leaflet's zoom control (~44px wide) so neither
// control covers the other. It carries WHATEVER legend it is given, unchanged — collapsing a legend
// changes when it is on screen, never what it says.
//
// ONE component for both tabs, taking the legend as a child, because two collapsible chips would be
// two chips to keep in step: the action tab's used to be a permanently-open box bottom-left, so the
// same control sat in a different place and behaved differently depending on which tab you were on.
function CollapsibleLegend({children}:{children:React.ReactNode}){
 const [open,setOpen]=useState(false)
 const box=useRef<HTMLDivElement|null>(null)
 // "Clicking elsewhere closes it" is a listener, not a backdrop: a full-map overlay would swallow
 // the hex clicks this tab exists for. Escape closes it too, so a keyboard user is not left with an
 // open panel over the map and no way to dismiss it.
 useEffect(()=>{
  if(!open)return
  const away=(event:PointerEvent)=>{if(box.current&&!box.current.contains(event.target as Node))setOpen(false)}
  const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)}
  document.addEventListener("pointerdown",away)
  document.addEventListener("keydown",key)
  return ()=>{document.removeEventListener("pointerdown",away);document.removeEventListener("keydown",key)}
 },[open])
 return <div ref={box} className="absolute left-14 top-3 z-[800]">
  <button type="button" onClick={()=>setOpen((was)=>!was)} aria-expanded={open} className="flex items-center gap-1.5 rounded-sm border-2 border-black/20 bg-background px-3 py-2 text-sm font-semibold shadow-md hover:bg-muted">
   <ChevronDown className={`h-4 w-4 transition-transform ${open?"rotate-180":""}`} aria-hidden/>Legend
  </button>
  {open&&<div className="mt-2 w-[min(30rem,calc(100vw-6rem))] border bg-background/97 p-4 shadow-lg">
   {children}
  </div>}
 </div>
}
// The legend is BUILT from the same ramp the map paints with, so a swatch cannot fall out of step
// with a hex. Each tier shows all three depths, because the depth is the gap count.
function NfrOpportunityLegend({format=null}:{format?:NfrFormatView|null}){
 return <div>
  {/* Same eyebrow + "Colour =" header as the fuel and action legends. Three differently-coloured
      maps of the SAME hexes are only safe to read once each one names what its colour means. */}
  <p className="text-[13px] font-bold uppercase tracking-[.14em] text-muted-foreground">Non-fuel gaps</p>
  <p className="mb-2.5 text-sm font-bold">{format?`Colour = areas short on ${nfrFormatViewLabel(format)}`:"Colour = retail opportunity, depth = gaps"}</p>
  {/* THE KEY FOLLOWS THE MAP. With a format tally selected the depth ramp is not on screen, so listing
      its three rows would teach a scale nothing is painted in. Instead the one live colour is named,
      and the areas that keep the ramp are described as what they are — dimmed, still short, just not
      on the selected format. */}
  {format?<div className="grid gap-1.5">
   <span className="flex items-center gap-2 text-sm"><HexSwatch colour={nfrFormatViewFill(format)}/>Short on {nfrFormatViewLabel(format)}</span>
   <span className="flex items-center gap-2 text-sm"><HexSwatch colour={OPP_DEPTH_RAMP[1]}/><span className="opacity-70">Dimmed: short, but not on {nfrFormatViewLabel(format)}</span></span>
  </div>:<div className="grid gap-1.5">
   {/* ONE ROW PER GAP COUNT, built from the ramp the map paints with, so a swatch cannot fall out of
       step with a hex. This replaces four rows of buying-power grades: the legend had to teach four
       hues before a reader could tell which areas were short, and the count — the thing the tab
       measures — was only a shade inside each one. */}
   {OPP_DEPTH_RAMP.map((colour,index)=><span className="flex items-center gap-2 text-sm" key={colour}>
    {/* HEXES, not rectangles. The map paints hexagons, so a rectangular swatch asks the reader to
        match a shape that is nowhere on screen. */}
    <HexSwatch colour={colour}/>
    {index===0?"1 measured format short":`${index+1} measured formats short`}
   </span>)}
  </div>}
  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{format?"Selected from the tallies under the opportunity card. Choose “All areas” there to return to the gap-count colours.":"Land use and affluence do not set this colour. They are named per area in the panel and on each area's title."}</p>
  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-2.5 text-sm">
   <LegendRow tip="Retail here already matches the demand, so there is no shortfall to act on."><HexSwatch colour={oppServedFill}/>Served, not of interest</LegendRow>
   {/* THE SAME TWO ROWS AS THE OTHER TWO TABS, from the same NO_READING definition rather than a
       hand-kept copy. This tab had the labels right first and the other two now follow it; what
       changed here is that both rows draw the shared tokens, so the near-identical cool greys this
       map used (one of them with no outline at all) no longer differ from the fuel and action maps
       for two states that mean the same thing everywhere. */}
   <NoReadingRows/>
  </div>
  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Gaps counted only for measured categories: F&amp;B, C-Store and car wash, in the demo build.</p>
 </div>
}
function areaVerdict(zone:Zone,lower:number,upper:number){if(!zone.live)return{title:"No material demand here",note:"Too few people and too little traffic to compare provision against."};if(zone.fuelLQ===null)return{title:"Not enough traffic observed",note:"This area is not classified because its traffic reading is missing."};if(zone.fuelLQ>upper)return{title:"Over-served area",note:"More fuel is available around here than the local traffic supports."};if(zone.fuelLQ<lower)return{title:"Under-served area",note:"Traffic here is served thinly relative to the rest of Dubai."};return{title:"Well-served area",note:"Provision around here matches the traffic it sees."}}

function FuelPanel({zone,station,split,lower,upper}:{zone:Zone|null;station:Station|null;split:ReturnType<typeof huffSplit>|null;lower:number;upper:number}){
 if(!zone&&!station)return null
 if(station&&!zone)return <div className="grid gap-4"><DetailTitle title={station.name} kicker={station.operator}/><section className="border bg-card p-5 text-base leading-relaxed text-muted-foreground">This station sits outside the study area, so there is no local read for it.</section></div>
 const verdict=areaVerdict(zone!,lower,upper)
 const action=station?.operator==="Emarat"?({"Relocate / Divest":"Review for relocation or divestment","Add fuel capacity":"Room to add fuel capacity","Retain":"Retain","No material demand":"No action — no material demand","Insufficient traffic observation":"No action — not enough traffic observed"} as Record<string,string>)[fuelAction(zone!,upper,lower)]:zone!.live&&zone!.fuelLQ!==null&&zone!.fuelLQ<lower&&zone!.hasEmarat===0?"Candidate to add fuel":"Nothing to act on here"
 return <div className="grid gap-4">
  <DetailTitle title={station?.name??"Selected area"} kicker={station?station.operator:"Area detail"}/>
  <section className="border bg-card p-5">
   <p className="text-xl font-black leading-tight">{verdict.title}</p>
   <p className="mt-2 text-base leading-relaxed text-muted-foreground">{verdict.note}</p>
   <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t pt-4 text-base">
    {[['Structural road exposure',zone!.structuralFuelDemand.toFixed(1)],['Snapshot congestion',`${zone!.congestion.toFixed(1)}%`],['Congestion uplift',`${((zone!.congestionFactor-1)*100).toFixed(1)}%`],['Adjusted traffic proxy',zone!.fuelDemand.toFixed(1)],['Observed road segments',zone!.observedSegmentCount.toLocaleString()],['Closed road length',`${zone!.closedRoadKm.toFixed(2)} km`],['Fuel LQ',zone!.fuelLQ===null?'Not readable':`${zone!.fuelLQ.toFixed(2)}x`]].map(([k,v])=><div key={k}><dt className="text-sm text-muted-foreground">{k}</dt><dd className="mt-0.5 font-semibold tabular-nums">{v}</dd></div>)}
   </dl>
   <p className="mt-4 border-t pt-4 text-base font-bold">{action}</p>
      {/* The breakpoint sentence is gone with the map overlay it explained. It stated where customers
          "start to prefer" a competitor to a tenth of a kilometre, from a two-station formula with both
          attractiveness terms fixed at 1 — a precise claim resting on an assumption the reader never saw. */}
  </section>
  {split&&<Huff split={split}/>}
 </div>
}
function Huff({split}:{split:ReturnType<typeof huffSplit>}){
 const total=Math.max(split.captured,1e-9)
 const networkBased=split.method==="directional-network"
 const parts=[["Drawn from other Emarat stations",split.fromEmarat],["Drawn from competitors",split.fromComp],["Newly served / outside option",split.newly]] as const
 return <section className="border bg-card p-5">
  <h3 className="text-lg font-black">Where the captured demand would come from</h3>
  <div className="mt-4 grid gap-3">{parts.map(([label,value])=><div className="flex items-baseline justify-between gap-4 border-b pb-3 text-base" key={label}><span className="text-muted-foreground">{label}</span><strong className="tabular-nums">{Math.round((value/total)*100)}%</strong></div>)}</div>
  <p className="mt-4 text-base font-semibold">{split.canRate>0.5?"Most captured demand is drawn from Emarat's own stations; this is high own-network cannibalisation risk.":"Most captured demand is drawn from competitors or the outside option; own-network cannibalisation is lower."}</p>
  {networkBased&&split.topPartnerName&&<p className="mt-3 text-sm leading-relaxed"><strong>Most affected Emarat site:</strong> {split.topPartnerName}, with an estimated <strong>{Math.round((split.topPartnerLossRate??0)*100)}%</strong> reduction in its modelled capture after this site is included.</p>}
  <p className="mt-4 border-l-4 border-primary pl-4 text-sm leading-relaxed text-muted-foreground">{networkBased?`Existing-site result: directional OSM drive time, one-way and forecourt access, Gaussian decay with tau ${split.tauMinutes.toFixed(1)} minutes, and congestion-adjusted TomTom road exposure. ${split.attractivenessAssumption} This ranks screening risk; it does not estimate lost litres or justify closure.`:"New candidate preview only: straight-line gravity is used because no directional route has been precomputed for this arbitrary point. Do not treat this preview as the final cannibalisation result."}</p>
 </section>
}
function NfrPanel({zone,lower,upper}:{zone:Zone|null;lower:number;upper:number}){
 if(!zone)return null
 const row=nfrMultiFormatById.get(zone.id)
 // The ONLY screen a genuinely unsurveyed hex reaches, so it must state the coverage finding
 // rather than report a missing lookup. "No multi-format record is available" described our data
 // plumbing and left the reader to guess whether the area was measured and found empty.
 if(!row)return <section className="border bg-card p-5">
  <p className="text-sm font-bold">{NFR_BUCKET_LABEL["not-observed"]}</p>
  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{NFR_BUCKET_NOTE["not-observed"]}</p>
  {/* Counted, never asserted: a hardcoded "the only area" would go on claiming that after a
      feed with wider coverage gaps arrived. */}
  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">No gap can be claimed or ruled out here. {unsurveyedLiveCount===1?"This is the only live area in that position":`${unsurveyedLiveCount} live areas are in that position`}, drawn with a broken outline.</p>
 </section>
 const areaArchetype=archetype(zone)
 const bucket=nfrOppBucket(zone,lower)
 const gapFormats=measuredGapFormats(zone,lower)
 // The verdict follows survey COVERAGE, not supply: "Not observed" is reserved for a format whose
 // catchment pass never reached this hex. This runs on OSM and TomTom, so no chip asserts a
 // finding — "Likely short" is the strongest claim available and the rest are hedged to match.
 // The short test READS `gapFormats`, rather than comparing the index again, so the chip, the
 // colour and the count are one judgement; that is also why a surveyed zero reads short whatever
 // its index says, and hex 105's car wash no longer said "well served" beside "0 here · 0 nearby".
 const verdict=(format:NfrFormatId)=>{
  const state=nfrFormatState(zone,format)
  if(state==="unsurveyed")return"Not observed"
  if(state==="no-material-demand")return"Little demand"
  if(isMeasuredNfrFormat(format)&&gapFormats.includes(format))return"Likely short"
  return row.formats[format].accessibility_index>=upper?"Looks well covered":"Looks adequate"
 }
 // The suggestion list reads the SAME tier that sets the colour, so the copy and the fill can
 // never describe different areas.
 const valueTier=nfrValueTier(zone)
 // ONE list, ordered so the entries carrying evidence come first. `short` is DERIVED from the same
 // `measuredGapFormats` that sets the colour and the count, so an entry can never claim thin supply
 // the map does not also show — and an entry with no `format` can never be marked short at all.
 const suggestions=suggestionsFor(valueTier)
  .map((entry)=>({...entry,short:Boolean(entry.format&&gapFormats.includes(entry.format))}))
  .sort((a,b)=>Number(b.short)-Number(a.short))
 const shortCount=suggestions.filter((entry)=>entry.short).length
 // THE HEADER IS ONE LINE: WHERE THIS IS. The AED/sqm figure, the polygon number and the gap-type
 // title are all gone. The gap read is not lost with the title — every measured format below carries
 // its own verdict badge, so "F&B + C-Store short" was a summary sitting directly above the evidence
 // it summarised, and the affluence figure was a residential-only segment competing for the panel's
 // most prominent line.
 //
 // PRECEDENCE IS STRONGEST-ABSENCE-FIRST, because a hex can be both unsurveyed and unclassified and
 // only one line is available to say so. If the survey never reached here, that outranks any land-use
 // reading; and a bucket with no measured demand outranks the tier for the same reason. Naming the tier
 // of an area nothing was measured in would dress a coverage gap as a profile.
 const headerLabel=
  bucket==="not-observed"?NFR_BUCKET_LABEL["not-observed"]
  // The bucket's own label is "No material demand FOR THESE FORMATS", and that qualifier is doing real
  // work: the area is live and may have plenty of fuel demand, it is the three measured formats that
  // have none. Shortened here to the agreed header wording; the qualifier stays reachable because every
  // format card below this reads "Little demand" individually.
  :bucket==="no-material-demand"?"No material demand"
  // Covers the profile-unknown case with no branch of its own: ARCHETYPE_LABEL.unclassified already
  // reads "Profile not established", and `nfrValueTier` maps unclassified to profile-unknown and
  // nothing else, so the two vocabularies cannot disagree. Asserted in lib as
  // `profileUnknownIsExactlyUnclassified`, since this header now depends on that agreement.
  :ARCHETYPE_LABEL[areaArchetype]
 const formatCard=({id:format,label}:{id:NfrFormatId;label:string})=>{
  const result=row.formats[format]
  const status=verdict(format)
  // Derived from the SAME gap set the chip reads, not by string-matching the chip's text — the
  // previous `status==="Gap"` silently stopped highlighting anything the moment the label changed.
  const isShort=isMeasuredNfrFormat(format)&&gapFormats.includes(format)
  return <div key={format} className={`flex min-h-[112px] flex-col border p-3 ${isShort?"border-primary bg-primary/5":"border-border"}`}>
   <strong className="text-sm leading-tight">{label}</strong>
   <span className={`mt-2 w-fit border px-2 py-0.5 text-[13px] font-black uppercase tracking-wide ${isShort?"border-primary bg-primary text-primary-foreground":"border-border bg-muted text-muted-foreground"}`}>{status}</span>
   {/* Counts are only meaningful where the survey ran. An unsurveyed cell prints no numbers at
       all, because "0 here · 0 nearby" would read as a measured absence. */}
   {nfrFormatState(zone,format)==="unsurveyed"
    ?<p className="mt-auto pt-2 text-[13px] text-muted-foreground">Public data does not cover this format here</p>
    :<p className="mt-auto pt-2 text-[13px] text-muted-foreground">{result.inside_hex_count} here · {result.nearby_count_within_lambda} nearby in public data</p>}
  </div>
 }
 return <div className="grid gap-4">
  <DetailTitle title={headerLabel}/>
  <section className="border bg-card p-4">
   <h3 className="text-base font-black">Measured formats</h3>
   <p className="mt-1 text-sm leading-relaxed text-muted-foreground">This demo covers the measured formats only; the area&apos;s tier shapes the suggestion.</p>
   <div className="mt-3 grid grid-cols-2 gap-2">{measuredOptions.map(formatCard)}</div>
   {/* THE TWO PROVENANCE LINES, MOVED HERE FROM THE DELETED DEMOGRAPHICS BOX. They belong under the
       cards rather than at the foot of the panel, because what they qualify is the "N here · N nearby"
       count on each card: those are OSM facilities near the area, not confirmed Emarat forecourt
       formats. Kept when the demographics went, since dropping them would leave those counts reading as
       a station inventory. */}
   <div className="mt-3 border-t pt-3 text-[13px] leading-relaxed text-muted-foreground">
    <p>On-station formats are unknown pending the Emarat site master.</p>
    <p className="mt-1">Public OSM facilities are nearby, off-pump evidence and are not confirmed station-owned facilities.</p>
   </div>
  </section>
  <section className="border border-l-4 border-l-primary bg-card p-5">
   <p className="text-sm font-bold">Suggestions for this location</p>
   {/* ONE list. The two reasons are carried per entry rather than as two headings, and the
       short ones lead because they are the only entries with evidence behind them. */}
   {valueTier==="profile-unknown"
    ?<p className="mt-2 border bg-muted p-3 text-sm font-semibold">Land coverage must be established before a format can be suggested.</p>
    :<>
      <div className="mt-3 grid grid-cols-2 gap-2">{suggestions.map(({label,format,short})=><div key={label} className={`border p-3 ${short?"border-primary bg-primary/5":"border-border"}`}>
        <strong className="text-sm leading-tight">{label}</strong>
        {short
         ?<p className="mt-1 text-[13px] font-bold text-primary">Public data suggests limited supply</p>
         :<p className="mt-1 text-[13px] text-muted-foreground">Fits this area type</p>}
        {/* Counts appear ONLY on an entry with a surveyed format behind it. On an archetype
            suggestion they would imply a measurement that was never taken. */}
        {short&&format&&<p className="mt-1 text-[13px] text-muted-foreground">{row.formats[format].inside_hex_count} here · {row.formats[format].nearby_count_within_lambda} nearby in public data</p>}
       </div>)}</div>
      {shortCount>0&&<p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">Public data suggests limited supply here — worth a look. {shortCount === 1?"One format":`${shortCount} formats`} of the three with public coverage {shortCount===1?"looks":"look"} thin against local demand; the rest are suggested on area type alone.</p>}
     </>}
  </section>
  {/* THE LOCATION-PROFILE BOX IS DELETED: effective population, density, living/working here, land
      coverage and residential affluence. Six figures that described the area rather than the retail
      question the panel exists to answer, and none of them was the reason a format reads short. The two
      provenance lines that sat at its foot were NOT deleted with it — they moved up under the format
      cards, where the counts they qualify actually are. */}
 </div>
}
const plainFuel:Record<string,string>={oversaturated:"This area has more reachable fuel provision than its share of the study area's traffic.","cannibalization > 50%":"More than half of this station's modelled capture is drawn from other Emarat stations when it is included as the candidate.","white-space":"Provision here is below this area's share of traffic, and Emarat is absent.",short:"Provision here is below this area's share of traffic.",ok:"Provision is about this area's fair share."}
const plainNfr:Record<string,string>={short:"Shops and services within reach are thin.",ok:"Shops and services within reach are adequate."}

function CombinedPanel({zone,lower,upper}:{zone:Zone|null;lower:number;upper:number}){
 if(!zone)return null
 const c=category(zone,zone.canRate,upper,lower)
 if(!c)return <div className="grid gap-4"><DetailTitle title={zone.live?"Not enough traffic observed":"No material demand here"} kicker="Area detail"/><section className="border bg-card p-5 text-base leading-relaxed text-muted-foreground">{zone.live?"This area has no traffic reading, so no recommendation is made for it.":"Too few people and too little traffic here to recommend anything."}</section></div>
 return <div className="grid gap-4">
  <DetailTitle title={c.action} kicker="Recommended for this area"/>
  <section className="border bg-card p-5">
   {/* THE ORDER IS THE ARGUMENT: the fuel read comes first because it is what qualifies the area for
       an action at all, then the retail read, then what the two together mean. The retail TIER sits
       inside the retail row rather than beside the action, since it grades the retail case and not
       the recommendation as a whole. */}
   <div className="grid gap-3 text-base">
    <p className="border-b pb-3"><span className="font-bold">Fuel · </span><span className="text-muted-foreground">{plainFuel[c.trace.fuel]??c.trace.fuel}</span></p>
    <div className="border-b pb-3">
     <p><span className="font-bold">Retail · </span><span className="text-muted-foreground">{plainNfr[c.trace.nfr]??c.trace.nfr}</span></p>
     {/* Rendered only where the action is retail-led, so a tier never appears next to a fuel-only or
         consolidation verdict it played no part in. */}
     {/* NAMED, NOT COLOURED, AND NOW IN THE LOCATION VOCABULARY. This read ACTION_TIER_LABEL, so the
         panel said "Premium" where the non-fuel tab's panel for the same hex said "Affluent
         neighbourhood". It is gated on `c.tier` still — that is what marks the action retail-led, so
         a location line never appears beside a fuel-only or consolidation verdict it played no part
         in — but what it prints is the archetype both tabs now use. */}
     {c.tier&&<p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="border px-2 py-0.5 text-sm font-bold">{ARCHETYPE_LABEL[archetype(zone)]}</span>
      <span className="text-sm text-muted-foreground">{ARCHETYPE_NOTE[archetype(zone)]}</span>
     </p>}
    </div>
    <p><span className="font-bold">Emarat here · </span><span className="text-muted-foreground">{zone.hasEmarat>0?`${zone.hasEmarat} station${zone.hasEmarat>1?"s":""} associated with this area`:"No station in this area"}</span></p>
   </div>
   {zone.emaratStationIds.length>0&&<div className="mt-4 border-t pt-4">
    <p className="text-sm font-bold">Emarat stations here</p>
    <div className="mt-2 grid gap-2 text-base">{zone.emaratStationIds.map((id)=>{const station=stations.find((item)=>item.id===id);const rate=stationHuffResults.get(id)?.canRate??0;return <div key={id} className="flex justify-between gap-4 text-muted-foreground"><span>{station?.name??id}</span><span className="tabular-nums">{rate>0.5?"majority drawn from Emarat":"majority drawn outside Emarat"}</span></div>})}</div>
   </div>}
  </section>
 </div>
}
// `kicker` is OPTIONAL so a single-line header is a real state rather than an empty paragraph holding
// space above the title. The action panel still passes one; the non-fuel panel no longer does.
function DetailTitle({title,kicker}:{title:string;kicker?:string}){return <div className="border-t-4 border-primary bg-foreground p-5 text-background">{kicker&&<p className="text-sm font-semibold opacity-70">{kicker}</p>}<h2 className={`text-xl font-black leading-tight${kicker?" mt-1":""}`}>{title}</h2></div>}

// EVERY ROW IS KEPT, only the wording is plainer. The cells that changed most were the ones written
// for whoever built the pipeline rather than whoever reads it: "cross-source deduplicated",
// "nearest-community spatial imputation", "demand-signature rule", "OSM land use × assumed
// employment density". The Dubai boundary status also carried the page's only em-dash, and stated the
// exclusion as a story about what the map used to look like; it now states the exclusion itself.
function Sources(){const sources=[["Stations","TomTom and OSM, with duplicates removed across the two sources","Observed"],["Traffic","TomTom traffic snapshot","Observed snapshot, used as the fuel demand proxy"],["Population","WorldPop","Modelled population"],["Workers","Estimated from land use and employment density","Proxy"],["Affluence","Dubai Land Department transactions, mapped to nearby communities","Proxy"],["NFR supply","TomTom and OSM points of interest around station catchments","Observed, but coverage is limited"],["NFR format","Inferred from the pattern of demand in each area","Proxy"],["Hex grid","Constructed analysis geography","Analysis layer"],["Fuel provision vs demand","Model output, shown as the map colour","Model output, shown as the map's fuel colour scale"],["Retail provision vs demand","Model output, shown as the map colour","Model output, shown as the map's retail colour scale"],["Dubai boundary and coastline","User-supplied boundary outline, from the UAE FGIC layer with a 1,200 m coastal closing","Mainland Dubai outline only. Hatta is excluded as a detached exclave with no analysed area, so it is not drawn."]];// BUSINESS TERMS THE TOOL ACTUALLY SAYS OUT LOUD, one plain sentence each. The pure-mechanics
// entries (Reilly/Converse breakpoint, 2SFCA, Huff gravity, spatial-interaction/gravity) were
// removed: a glossary should define the words a reader meets on screen, and none of those four
// appear anywhere in the insights or the legend — they were defining the engine, not the output.
// They move to the proposal write-up. Location quotient stays because "fair share" rests on it,
// but reduced to the one line that carries the meaning.
// PRUNED TO THE WORDS A READER ACTUALLY MEETS ON SCREEN. Dropped: "Coverage gap" and
// "Oversaturated" (the tool says "Under-served" and "Over-served"), "Heat mapping" (generic, never a
// label) and "Drive-time overlap" (never a label either, though see the note below on why its stated
// reason for dropping does not hold). Each was verified as absent from every visible label first.
//
// "White-space" is a FLAGGED KEEP, not an oversight: it is the headline of a live Fuel gaps card
// ("white-spaces identified"), so dropping it would have left a term on screen with nothing defining
// it. "Location quotient" is the held keep, being the metric this page exists to explain.
// The spelling here is the British "Cannibalisation"; the map legend still reads with a z, which is
// flagged rather than silently matched.
const glossary=[["Catchment","The area whose demand is served by a station."],["White-space","An under-served fuel area with no Emarat station in it."],["Cannibalisation","The share of a new site's demand that would come from other Emarat stations rather than from competitors."],["Location quotient","An area's share of provision vs its share of demand; 1.0 is a fair share."]];return <div className="mx-auto max-w-6xl px-5 py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><button className="mb-5 flex items-center gap-1 text-[13px] font-bold text-muted-foreground" onClick={()=>history.back()}><ChevronLeft className="h-4 w-4"/> Definitions</button><p className="text-[13px] font-bold uppercase tracking-[.16em] text-primary">Model governance</p><h1 className="mt-2 text-4xl font-black tracking-tight">Sources &amp; Definitions</h1></div></div>
 {/* THE OLD "How to read this in four sentences" BLOCK IS GONE. Three of its four sentences restated
     "How to read the map" directly below it, so the page opened by saying the same thing twice at two
     levels of detail. Its one distinct point, that the thresholds are movable, is now the substance of
     "Thresholds and assumptions" below. Order is: read the map, then the cut-offs behind it, then the
     layers underneath, then the words. */}
 <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]"><div><section className="mb-10"><h2 className="mb-4 text-2xl font-black">How to read the map</h2><div className="grid gap-3.5 border bg-card p-5 text-[17px] leading-relaxed text-muted-foreground">
   {/* NO THRESHOLDS PARAGRAPH HERE ANY MORE: the cut-offs are a separate question from what the colour
       means, and they now have their own section. Also gone are the derivation mechanics that once sat
       here (log-space band, percentile cut-off, winsorising cap, Isard / Stewart / 2SFCA naming),
       which belong in the proposal write-up where a methodologist can defend them. */}
   <p><span className="font-bold text-foreground">What the colour measures.</span> For each area we compare its share of fuel provision against its share of demand. A score of <span className="font-mono font-semibold text-foreground tabular-nums">1.0</span> is a fair share, the provision that area&apos;s demand warrants. Above 1.0 is more than its fair share (over-served) and below 1.0 is less (under-served).</p>
   <p>The score is <span className="font-semibold text-foreground">relative to the Dubai norm</span>, not an absolute standard. Both sides are <span className="font-semibold text-foreground">proxies</span>: provision is station presence, not pumps or sales, and demand is a traffic index, not measured vehicle volume. Every output is a <span className="font-semibold text-foreground">ranking, never litres or revenue.</span></p>
   {/* TWO WITHHELD CLASSES, NOT ONE. This line previously named a single class, "Not enough to
       assess", which the legends no longer show: the labels are read from NO_READING so this passage
       and the three legends name the same two states in the same order. The names are quoted rather
       than derived because prose has to read as prose, so they are checked against NO_READING below. */}
   <p><span className="font-semibold text-foreground">Classes:</span> Over-served, Well served and Under-served, plus two classes we withhold rather than score. Neither is a zero.</p>
   <p><span className="font-semibold text-foreground">{NO_READING[0].label}:</span> the area was assessed and has too little demand to serve. <span className="font-semibold text-foreground">{NO_READING[1].label}:</span> the area could not be scored from the data available.</p>
  </div></section>
  {/* THRESHOLDS AND ASSUMPTIONS. Plain language only: "winsorised", "log space" and the percentile
      rule are deliberately absent, because the client needs to know the bands come from this market
      and can be moved, not how the spread was computed. The two defaults are rendered from the same
      constants the engine uses, so this paragraph cannot quote a cut-off the tool no longer applies. */}
  <section className="mb-10"><h2 className="mb-4 text-2xl font-black">Thresholds and assumptions</h2><div className="grid gap-3.5 border bg-card p-5 text-[17px] leading-relaxed text-muted-foreground">
   {/* FAIR SHARE FIRST, because every other sentence on this tab is relative to it. It is stated as a
       fixed anchor (1.00 never moves) precisely so the movable cut-offs below cannot be mistaken for it. */}
   <p><span className="font-bold text-foreground">Fair share.</span> Every area is measured against its fair share. An area has its fair share when its slice of provision matches its slice of demand, and we call that <span className="font-mono font-semibold text-foreground tabular-nums">1.00</span>. Above <span className="font-mono font-semibold text-foreground tabular-nums">1.00</span> it has more than its fair share (over-served); below <span className="font-mono font-semibold text-foreground tabular-nums">1.00</span> it has less (under-served). Fair share is always <span className="font-mono font-semibold text-foreground tabular-nums">1.00</span> and does not move.</p>
   {/* THE INPUTS DIFFER, THE CUT-OFFS DO NOT. Worth being exact here: the two tabs do carry separate
       threshold state (DEFAULT_* vs NFR_DEFAULT_*), but this passage deliberately claims only that the
       INPUTS differ, per the brief. So it names what feeds each score and stops there.
       Non-fuel provision names only the three MEASURED formats. Bakeria, LubeX, VTC and Shop Rentals are
       suggested outputs, not observed supply, and listing them here would present a recommendation as
       evidence. */}
   <p><span className="font-bold text-foreground">What decides fair or under is different for fuel and non-fuel.</span></p>
   <p>For fuel, demand is how busy the roads are, and provision is how much fuel retail sits within reach. An area is under-served on fuel when traffic is heavy but few stations serve it.</p>
   <p>For non-fuel, demand is the number of people nearby and their spending power, and provision is the retail actually observed around stations, such as food and drink, convenience and car wash. An area is under-served on non-fuel when there are many potential customers but little retail to serve them.</p>
   {/* The two defaults render from the same constants the engine applies, so this cannot quote a cut-off
       the tool no longer uses. "Thresholds and assumptions" names the panel by its own title rather than
       by role, so the reader looks for a label that exists on screen. */}
   <p><span className="font-bold text-foreground">The cut-offs.</span> Thresholds are the two points that mark where under-served and over-served begin. The defaults, <span className="font-mono font-semibold text-foreground tabular-nums">{DEFAULT_LOWER.toFixed(2)}</span> and <span className="font-mono font-semibold text-foreground tabular-nums">{DEFAULT_UPPER.toFixed(2)}</span>, are not set by hand. They come from how widely scores spread across Dubai, so the bands fit this market rather than an outside benchmark. You can move both in the Thresholds and assumptions controls to see how sensitive the picture is.</p>
  </div></section>
  <section><h2 className="mb-4 text-2xl font-black">Data layers</h2><div className="overflow-x-auto border"><table className="w-full min-w-[660px] text-left text-[16px]"><thead className="bg-foreground text-background"><tr><th className="p-3.5">Layer</th><th className="p-3.5">Source</th><th className="p-3.5">Status</th></tr></thead><tbody>{sources.map(r=><tr className="border-b" key={r[0]}>{r.map((c,i)=><td className={`p-3.5 align-top ${i===0?"font-bold":"text-muted-foreground"}`} key={c}>{c}</td>)}</tr>)}</tbody></table></div></section><section className="mt-10"><h2 className="mb-4 text-2xl font-black">Glossary</h2><dl className="grid gap-px border bg-border sm:grid-cols-2">{glossary.map(([t,d])=><div className="bg-background p-4" key={t}><dt className="text-[17px] font-bold">{t}</dt><dd className="mt-1 text-[16px] leading-relaxed text-muted-foreground">{d}</dd></div>)}</dl></section></div><div className="grid content-start gap-4"><section className="border-l-4 border-primary bg-muted p-4"><h3 className="text-xl font-bold">Interpretation guardrail</h3><p className="mt-2 text-[16px] leading-relaxed text-muted-foreground">All outputs are indices or rankings. They are not litres, revenue or financial forecasts. Opposite-carriageway suppression is unavailable until a road-segment layer is supplied.</p></section></div></div></div>}
