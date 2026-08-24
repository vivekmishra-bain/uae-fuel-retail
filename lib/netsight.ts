import trafficData from "@/data/traffic_per_hex.json"
import populationData from "@/data/effective_pop_per_hex.json"
import affluenceData from "@/data/affluence_per_hex.json"
import stationData from "@/data/stations.json"
import stationCorridorData from "@/data/station_corridor_scores.json"
import nfrMultiFormatData from "@/data/nfr_multiformat_2sfca_per_hex.json"
import { dubaiBoundary as dubaiBoundaryData } from "@/data/dubai_boundary"

export const GLAT0 = 24.83
export const GLAT1 = 25.38
export const GLON0 = 54.95
export const GLON1 = 55.55
export const HEX_R = 0.02
export const LAMBDA = 2.6
export const U0 = 0.06
export const JOIN_TOL = 0.02
export const MAX_CONGESTION_UPLIFT = 0.25
// The supplied JSONs were all produced from the same canonical 200-hex grid.
// Joining them by id is safe only when that id still points at the same centre.
export const COORD_TOL = 0.001
// Desert gate. The 90th percentile of effective population in hexes more than 6 km from any
// station is ~7,300, while the median urban hex carries ~45,600 — so 8,000 sits above the
// desert distribution and keeps interior sand as "No material demand" rather than under-served.
export const POP_MIN = 8000
const MAX_HEX_ASSOCIATION_KM = 3.2
// Readability gate. A hex whose traffic base is a rounding error cannot support a ratio: with
// demand in the single digits, one reachable station drives the quotient to absurd values (the
// ungated maximum was 628x, from four hexes carrying under 20 traffic units). Gating at the 5th
// percentile of observed traffic removes exactly those four and drops the maximum to ~6.5x.
// They become "Insufficient traffic observation" — an absent reading, never a zero or a finding.
export const DEMAND_FLOOR_PCTL = 0.05
// Winsorization for whatever survives the gate, so no single hex can move the derived
// thresholds or the colour ramp.
const WINSOR_LO = 0.01
const WINSOR_HI = 0.99

type Position = [number, number]
type PolygonCoordinates = Position[][]
type BoundaryGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: PolygonCoordinates[] }
const dubaiGeometry: BoundaryGeometry = JSON.parse(JSON.stringify(dubaiBoundaryData.geometry))
export const dubaiBoundaryLatLngs = (dubaiGeometry.type === "Polygon" ? [dubaiGeometry.coordinates] : dubaiGeometry.coordinates).map((polygon) =>
  polygon.map((ring) => ring.map(([lon, lat]) => [lat, lon] as [number, number])),
)

export type Station = { id: string; name: string; operator: string; lat: number; lon: number; attractiveness?: number }
export type HuffResult = {
  captured: number
  fromEmarat: number
  fromComp: number
  newly: number
  canRate: number
  excludeStationId?: string
  baselineStationCount: number
  method:"directional-network"|"euclidean-preview"
  tauMinutes:number
  attractivenessAssumption:string
  topPartnerName?:string|null
  topPartnerLossRate?:number
}
export type NetworkHex = {
  id:number; lat:number; lon:number; network_road_demand:number
  network_accessible_supply:number; network_fuel_lq:number|null
  outside_unserved_share:number|null; dominant_road:string; corridor_share:number
  structural_road_exposure:number; matched_directed_edges:number
  accessible_station_count:number; accessible_emarat_count:number
}
export type NetworkStationScore = Station & {
  captured_demand_index:number; transfer_to_emarat:number
  transfer_to_competitors:number; transfer_to_outside:number
  emarat_cannibalisation_rate:number|null; competitor_transfer_rate:number|null
  unique_or_unserved_rate:number|null; snap_confidence:string
  top_emarat_partner_name:string|null; top_partner_loss_rate?:number
  attractiveness?:number; attractiveness_assumption?:string
  travel_time_method?:string; time_decay_tau_minutes?:number; outside_option_u0?:number
  allocation_identity_error?:number|null
}
export type StationOverlapPair = {
  source_station_id:string; source_station_name:string; source_lat:number; source_lon:number
  partner_station_id:string; partner_station_name:string; partner_lat:number; partner_lon:number
  source_captured_demand_index:number; total_emarat_transfer_rate:number
  partner_transfer_index:number; partner_share_of_capture:number
  partner_share_of_emarat_transfer:number; straight_line_km:number
  partner_capture_before_candidate?:number; partner_capture_after_candidate?:number
  partner_loss_rate?:number
  flagged_above_50pct:boolean
}
export type NfrFormatId = "f_and_b"|"cstore"|"bakeria"|"carwash"|"lube"|"vtc"
export type NfrFormatResult = {
  label:string; catchment_lambda_km:number; inside_hex_count:number
  nearby_count_within_lambda:number; possible_on_station_candidates:number
  demand_index:number; affluence_weight:number; population_density_weight:number
  landuse_weight:number; accessibility_2sfca:number; accessibility_index:number
  opportunity_priority_score:number
  classification:"gap"|"balanced"|"over_served"|"no_material_demand"
  material_demand:boolean; evidence_source:string
}
export type NfrMultiFormatHex = {
  id:number; lat:number; lon:number; population:number; residents:number; workers:number
  population_density_per_km2:number; landuse:string; primary_context:string|null
  landuse_confidence:string; affluence_aed_sqm:number
  affluence_applied?:boolean; affluence_tier?:"low"|"mid"|"premium"|null
  stations_in_hex:Array<{id:string;name:string;operator:string}>
  on_station_formats_status:string; formats:Record<NfrFormatId,NfrFormatResult>
  recommendations:Array<{format:NfrFormatId;label:string;accessibility_index:number;opportunity_priority_score:number;nearby_count:number;reason:string}>
}
export type Zone = {
  id: number; lat: number; lon: number; fuelDemand: number; structuralFuelDemand: number; congestion: number; congestionFactor: number
  observedSegmentCount: number; closedRoadKm: number
  population: number; residents: number; workers: number; landuse: string; affluence: number
  // Cell area as stated by effective_pop_per_hex.json. Null when the file does not state one:
  // density is then unavailable rather than silently divided by an assumed constant.
  hexAreaKm2: number | null
  food: number; convenience: number; carwash: number; service: number; nfrLocal: number
  hasEmarat: number; emaratStationIds: string[]; stationCanRates: Record<string, number>
  canRate: number; canRateStationId: string | null
  fuelSupply: number; nfrSupply: number; nfrDemand: number
  fuelLQ: number | null; nfrLQ: number
  live: boolean
}

export const stations = stationData as Station[]
export const networkHexes:NetworkHex[]=[]
export const networkStationScores = new Map(
  (stationCorridorData as NetworkStationScore[]).map((row)=>[row.id,row]),
)
export const flaggedCannibalisationStationIds = new Set(
  stations
    .filter((station)=>station.operator==="Emarat"&&(networkStationScores.get(station.id)?.emarat_cannibalisation_rate??0)>0.5)
    .map((station)=>station.id),
)
const firstNetworkStationScore=[...networkStationScores.values()][0]
export const cannibalisationAssumptions={
  tauMinutes:firstNetworkStationScore?.time_decay_tau_minutes??2.5,
  outsideOption:firstNetworkStationScore?.outside_option_u0??U0,
  attractiveness:firstNetworkStationScore?.attractiveness??1,
  attractivenessStatus:firstNetworkStationScore?.attractiveness_assumption??"Equal attractiveness (A=1); refine with site data.",
}
export const stationOverlapPairs:StationOverlapPair[]=[]
export const nfrMultiFormatHexes = nfrMultiFormatData as NfrMultiFormatHex[]
export const nfrMultiFormatById = new Map(nfrMultiFormatHexes.map((row)=>[row.id,row]))
export const nfrFormatIds:NfrFormatId[]=["f_and_b","cstore","bakeria","carwash","lube","vtc"]
const traffic = trafficData as Array<{id:number;lat:number;lon:number;fuel_demand:number;structural_fuel_demand?:number;traffic_demand?:number;congestion:number;congestion_factor?:number;observed_segment_count?:number;closed_road_km?:number}>
const population = populationData as Array<{id:number;lat:number;lon:number;pop:number;residents:number;workers:number;landuse:string;hex_area_km2?:number}>
const affluence = affluenceData as Array<{id:number;lat:number;lon:number;aed_sqm:number}>
// This is the only NFR input. The legacy nfr_per_hex dataset is deliberately not imported.
const nfr=nfrMultiFormatHexes.map((row)=>({
  id:row.id,lat:row.lat,lon:row.lon,
  food:row.formats.f_and_b.inside_hex_count,
  convenience:row.formats.cstore.inside_hex_count,
  carwash:row.formats.carwash.inside_hex_count,
  service:row.formats.lube.inside_hex_count+row.formats.vtc.inside_hex_count,
}))

const populationById=new Map(population.map((r)=>[r.id,r]))
const affluenceById=new Map(affluence.map((r)=>[r.id,r]))
const nfrById=new Map(nfr.map((r)=>[r.id,r]))
const coordinatesMatch=(a:{lat:number;lon:number},b:{lat:number;lon:number})=>Math.abs(a.lat-b.lat)<=COORD_TOL&&Math.abs(a.lon-b.lon)<=COORD_TOL
export const missingHexAssociations=traffic.reduce((count,t)=>count+Number(!populationById.has(t.id)||!affluenceById.has(t.id)),0)
export const coordinateMismatches=traffic.reduce((count,t)=>{
  const peers=[populationById.get(t.id),affluenceById.get(t.id)]
  return count+peers.reduce((n,row)=>n+Number(Boolean(row)&&!coordinatesMatch(t,row!)),0)
},0)
const trafficIds=new Set(traffic.map((row)=>row.id))
// The canonical residential test. Exported downward so the zone-level test cannot drift from it.
export const isResidentialLanduse=(value:string)=>value.toLowerCase()==="residential"
const isResidentialRow=(row:NfrMultiFormatHex)=>isResidentialLanduse(row.primary_context??row.landuse)
export const nfrValidation={
  exactly109:nfrMultiFormatHexes.length===109&&new Set(nfrMultiFormatHexes.map((row)=>row.id)).size===109,
  allIdsJoin:nfrMultiFormatHexes.every((row)=>trafficIds.has(row.id)),
  residentialOnlyAffluence:nfrMultiFormatHexes.every((row)=>isResidentialRow(row)||row.affluence_applied===false),
  neutralNonResidentialWeights:nfrMultiFormatHexes.every((row)=>isResidentialRow(row)||nfrFormatIds.every((format)=>row.formats[format].affluence_weight===1)),
  // THE REASON `primary_context` WINS, stated as a check rather than a comment: our residential
  // test must reach the same verdict the feed did when it set `affluence_applied`. This holds on
  // 109/109 rows against `primary_context` and fails on 7 against the raw `landuse` tag, so if a
  // future feed reconciles the two columns differently this fails loudly instead of letting the
  // app quietly re-tier 4 premium hexes. `affluence_applied` is optional, so rows that omit it
  // assert nothing — an absent flag is not a claim that affluence was withheld.
  affluenceMatchesFeedJudgement:nfrMultiFormatHexes.every((row)=>row.affluence_applied===undefined||row.affluence_applied===isResidentialRow(row)),
}
// Name the checks that actually failed. The message used to be fixed prose describing only the
// first three checks, so a new check's failure would have been reported as something else.
const nfrFailedChecks=Object.entries(nfrValidation).filter(([,passed])=>!passed).map(([name])=>name)
export const nfrValidationError=nfrFailedChecks.length===0?null:`NFR validation failed: ${nfrFailedChecks.join(", ")}.`

// THE ONE EMARAT COUNT. Every on-screen "Emarat stations" figure — the station-filter chip, the
// coverage box in Sources, and the "of N Emarat stations" sub-line on the insight cards — reads
// from this. Previously three call sites each ran their own `stations.filter(...)`, which happened
// to agree only because they applied the same predicate; any one of them drifting would have put
// two different totals for the same thing on the same screen.
export const EMARAT_STATIONS = stations.filter((s) => s.operator === "Emarat")
export const EMARAT_COUNT = EMARAT_STATIONS.length
export const dataStatus = {
  traffic: traffic.length, population: population.length, affluence: affluence.length,
  nfr: nfr.length, nfrFormats:nfrMultiFormatHexes.length, stations: stations.length,
  emarat: EMARAT_COUNT,
  latestTrafficRows: traffic.filter((row) => row.structural_fuel_demand !== undefined && row.traffic_demand !== undefined && row.congestion_factor !== undefined && row.observed_segment_count !== undefined && row.closed_road_km !== undefined).length,
  coordinateMismatches,
  missingHexAssociations,
}
export const stationCorridorValidation = networkStationScores.size===stations.length&&stations.every((station)=>networkStationScores.has(station.id))&&flaggedCannibalisationStationIds.size===9
export const dataValid = dataStatus.traffic === 200 && dataStatus.population === 200 && dataStatus.affluence === 200 && dataStatus.nfrFormats === 109 && dataStatus.stations === 236 && dataStatus.emarat === 66 && coordinateMismatches === 0 && missingHexAssociations === 0 && nfrValidationError===null && stationCorridorValidation

export function hav(la1:number,lo1:number,la2:number,lo2:number){const R=6371,r=Math.PI/180;const dLa=(la2-la1)*r,dLo=(lo2-lo1)*r;const a=Math.sin(dLa/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(a)))}
function pointInRing(lat:number,lon:number,ring:Position[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i], [xj,yj]=ring[j];if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside}return inside}
function pointInPolygon(lat:number,lon:number,polygon:PolygonCoordinates){if(!pointInRing(lat,lon,polygon[0]))return false;return !polygon.slice(1).some((hole)=>pointInRing(lat,lon,hole))}
export function isInsideDubai(lat:number,lon:number){const polygons=dubaiGeometry.type==="Polygon"?[dubaiGeometry.coordinates]:dubaiGeometry.coordinates;return polygons.some((polygon)=>pointInPolygon(lat,lon,polygon))}
export function hexPoly(lat:number,lon:number){const pts:[number,number][]=[],lonR=HEX_R/Math.cos(lat*Math.PI/180);for(let i=0;i<6;i++){const a=Math.PI/180*(60*i-30);pts.push([lat+HEX_R*1.02*Math.sin(a),lon+lonR*1.02*Math.cos(a)])}return pts}
// Preserve the ids and centres supplied by data prep. Filtering must never renumber them.
export function buildHexes(){return traffic.filter((r)=>isInsideDubai(r.lat,r.lon)).map(({id,lat,lon})=>({id,lat,lon}))}
export function gravity(zLat:number,zLon:number,pLat:number,pLon:number){const d=hav(zLat,zLon,pLat,pLon);return Math.exp(-(d*d)/(2*LAMBDA*LAMBDA))}
function percentile(arr:number[],p:number){const sorted=arr.slice().sort((a,b)=>a-b);if(!sorted.length)return 0;const index=(sorted.length-1)*p;const lower=Math.floor(index),upper=Math.ceil(index);return sorted[lower]+(sorted[upper]-sorted[lower])*(index-lower)}
function median(arr:number[]){return percentile(arr,0.5)||1}
// TomTom flow is a speed/delay snapshot, not a vehicle count. It may increase
// structural road exposure by at most 25%, so congestion informs the ranking
// without allowing temporary gridlock to dominate the market proxy.
export function congestionUplift(congestion:number){return 1+MAX_CONGESTION_UPLIFT*Math.min(Math.max(congestion,0)/50,1)}

function joinRawZones():Zone[]{
  // Traffic is the canonical grid. Keep its original id/lat/lon, join the
  // other four datasets by id, and apply the Dubai boundary only in makeZones.
  return traffic.map((t):Zone=>{
    const p=populationById.get(t.id)
    const a=affluenceById.get(t.id)
    const n=nfrById.get(t.id)
    const structural=t.structural_fuel_demand??t.fuel_demand
    const factor=t.congestion_factor??congestionUplift(t.congestion)
    const adjusted=t.traffic_demand??structural*factor
    return {id:t.id,lat:t.lat,lon:t.lon,fuelDemand:adjusted,structuralFuelDemand:structural,congestion:t.congestion,congestionFactor:factor,observedSegmentCount:t.observed_segment_count??0,closedRoadKm:t.closed_road_km??0,population:p?.pop??0,residents:p?.residents??0,workers:p?.workers??0,hexAreaKm2:p?.hex_area_km2??null,landuse:p?.landuse??"not stated",affluence:a?.aed_sqm??0,food:n?.food??0,convenience:n?.convenience??0,carwash:n?.carwash??0,service:n?.service??0,nfrLocal:(n?.food??0)+(n?.convenience??0)+(n?.carwash??0)+(n?.service??0),hasEmarat:0,emaratStationIds:[],stationCanRates:{},canRate:0,canRateStationId:null,fuelSupply:0,nfrSupply:0,nfrDemand:0,fuelLQ:null,nfrLQ:0,live:false}
  })
}
export const rawZones=joinRawZones()
export const FUEL_CORRIDOR=percentile(rawZones.filter((z)=>isInsideDubai(z.lat,z.lon)).map((z)=>z.fuelDemand),0.6)
export let fuelShareNorm=0
export let nfrShareNorm=0
export let fuelDemandFloor=0
function makeZones():Zone[]{
  const result=rawZones.filter((z)=>isInsideDubai(z.lat,z.lon)).map((z)=>({...z,live:z.population>=POP_MIN||z.fuelDemand>=FUEL_CORRIDOR}))
  for(const z of result){z.fuelSupply=stations.reduce((sum,s)=>sum+gravity(z.lat,z.lon,s.lat,s.lon),0);z.nfrSupply=result.reduce((sum,o)=>sum+o.nfrLocal*gravity(z.lat,z.lon,o.lat,o.lon),0);z.nfrDemand=z.population*(z.affluence||1)}
  // Textbook (Isard) location quotient: an area's SHARE of provision divided by its SHARE of
  // demand. Equivalently (supply/demand) x (sum demand / sum supply), so the study-area norm is
  // exactly 1.0 by construction. Fuel aggregates over observed-traffic hexes only, because a hex
  // with no traffic observation has no readable demand share and is excluded (fuelLQ = null)
  // rather than contributing a zero to the denominator.
  const live=result.filter((z)=>z.live)
  fuelDemandFloor=percentile(live.filter((z)=>z.fuelDemand>0).map((z)=>z.fuelDemand),DEMAND_FLOOR_PCTL)
  const fuelObserved=live.filter((z)=>z.fuelDemand>=fuelDemandFloor&&z.fuelDemand>0)
  const sumFS=fuelObserved.reduce((a,z)=>a+z.fuelSupply,0)
  const sumFD=fuelObserved.reduce((a,z)=>a+z.fuelDemand,0)
  const sumNS=live.reduce((a,z)=>a+z.nfrSupply,0)
  const sumND=live.reduce((a,z)=>a+z.nfrDemand,0)
  const fuelNorm=sumFD/Math.max(sumFS,1e-6)
  const nfrNorm=sumND/Math.max(sumNS,1e-6)
  fuelShareNorm=fuelNorm
  nfrShareNorm=nfrNorm
  for(const z of result){z.fuelLQ=z.live&&z.fuelDemand>=fuelDemandFloor&&z.fuelDemand>0?(z.fuelSupply/Math.max(z.fuelDemand,1e-6))*fuelNorm:null;z.nfrLQ=z.live?(z.nfrSupply/Math.max(z.nfrDemand,1e-6))*nfrNorm:0}
  return result
}
export const zones=makeZones()
export const zoneById=new Map(zones.map((z)=>[z.id,z]))

// ---- Derived thresholds -------------------------------------------------------------------
// 1.0 is the FIXED anchor: it is the definition of a fair share and must never move. Only the
// BAND WIDTH is derived, in log space, so the band is multiplicatively symmetric — "40% more
// provision than fair share" and "40% less" sit the same distance from 1.0, which a linear
// band cannot do. Spread uses the MAD of ln(LQ) about ln(1)=0, which is robust: a few extreme
// hexes cannot widen it the way a standard deviation would.
const readableLQs=zones.filter((z)=>z.fuelLQ!==null).map((z)=>z.fuelLQ as number)
export const LQ_WINSOR_LO=percentile(readableLQs,WINSOR_LO)
export const LQ_WINSOR_HI=percentile(readableLQs,WINSOR_HI)
export function winsorizeLQ(v:number){return Math.min(Math.max(v,LQ_WINSOR_LO),LQ_WINSOR_HI)}
const lnAbs=readableLQs.map((v)=>Math.abs(Math.log(winsorizeLQ(v))))
export const LQ_SPREAD=1.4826*median(lnAbs)
export const BAND_MULTIPLIER_DEFAULT=1
export function deriveThresholds(multiplier=BAND_MULTIPLIER_DEFAULT){
  const t=LQ_SPREAD*multiplier
  return {lower:Math.exp(-t),upper:Math.exp(t)}
}
export const DERIVED=deriveThresholds()
export const DERIVED_LOWER=DERIVED.lower
export const DERIVED_UPPER=DERIVED.upper
// The app's starting thresholds ARE the derived ones, so the Sources claim that defaults come
// from the study area's own distribution is true by construction rather than by assertion.
export const DEFAULT_LOWER=DERIVED_LOWER
export const DEFAULT_UPPER=DERIVED_UPPER
export const analyticalStatus={rawJoined:rawZones.length,dubaiZones:zones.length,live:zones.filter((z)=>z.live).length,nonLive:zones.filter((z)=>!z.live).length}
export const affluenceMedian=median(zones.map((z)=>z.affluence).filter(Boolean))
export const populationMedian=median(zones.map((z)=>z.population))

export function stationZone(station:Station){
  if(!isInsideDubai(station.lat,station.lon))return null
  let best:Zone|null=null,bd=Infinity
  for(const zone of zones){const d=hav(station.lat,station.lon,zone.lat,zone.lon);if(d<bd){bd=d;best=zone}}
  return best&&bd<=MAX_HEX_ASSOCIATION_KM?best:null
}

export function huffSplit(cLat:number,cLon:number,excludeStationId?:string):HuffResult{
  const baseline=excludeStationId?stations.filter((station)=>station.id!==excludeStationId):stations
  let fromEmarat=0,fromComp=0,newly=0,captured=0
  for(const zone of zones){
    const demand=zone.fuelDemand
    if(!zone.live||!(demand>0))continue
    const incumbent=baseline.map((station)=>({station,attraction:gravity(zone.lat,zone.lon,station.lat,station.lon)}))
    const sum=incumbent.reduce((total,item)=>total+item.attraction,0)
    const before=U0+sum
    const candidateAttraction=gravity(zone.lat,zone.lon,cLat,cLon)
    const after=before+candidateAttraction
    captured+=demand*candidateAttraction/after
    newly+=demand*(U0/before-U0/after)
    for(const item of incumbent){
      const displaced=demand*(item.attraction/before-item.attraction/after)
      if(item.station.operator==="Emarat")fromEmarat+=displaced
      else fromComp+=displaced
    }
  }
  return{captured,fromEmarat,fromComp,newly,canRate:captured>0?fromEmarat/captured:0,excludeStationId,baselineStationCount:baseline.length,method:"euclidean-preview",tauMinutes:2.5,attractivenessAssumption:"Equal attractiveness (A=1); refine with site data."}
}

export const stationHuffResults = new Map<string,HuffResult>()
for(const station of stations.filter((item)=>item.operator==="Emarat")){
  const zone=stationZone(station)
  const network=networkStationScores.get(station.id)
  // Existing stations use the directed-road removal/transfer result. The
  // straight-line Huff function remains only for a genuinely new click-to-place
  // candidate, for which no precomputed network route exists yet.
  const result: HuffResult=network?{
    captured:network.captured_demand_index,
    fromEmarat:network.transfer_to_emarat,
    fromComp:network.transfer_to_competitors,
    newly:network.transfer_to_outside,
    canRate:network.emarat_cannibalisation_rate??0,
    excludeStationId:station.id,
    baselineStationCount:stations.length-1,
    method:"directional-network",
    tauMinutes:network.time_decay_tau_minutes??2.5,
    attractivenessAssumption:network.attractiveness_assumption??"Equal attractiveness (A=1); refine with site data.",
    topPartnerName:network.top_emarat_partner_name,
    topPartnerLossRate:network.top_partner_loss_rate??0,
  }:huffSplit(station.lat,station.lon,station.id)
  stationHuffResults.set(station.id,result)
  if(!zone)continue
  zone.emaratStationIds.push(station.id)
  zone.stationCanRates[station.id]=result.canRate
}
for(const zone of zones){
  zone.hasEmarat=zone.emaratStationIds.length
  for(const stationId of zone.emaratStationIds){const rate=zone.stationCanRates[stationId];if(rate>zone.canRate){zone.canRate=rate;zone.canRateStationId=stationId}}
}

export type ClassKey="none"|"over"|"bal"|"nfr"|"fuel"|"dual"
// Classification and shading both run on the WINSORIZED value in LOG space, so an extreme hex
// can neither change its own class nor flatten the ramp for everyone else. Magnitude is scaled
// by the derived spread, so shading stays meaningful when the thresholds move.
export function classifyLQ(f:number,n:number,upper=DEFAULT_UPPER,lower=DEFAULT_LOWER,live=true){
  if(!live)return{cls:"none" as const,mag:0}
  const fw=winsorizeLQ(f),nw=winsorizeLQ(n)
  let cls:Exclude<ClassKey,"none">
  if(fw>upper)cls="over";else if(fw<lower)cls=nw<lower?"dual":"fuel";else cls=nw<lower?"nfr":"bal"
  const lg=cls==="over"?Math.log(fw):cls==="fuel"?-Math.log(fw):cls==="nfr"?-Math.log(nw):cls==="dual"?Math.max(-Math.log(fw),-Math.log(nw)):0
  const scale=Math.max(LQ_SPREAD*2,1e-6)
  return{cls,mag:Math.min(1,Math.abs(lg)/scale)}
}
export function fuelAction(z:Zone,upper=DEFAULT_UPPER,lower=DEFAULT_LOWER){if(!z.live)return"No material demand";if(z.fuelLQ===null)return"Insufficient traffic observation";const f=winsorizeLQ(z.fuelLQ);if(f>upper)return"Relocate / Divest";if(f<lower)return"Add fuel capacity";return"Retain"}
// ---- The action map ------------------------------------------------------------------------
// SIX NAMED OUTCOMES, NO LETTERS. A/B/C/D carried no meaning a reader could recover without the
// legend, and the letters had already drifted out of order (B was listed first because it matters
// most). The key IS the recommendation, so nothing has to be decoded.
export type ActionKey="integrate"|"grow"|"fuel"|"consolidate"|"watch"|"retain"
// A tier is a RETAIL grade, so only the two retail-led actions can carry one. Typing it as
// `ActionTier|null` makes "this action has no retail grade" structural rather than a convention:
// `fuel`/`consolidate`/`watch`/`retain` cannot accidentally be shaded by buying power.
export type ActionTier=NfrValueTier
export const ACTION_TIERED={integrate:true,grow:true,fuel:false,consolidate:false,watch:false,retain:false} as const satisfies Record<ActionKey,boolean>
// EVERY PER-VERDICT WORDING LIVES HERE. category() reads `sow`/`action` off this table rather than
// carrying its own string literals, so the tooltip and the click panel are physically incapable of
// naming the same outcome differently. A hand-kept table had already drifted once through a rename.
//
// The `legend` field is GONE from here. The legend and the cards are now keyed by DISPLAY GROUP (see
// ACTION_GROUP below), because two verdicts share a row; a per-verdict legend label would have sat
// here unread, free to contradict the row actually drawn.
export const ACTION_META={
  integrate:{sow:"Integrate new site",action:"Integrate a new fuel and retail site"},
  grow:{sow:"Grow / add retail",action:"Grow this site: add retail, and fuel where short"},
  fuel:{sow:"Add or relocate fuel",action:"Add or relocate fuel here"},
  consolidate:{sow:"Consolidate / relocate",action:"Consolidate or relocate this site"},
  watch:{sow:"Watch — no site here",action:"Watch — crowded already, and no Emarat site here to act on"},
  retain:{sow:"Retain",action:"Retain — nothing recommended"},
} as const satisfies Record<ActionKey,{sow:string;action:string}>
export type ActionVerdict={
  key:ActionKey; tier:ActionTier|null; action:string; sow:string; cause:string
  trace:{fuel:string;nfr:string}
}
export function category(z:Zone,canRateForSite=z.canRate,upper=DEFAULT_UPPER,lower=DEFAULT_LOWER,nfrLower=NFR_DEFAULT_LOWER):ActionVerdict|null{
  if(!z.live||z.fuelLQ===null)return null
  const fw=winsorizeLQ(z.fuelLQ)
  // ONE DEFINITION OF "RETAIL SHORT", shared with the Non-fuel tab. This used to be its own test
  // (`nfrLQ < fuel lower threshold`, gated on `nfrLocal>0`), which meant the two tabs could call the
  // same hex short and not-short: the fuel threshold was being applied to a retail ratio, and a
  // measured zero-supply shortfall — a real gap with no retail nearby at all — read as "not short".
  // `measuredGapCount>0` is exactly the wall the Non-fuel tab uses to call an area an opportunity,
  // and it already implies the format survey reached here and found material demand.
  const retailShort=measuredGapCount(z,nfrLower)>0
  const fuelOver=fw>upper,fuelUnder=fw<lower,em=z.hasEmarat>0
  // THE SPINE IS "THIS HEX HAS A FUEL REASON FOR A STATION", NOT "FUEL MUST BE SHORT" — and what
  // supplies that reason depends on whether a forecourt already exists:
  //   integrate → a fuel GAP, because no site exists and only a fuel case can justify building one
  //   grow      → the SITE ITSELF, which already sits on material fuel demand and earns its place
  // So retail can add retail to a station that already stands, but retail alone can never conjure a
  // new site: `!em && retailShort && !fuelUnder` falls through to `retain` and stays a Non-fuel-tab
  // finding. Rule order is load-bearing; each rule still states its own precondition rather than
  // leaning on the rule above it.
  const tier=nfrValueTier(z)
  // `tier` is passed ONLY on the two retail-led rules, which is what makes ACTION_TIERED true of the
  // data and not just of the table.
  const of=(key:ActionKey,rest:{tier:ActionTier|null;cause:string;trace:{fuel:string;nfr:string}}):ActionVerdict=>({key,sow:ACTION_META[key].sow,action:ACTION_META[key].action,...rest})
  if(em&&(fuelOver||canRateForSite>0.5))return of("consolidate",{tier:null,cause:fuelOver?"oversaturation":"cannibalization",trace:{fuel:fuelOver?"oversaturated":"cannibalization > 50%",nfr:retailShort?"short":"ok"}})
  if(fuelOver&&!em)return of("watch",{tier:null,cause:"no-asset",trace:{fuel:"oversaturated",nfr:retailShort?"short":"ok"}})
  if(!em&&fuelUnder&&retailShort)return of("integrate",{tier,cause:"dual-gap",trace:{fuel:"white-space",nfr:"short"}})
  // Admits the fuel-adequate site as well as the fuel-under one, which is why the finding has to say
  // "adequate, or short and worth adding" rather than asserting either.
  if(em&&!fuelOver&&retailShort)return of("grow",{tier,cause:"nfr-gap",trace:{fuel:fuelUnder?"short":"ok",nfr:"short"}})
  if(fuelUnder&&!retailShort)return of("fuel",{tier:null,cause:"fuel-gap",trace:{fuel:"short",nfr:"ok"}})
  return of("retain",{tier:null,cause:"none",trace:{fuel:"ok",nfr:retailShort?"short":"ok"}})
}
// Watch and retain are OUTCOMES, not actions. Kept separate because they rest on different findings:
// retain means both reads are fine, watch means the area is crowded and we have no asset there to
// act on — collapsing them would report an unactionable market as a healthy one.
export const ACTIONABLE_KEYS=["integrate","grow","fuel","consolidate"] as const
// Display order: what to do first, then the two outcomes with nothing to do. NOT the order the rules
// are evaluated in — the rule order is about precedence, this one is about priority to a reader.
export const ACTION_KEYS=["integrate","grow","fuel","consolidate","watch","retain"] as const satisfies readonly ActionKey[]

// ---- DISPLAY GROUPS: what the legend and the cards enumerate -----------------------------------
// PRESENTATION ONLY. `consolidate` and `watch` remain two DIFFERENT VERDICTS and nothing below
// changes that: category() still returns them separately, ACTIONABLE_KEYS still counts only the
// first, the tooltip still names each by its own `sow`, and the click panel still says which of the
// two a hex is. They share one legend swatch and one card because they rest on the SAME finding —
// this area already has more reachable fuel provision than its share of demand — and one row per
// finding is what keeps the legend short enough to read over a map.
//
// Consequence worth stating: the shared row therefore mixes an actionable verdict (we have a site to
// consolidate) with an unactionable one (we have no site here), so the card's own explanation has to
// print that split. A merged row whose card did not would report an untouchable market as a project.
export type ActionGroupKey="integrate"|"grow"|"fuel"|"overserved"|"retain"
export const ACTION_GROUP={
  integrate:"integrate",grow:"grow",fuel:"fuel",consolidate:"overserved",watch:"overserved",retain:"retain",
} as const satisfies Record<ActionKey,ActionGroupKey>
// Display order: the three things to build first, then the finding with nothing to build, then the
// healthy outcome. NOT the order category() evaluates its rules in — that order is about precedence.
export const ACTION_GROUP_KEYS=["integrate","grow","fuel","overserved","retain"] as const satisfies readonly ActionGroupKey[]
// ONE TABLE FOR THE LEGEND ROW AND ITS CARD, so a swatch cannot be labelled one thing while the card
// counting the same hexes is labelled another — the exact drift the old per-verdict `legend` field
// allowed. `subject` is the full phrase that follows the count in the card headline, held in both
// numbers because "1 areas" is a bug a reader notices immediately; the two outcome groups are
// deliberately label-shaped ("6 over-served / potential cannibalization") rather than carrying a
// noun, matching the agreed headline wording.
// `tiered` is true of exactly the two retail-led actions, which are the only ones category() ever
// puts a tier on — so a card can only grow tier chips where a tier actually exists.
export const ACTION_GROUP_META={
  integrate:{legend:"Integrate new site (fuel + retail)",subject:{one:"area to integrate a new site (fuel + retail)",many:"areas to integrate a new site (fuel + retail)"},tiered:true},
  grow:{legend:"Grow (add retail to an existing station)",subject:{one:"area to grow (add retail to an existing station)",many:"areas to grow (add retail to an existing station)"},tiered:true},
  fuel:{legend:"Add or relocate fuel",subject:{one:"area to add or relocate fuel",many:"areas to add or relocate fuel"},tiered:false},
  overserved:{legend:"Over-served / potential cannibalization",subject:{one:"over-served / potential cannibalization",many:"over-served / potential cannibalization"},tiered:false},
  retain:{legend:"Retain",subject:{one:"retain",many:"retain"},tiered:false},
} as const satisfies Record<ActionGroupKey,{legend:string;subject:{one:string;many:string};tiered:boolean}>
export function breakpoint(dab:number,Aa=1,Ab=1){return dab/(1+Math.sqrt((Ab||1)/(Aa||1)))}
export function nearestStation(point:Pick<Zone,"lat"|"lon">,excludeStationId?:string){const eligible=excludeStationId?stations.filter((station)=>station.id!==excludeStationId):stations;return eligible.reduce((best,station)=>hav(point.lat,point.lon,station.lat,station.lon)<hav(point.lat,point.lon,best.lat,best.lon)?station:best,eligible[0])}
// ---- Effective population and density -----------------------------------------------------
// ONE definition, used by both the map tooltip and the detail panel. These four figures are
// read from effective_pop_per_hex.json via the zone, NOT from the population/residents/
// workers/population_density_per_km2 fields carried by nfr_multiformat_2sfca_per_hex.json:
// those were baked from the earlier edge-inflated raster sum and are not recomputed here.
// Density is derived at render time from the cell area STATED IN THE FILE, so correcting the
// area (13.34 -> ~11.6 km2) moves every density with no edit here.
export function populationDensity(z:Zone):number|null{
  if(!z.hexAreaKm2||z.hexAreaKm2<=0)return null
  return z.population/z.hexAreaKm2
}
export function densityLabel(z:Zone):string{
  const d=populationDensity(z)
  if(d===null)return "Not stated — cell area unavailable"
  return `${Math.round(d).toLocaleString()} / km²`
}
export function hexAreaLabel(z:Zone):string|null{
  return z.hexAreaKm2?`hex ≈ ${z.hexAreaKm2.toFixed(1)} km²`:null
}

// ---- Area archetypes and format library ---------------------------------------------------
// EVERYTHING here is DERIVED from the live zones at call time. No archetype and no chosen
// format is ever stored on a zone, so reloading effective_pop_per_hex.json with different
// land-use tags, or moving a threshold, re-labels and re-counts with no other edit. The only
// place wording lives is FORMATS / ARCHETYPE_LABEL.
export type Archetype="low-residential"|"mid-residential"|"affluent-residential"|"commercial"|"mixed"|"industrial"|"highway"|"unclassified"
export type NfrAreaFilter="all"|Archetype

// ONE resolved land use for every surface. `primary_context` is the pipeline's RECONCILED
// judgement and is the field the feed itself used to set `affluence_applied` (it agrees with that
// flag on 109/109 rows, where the raw tag disagrees on 7 — see `affluenceMatchesFeedJudgement`).
// `landuse` is the raw dominant-polygon tag, already treated as unreliable elsewhere in this file,
// so it survives only as a fallback for hexes with no NFR row. For 7 hexes the two disagree about
// residential-ness (6 tagged "mixed" but contexted "residential", with a tier already priced in
// the feed; hex 21 is the reverse) — reading a different column in each place is what let one hex
// report "non-residential" in its header, "residential" in its stats and "mid" in its suggestions
// at the same time.
export function resolvedLanduse(z:Zone):string{return (nfrMultiFormatById.get(z.id)?.primary_context??z.landuse).toLowerCase()}
// ONE definition of "is this residential", shared with `isResidentialRow` above. Two spellings of
// the same test (exact `===` on the row, substring `/residential/` on the zone) agreed only by
// luck of the current vocabulary — a future value like "residential-mixed" would have split them
// apart again, which is the same duplication that caused the bug this precedence fixes.
const isResidentialZone=(z:Zone)=>isResidentialLanduse(resolvedLanduse(z))

// Affluence is applied ONLY within residential land use. Thresholds are
// residential terciles, so industrial/commercial property values cannot shift
// or inherit a residential income label. The terciles are drawn over the SAME resolved set they
// classify, or the cut points would describe a different population from the one being labelled.
const residentialAffluence=zones.filter((z)=>z.live&&isResidentialZone(z)&&z.affluence>0).map((z)=>z.affluence)
export const affLow=percentile(residentialAffluence,1/3)
export const affHigh=percentile(residentialAffluence,2/3)
export function residentialAffluenceTier(z:Zone):"low"|"mid"|"premium"|null{
  if(!isResidentialZone(z))return null
  if(z.affluence<affLow)return"low"
  if(z.affluence>=affHigh)return"premium"
  return"mid"
}

// The land-use vocabulary actually present in the file is checked, not assumed: the current
// tags are residential / industrial / commercial / retail — there is no "mixed" tag, and
// "retail" is not in the brief's list. "retail" maps to the commercial / high-street
// archetype (the same format family), while the mixed branches stay live for a future tag set.
// Anything unrecognised becomes "unclassified" and gets NO invented format: letting an unknown
// tag fall through to the residential catch-all would print a confident recommendation for an
// area whose land use was never established.
const KNOWN_LANDUSE=["residential","industrial","commercial","retail","mixed","transport","transit","highway","unclassified"] as const
// The vocabulary is of the RESOLVED tag, because that is what `archetype` reads. Watching the raw
// column would let an unrecognised `primary_context` fall through to "unclassified" unreported.
export const landuseVocabulary=[...new Set(zones.filter((z)=>z.live).map((z)=>resolvedLanduse(z)))].sort()
export const unrecognisedLanduse=landuseVocabulary.filter((tag)=>!KNOWN_LANDUSE.some((k)=>tag.includes(k))&&!/logistics/.test(tag))

export function archetype(z:Zone):Archetype{
  const land=resolvedLanduse(z)
  if(/industrial|logistics/.test(land))return"industrial"
  if(/commercial|retail/.test(land))return"commercial"
  if(/mixed/.test(land))return"mixed"
  if(/highway|transit|transport/.test(land))return"highway"
  // Highway is tested BEFORE residential so a transit corridor with few homes but heavy
  // throughput cannot masquerade as housing.
  if(z.population<POP_MIN&&z.fuelDemand>=FUEL_CORRIDOR)return"highway"
  if(/residential/.test(land)){
    const tier=residentialAffluenceTier(z)
    return tier==="premium"?"affluent-residential":tier==="low"?"low-residential":"mid-residential"
  }
  return"unclassified"
}

export type GapType="both"|"retail"|"fuel"|"none"
export function gapType(z:Zone,lower=DEFAULT_LOWER):GapType{
  // A gated fuel reading is an ABSENCE, not a shortfall: an area with no readable fuel LQ
  // cannot be called short on pumps.
  const fuelShort=z.fuelLQ!==null&&winsorizeLQ(z.fuelLQ)<lower
  const nfrShort=winsorizeLQ(z.nfrLQ)<lower
  return fuelShort&&nfrShort?"both":nfrShort?"retail":fuelShort?"fuel":"none"
}

export const FORMATS:Record<Archetype,string[]>={
  "low-residential":["value C-Store","value Bakeria","Car Wash","essential services"],
  "affluent-residential":["premium C-Store","Bakeria (artisan bakery + coffee)","premium Car Wash & detailing","pharmacy / specialty Shop Rentals"],
  "mid-residential":["C-Store","Car Wash","LubeX","value Bakeria"],
  "commercial":["grab-and-go C-Store","Bakeria / coffee","F&B Shop Rentals"],
  "mixed":["C-Store","Bakeria / food","Car Wash","Shop Rentals"],
  "industrial":["LubeX","VTC (vehicle testing)","tyre & quick service","large basic C-Store","workers' cafeteria"],
  "highway":["C-Store","fast-food / F&B Shop Rentals","quick services (air, wash)"],
  unclassified:[],
}
// THE ONE LOCATION VOCABULARY. Every surface that names where a hex is — the non-fuel sticker's
// kicker, the action-map chips, the click panel — reads this table, so no tab can invent its own
// wording for the same eight land uses. Sentence case, because these are now read as LABELS in
// their own right (a chip, a title line) rather than spliced into a lower-case sentence.
//
// The affluence band is NO LONGER BAKED INTO THE RESIDENTIAL LABELS. "premium residential · high
// affluence" carried the band twice over once the kicker also printed the AED/sqm figure, and it
// pushed a value judgement into what is meant to be a statement of land use.
export const ARCHETYPE_LABEL:Record<Archetype,string>={
  "affluent-residential":"Affluent neighbourhood",
  "mid-residential":"Mid-affluent neighbourhood",
  "low-residential":"Lower-affluence neighbourhood",
  commercial:"Commercial / high street",
  mixed:"Mixed-use",
  industrial:"Industrial",
  highway:"Highway / transit",
  // NOT "unclassified" as a word the reader sees: the source data declined to state a land use, and
  // "profile not established" says that, where a bare "unclassified" reads like a category of place.
  unclassified:"Profile not established",
}
// Fixed display order for every list of archetypes, so the action-map chips and any future breakdown
// enumerate them the same way. Residential runs affluent → lower, then the non-residential uses, and
// the unestablished profile sits last because it is an absence rather than a kind of area.
export const ARCHETYPE_ORDER=[
  "affluent-residential","mid-residential","low-residential",
  "commercial","mixed","highway","industrial","unclassified",
] as const satisfies readonly Archetype[]
// AFFLUENCE IS A RESIDENTIAL SIGNAL, stated once here. The feed only applies an affluence weight to
// residential rows (`residentialOnlyAffluence`), so an AED/sqm figure beside "Industrial" would be
// quoting a number the pipeline deliberately withheld. Every surface that prints the figure gates on
// this, rather than each one re-deciding what counts as residential.
export const RESIDENTIAL_ARCHETYPES=["affluent-residential","mid-residential","low-residential"] as const satisfies readonly Archetype[]
export const isResidentialArchetype=(value:Archetype)=>(RESIDENTIAL_ARCHETYPES as readonly Archetype[]).includes(value)
// One sentence per archetype, for chip hover text and screen readers. These describe the AREA, not a
// buying-power grade: the old tier notes ("highest retail buying power") ranked areas against each
// other, which is the judgement this relabel removes from the chips.
export const ARCHETYPE_NOTE:Record<Archetype,string>={
  "affluent-residential":"Housing with the highest affluence reading in the study area.",
  "mid-residential":"Housing with a mid affluence reading.",
  "low-residential":"Housing with a lower affluence reading.",
  commercial:"Shops, offices and high-street frontage rather than housing.",
  mixed:"Housing and commercial frontage together in the same area.",
  highway:"A transit corridor: heavy through traffic, few homes.",
  industrial:"Industrial and logistics land, with worker rather than resident demand.",
  unclassified:"The source data does not establish a land use here, so the area is not profiled.",
}

export function recommendFormat(z:Zone,lower=DEFAULT_LOWER){
  if(!z.live)return"None — no material demand."
  if(winsorizeLQ(z.nfrLQ)>=lower)return"No non-fuel intervention — provision is at or above this area's share of demand."
  const arch=archetype(z)
  if(!FORMATS[arch].length)return"No format recommendation — this area's land use is not established in the source data."
  return FORMATS[arch].join(", ")
}

// ---- Non-fuel opportunity model -----------------------------------------------------------
// The non-fuel map colours by MEASURED SHORTFALL: whether any of an area's measured non-fuel formats
// is below its share of demand, and how many. Buying power is no longer part of that colour — it is
// computed here as `nfrValueTier` and used to pick the retail suggestions, but it does not decide what
// the tab paints or says. Everything is derived in this one place so the map, the cards and the hex
// panel cannot disagree about any hex.

// gapCount counts ONLY formats whose supply was observed and measured through the 2SFCA
// accessibility index. Bakeria / LubeX / VTC are ARCHETYPE SUGGESTIONS: they appear in the
// panel labelled as such, but they never move a colour, because counting an unmeasured format
// would let an area look badly short on provision nobody ever looked for.
export const MEASURED_NFR_FORMATS=["f_and_b","cstore","carwash"] as const
export type MeasuredNfrFormat=(typeof MEASURED_NFR_FORMATS)[number]
// Short names for the ONE place a list of short formats has to fit on a single line: the non-fuel
// sticker's title ("F&B + C-Store short"). The long names live in the panel's own format options; a
// title reading "Restaurants / F&B + C-Store / convenience short" would wrap to three lines.
export const MEASURED_NFR_SHORT_LABEL:Record<MeasuredNfrFormat,string>={f_and_b:"F&B",cstore:"C-Store",carwash:"Car wash"}
export const isMeasuredNfrFormat=(format:NfrFormatId):format is MeasuredNfrFormat=>(MEASURED_NFR_FORMATS as readonly NfrFormatId[]).includes(format)
export const SUGGESTED_NFR_FORMATS=nfrFormatIds.filter((format)=>!isMeasuredNfrFormat(format))
// The non-fuel tab's own band. Exported so the sliders, their reset values and these buckets
// all read one definition instead of three copies of 0.80.
export const NFR_DEFAULT_LOWER=0.80
export const NFR_DEFAULT_UPPER=1.20

export type NfrValueTier="premium"|"mid"|"functional"|"profile-unknown"
// "no-material-demand" is its own bucket rather than folding into either neighbour. Folding it
// into "not-observed" would repeat the bug being fixed here (a completed survey reported as a
// blank); folding it into "served" would claim provision is adequate when in truth nothing is
// needed. Both are false in different directions.
//
// THE OPPORTUNITY BUCKET IS NO LONGER THE VALUE TIER. It used to be spelled `|NfrValueTier`, which
// made "is there a shortfall here" and "how much buying power does this area carry" the SAME
// question: the bucket set the colour, the legend, the cards and the sticker title, so a shortfall
// could not be reported without also grading the area premium / mid / functional. Those are two
// different claims resting on two different pieces of evidence — the shortfall is measured through
// the 2SFCA accessibility index, the grade is inferred from land use and affluence — so they are now
// separate. `nfrValueTier` still exists and is still asserted, it simply no longer decides what the
// non-fuel tab paints or says.
export type NfrOppBucket="not-observed"|"no-material-demand"|"served"|"opportunity"

// A MEASURED ZERO IS NOT AN ABSENT READING. The old test required something to be seen within
// reach before a shortfall could be claimed, which threw away the strongest evidence there is: a
// hex the survey DID cover, with real demand, and nothing built. That rule mislabelled 65 of the
// 327 measured cells as "not observed" when the pipeline itself had already classified them "gap".
//
// Coverage and supply are now separate questions:
//   unsurveyed          — the 2SFCA pass never ran here, so nothing can be claimed either way
//   no-material-demand  — it ran, and demand is too small to matter; a finding, not a blank
//   measured            — it ran and demand is material, so the index is a real reading
export type NfrFormatState="unsurveyed"|"no-material-demand"|"measured"
// Did the format's catchment survey reach this hex? In THIS feed coverage is per-hex: all 327
// measured cells carry a finite `accessibility_2sfca` and `catchment_lambda_km`, so a hex is
// either fully surveyed or absent from the feed altogether. The signature stays per-format so a
// future feed that varies coverage by format needs no call-site change.
export function hexInFormatSurveyArea(z:Zone,format:NfrFormatId):boolean{
  const cell=nfrMultiFormatById.get(z.id)?.formats[format]
  if(!cell)return false
  return Number.isFinite(cell.accessibility_2sfca)&&Number.isFinite(cell.catchment_lambda_km)
}
export function nfrFormatState(z:Zone,format:NfrFormatId):NfrFormatState{
  if(!hexInFormatSurveyArea(z,format))return"unsurveyed"
  return nfrMultiFormatById.get(z.id)!.formats[format].material_demand?"measured":"no-material-demand"
}
// Measured = surveyed AND demand material. Deliberately says NOTHING about how much supply was
// found, so a zero-supply hex stays eligible to be the clearest gap on the map.
export const nfrMeasured=(z:Zone,format:NfrFormatId)=>nfrFormatState(z,format)==="measured"
// Supply is reported separately from coverage, for the counts on the card.
export function nfrSupplyCount(z:Zone,format:NfrFormatId):number{
  const cell=nfrMultiFormatById.get(z.id)?.formats[format]
  return cell?cell.inside_hex_count+cell.nearby_count_within_lambda:0
}
export function nfrAccessibilityIndex(z:Zone,format:NfrFormatId):number|null{
  const row=nfrMultiFormatById.get(z.id)
  if(!row)return null
  return row.formats[format].accessibility_index
}
export function nfrMeasuredFormats(z:Zone):MeasuredNfrFormat[]{
  return MEASURED_NFR_FORMATS.filter((format)=>nfrMeasured(z,format))
}
export function anyMeasuredFormat(z:Zone):boolean{return nfrMeasuredFormats(z).length>0}
export function anyFormatSurveyed(z:Zone):boolean{return MEASURED_NFR_FORMATS.some((format)=>hexInFormatSurveyArea(z,format))}
// A MEASURED ZERO OUTRANKS ITS OWN INDEX. Ten cells carry material demand, nothing inside the hex,
// nothing within lambda — and an index as high as 2.11, which the feed then labels "balanced" or
// even "over_served". An index cannot claim good access to supply the catchment could not find, so
// a surveyed zero is short whatever the ratio says. Without this, hex 105's car wash read "Well
// served" next to "0 here · 0 nearby": a verdict resting on nothing, the same defect as judging an
// unmeasured hex. This is the ONE place the app knowingly departs from the feed's own
// `classification`, and the departure set is asserted below to be exactly the zero-supply cells.
export function nfrZeroSupplyShortfall(z:Zone,format:NfrFormatId):boolean{
  return nfrMeasured(z,format)&&nfrSupplyCount(z,format)===0
}
export function measuredGapFormats(z:Zone,lower=NFR_DEFAULT_LOWER):MeasuredNfrFormat[]{
  return nfrMeasuredFormats(z).filter((format)=>nfrZeroSupplyShortfall(z,format)||(nfrAccessibilityIndex(z,format)??Infinity)<lower)
}
export function measuredGapCount(z:Zone,lower=NFR_DEFAULT_LOWER):number{return measuredGapFormats(z,lower).length}

// Tiers REUSE the archetype, so the colour, the profile card and the location-profile chips are
// all the same judgement. "unclassified" gets its own tier rather than folding into functional:
// 16 live hexes have no established land use, and filing them under "industrial / lower-margin"
// would invent the very profile the source data declined to state.
const TIER_BY_ARCHETYPE:Record<Archetype,NfrValueTier>={
  "affluent-residential":"premium",
  "mid-residential":"mid",commercial:"mid",mixed:"mid",
  "low-residential":"functional",industrial:"functional",highway:"functional",
  unclassified:"profile-unknown",
}
export function nfrValueTier(z:Zone):NfrValueTier{return TIER_BY_ARCHETYPE[archetype(z)]}

// Ordered, first match wins, so every live hex lands in exactly one bucket.
export function nfrOppBucket(z:Zone,lower=NFR_DEFAULT_LOWER):NfrOppBucket{
  // "not-observed" now means ONLY that the survey did not reach here.
  if(!z.live||!anyFormatSurveyed(z))return"not-observed"
  if(!anyMeasuredFormat(z))return"no-material-demand"
  if(measuredGapCount(z,lower)===0)return"served"
  return"opportunity"
}
// The four value tiers, kept for the SUGGESTION WORDING only (see `suggestionsFor`). This is no
// longer a bucket order, because the tier is no longer a bucket.
export const NFR_VALUE_TIERS=["premium","mid","functional","profile-unknown"] as const satisfies readonly NfrValueTier[]
// One wording source for every surface. Served and not-observed are BOTH grey but are different
// claims, so their notes are written to be impossible to confuse.
export const NFR_BUCKET_LABEL:Record<NfrOppBucket,string>={
  opportunity:"Retail opportunity",
  served:"Already served — not of interest","no-material-demand":"No material demand for these formats",
  "not-observed":"Survey did not reach this area",
}
export const NFR_BUCKET_NOTE:Record<NfrOppBucket,string>={
  // States WHAT WAS MEASURED and nothing more. The four tier notes this replaces each graded the
  // area's buying power ("High buying power: premium residential affluence"), which is a claim about
  // the area rather than about the shortfall the bucket actually counts.
  opportunity:"At least one measured format here sits below this area's share of demand.",
  served:"Every measured format with real demand here is at or above the area's share.",
  "no-material-demand":"The catchment survey covered this area and found demand for all three measured formats too small to matter. That is a finding, not a gap in the evidence.",
  "not-observed":"No measured format's catchment survey reached this area, so nothing can be claimed here either way.",
}
export function nfrOpportunityZones(bucket:NfrOppBucket,lower=NFR_DEFAULT_LOWER):Zone[]{
  return zones.filter((z)=>z.live&&nfrOppBucket(z,lower)===bucket)
}
// ONE HUE, DEPTH CARRIES THE GAP COUNT. There were four ramps here, one per value tier, so the
// non-fuel map spent its whole colour channel on buying power and left the shortfall — the thing the
// tab is named after — to a shade within it. Four hues also meant the legend had to teach four
// colours before a reader could see which areas were short at all.
//
// Now the hue says "there is a measured shortfall here" and the depth says how many of the three
// measured formats are short. Depth stays INDEXED by gapCount rather than interpolated, so every
// shade on the map maps back to a whole number of gaps the panel can list by name. The two greys are
// deliberately different values: one says "we looked and it is covered", the other says "we could
// not look".
export const OPP_DEPTH_RAMP=["#c7c3e8","#8b7fd0","#4c3fb0"] as const
export const oppServedFill="#d3d7db"
// THE TWO NO-READING STATES ARE NOT THE SAME CLAIM and must not look the same. "No material demand"
// is a settled reading (the area was assessed and has too little demand to serve); "no data" is a
// MISSING one (the area could not be scored). They are separated on THREE axes at once: lightness, a
// warm-neutral hue away from the cool measured greys, and an outline texture, so the distinction
// survives greyscale printing and colour-vision deficiency.
//
// ONE SHARED PAIR FOR ALL THREE MAPS. These tokens were previously the fuel and action maps' alone,
// while the non-fuel map kept its own near-identical cool greys (#dde1e5 / #e5e7e9, one of them with
// no outline at all). Two states that mean the same thing on every tab now paint the same on every
// tab, from one definition, so a reader who learns the pair once can carry it across tabs and no
// future edit can move one tab's token without moving all three.
export const ABSENCE_FILL={noTraffic:"#e6e2dc",noDemand:"#f2efeb"} as const
export const ABSENCE_STROKE="#8d8579"
// Long dash = a reading is missing; fine dot = a reading was taken and settled the area as too small
// to judge. The legend swatches read these same constants, so a swatch cannot draw a texture the hex
// does not carry.
export const NO_TRAFFIC_DASH="5 4"
export const NO_DEMAND_DASH="1 3"
// ALIASES, deliberately not second values: the non-fuel buckets are named differently in the engine
// ("not-observed", "no-material-demand") but they are the same two claims, so they resolve to the
// same tokens rather than keeping a parallel palette that could drift.
export const oppNotObservedFill=ABSENCE_FILL.noTraffic
export const oppNoDemandFill=ABSENCE_FILL.noDemand
// Only an unsurveyed hex is drawn with a broken outline. Exported so the map and the legend read
// the same value — the legend previously drew a dash the map never rendered, which is a legend
// describing a map that does not exist.
// MAP PALETTES live here, not in the leaflet-only map module, so the legend can read the exact
// values the hexes are painted with. Two components reading one table is what keeps a swatch from
// drifting away from its hex.
export const fuelClassColors:Record<string,[string,string]>={over:["#aeb5bd","#6f777f"],bal:["#dfe3e7","#c2c8ce"],fuel:["#f7dda8","#a56d18"]}
// ONE DISPLAY GROUP, ONE FLAT FILL — and the legend enumerates the same groups, so the map and the
// legend cannot disagree about how many colours are in play. `consolidate` and `watch` resolve to the
// SAME value on purpose: they share a legend row, and a row with one swatch over two map colours
// would leave a mark on the map the legend never accounts for.
export const ACTION_GROUP_FILL={
  integrate:"#cc0000",grow:"#d98c8c",fuel:"#6a6478",overserved:"#2f3136",retain:"#d8dadd",
} as const satisfies Record<ActionGroupKey,string>
// DERIVED, never written out again: a second hand-kept table keyed by verdict is how a hex ends up
// painted a colour its group's swatch does not carry.
export const ACTION_FILL=Object.fromEntries(
  (Object.keys(ACTION_GROUP) as ActionKey[]).map((key)=>[key,ACTION_GROUP_FILL[ACTION_GROUP[key]]]),
) as Record<ActionKey,string>
// THE TIER NO LONGER SHADES THE MAP, AND NO LONGER NAMES ANYTHING ON IT. It first stopped being a
// depth channel (hue = action, depth = buying power, needing a legend block that covered the hexes it
// explained); it has now also stopped being the WORDING on the action chips and in the click panel,
// which read the shared location vocabulary in ARCHETYPE_LABEL instead. The tier is unchanged as data
// — category() still computes and returns it, and it still selects the retail suggestions in
// `suggestionsFor` — it simply names nothing the reader sees.
//
// `ACTION_TIER_LABEL` and `ACTION_TIER_NOTE` are DELETED rather than left unused. Their notes were the
// buying-power grades this relabel removes ("highest retail buying power", "Real demand, lower
// margin"), so keeping them as dead exports would leave the retired vocabulary sitting in the file
// ready for the next surface to pick back up, with nothing recording that it was withdrawn on
// purpose. `ActionTier` itself stays: the grade is still computed and asserted.
// The exact fill a hex is painted with, so legend swatches and insight-card accents read the map
// rather than keeping their own copy of the palette. Takes the VERDICT KEY only: the tier is not an
// argument any more, so no caller can reintroduce shading by passing one.
export function actionFill(key:ActionKey):string{
  return ACTION_FILL[key]
}
// The two no-reading tokens are declared once, above, beside the non-fuel fills that alias them.
// OPP_UNSURVEYED_DASH is gone with them: the non-fuel map's "no data" outline was a third dash
// pattern ("3 3") for a state the other two maps already drew with NO_TRAFFIC_DASH, so it was a
// separate texture for the same claim.
export function oppFill(z:Zone,lower=NFR_DEFAULT_LOWER){
  const bucket=nfrOppBucket(z,lower)
  if(bucket==="not-observed")return oppNotObservedFill
  if(bucket==="no-material-demand")return oppNoDemandFill
  if(bucket==="served")return oppServedFill
  return OPP_DEPTH_RAMP[Math.min(Math.max(measuredGapCount(z,lower),1),OPP_DEPTH_RAMP.length)-1]
}

// THE FORMAT VIEW — a second way to colour the SAME opportunity hexes, selected from the tallies under
// the opportunity card. It answers a different question from the depth ramp: the ramp says HOW MANY
// formats an area is short on, the format view says WHICH one. Both read `measuredGapFormats`, so no
// hex can be short on F&B under one and not the other.
//
// DELIBERATELY NOT A FIFTH BUCKET. `nfrOppBucket` is untouched and the three no-shortfall states keep
// their exact greys in every format view: selecting a format narrows which opportunities are lit, it
// never reclassifies an area as served or unobserved. Only `opportunity` hexes can change colour.
export type NfrFormatView=MeasuredNfrFormat|"all-three"
// Okabe–Ito, so the three stay separable for red-green colour-blind readers — C-store and car wash are
// the pair a naive palette would collide. Asserted below to be distinct from each other, from every
// depth-ramp shade, and from all three absence greys, so a format colour can never read as an absence.
export const MEASURED_NFR_FORMAT_FILL={f_and_b:"#E69F00",cstore:"#0072B2",carwash:"#009E73"} as const satisfies Record<MeasuredNfrFormat,string>
// "Short on all three" wears the DARKEST RAMP SHADE rather than a fourth hue, because it is exactly the
// set that shade already paints: short on all three measured formats === gapCount 3 === the last ramp
// entry, asserted below. A new colour would give one set of hexes two appearances.
export const allThreeFill=OPP_DEPTH_RAMP[OPP_DEPTH_RAMP.length-1]
export function isShortOn(z:Zone,view:NfrFormatView,lower=NFR_DEFAULT_LOWER):boolean{
  const gaps=measuredGapFormats(z,lower)
  return view==="all-three"?gaps.length===MEASURED_NFR_FORMATS.length:gaps.includes(view)
}
export function nfrFormatViewFill(view:NfrFormatView){return view==="all-three"?allThreeFill:MEASURED_NFR_FORMAT_FILL[view]}
export const nfrFormatViewLabel=(view:NfrFormatView)=>view==="all-three"?"all three formats":MEASURED_NFR_SHORT_LABEL[view]
// The areas behind one tally. Scoped through nfrOppBucket so a tally can never reach a hex the card
// above it does not count.
export function nfrFormatViewZones(view:NfrFormatView,lower=NFR_DEFAULT_LOWER):Zone[]{
  return nfrOpportunityZones("opportunity",lower).filter((z)=>isShortOn(z,view,lower))
}
// Colour for the non-fuel map while a format view is active. Non-opportunity hexes return their normal
// fill FIRST, so this function structurally cannot repaint served / no-material-demand / not-observed.
// An opportunity hex that is not short on the selected format also keeps its ramp colour and is dimmed
// by the map's existing filter, rather than being recoloured into a state it is not in.
export function oppFormatFill(z:Zone,view:NfrFormatView,lower=NFR_DEFAULT_LOWER){
  const base=oppFill(z,lower)
  if(nfrOppBucket(z,lower)!=="opportunity")return base
  return isShortOn(z,view,lower)?nfrFormatViewFill(view):base
}
// ONE canonical bucket order, so the legend, the insight list and these counters cannot enumerate
// different bucket sets. Records are BUILT from it rather than written out and cast: the old
// `as Record<NfrOppBucket,number>` cast silenced the very "missing key" error that should fail the
// build when a bucket is added.
export const NFR_BUCKET_ORDER=["opportunity","served","no-material-demand","not-observed"] as const satisfies readonly NfrOppBucket[]
const zeroedBuckets=()=>Object.fromEntries(NFR_BUCKET_ORDER.map((bucket)=>[bucket,0])) as Record<NfrOppBucket,number>
export function nfrOpportunityCounts(lower=NFR_DEFAULT_LOWER){
  const live=zones.filter((z)=>z.live)
  const counts=zeroedBuckets()
  const gaps=zeroedBuckets()
  for(const z of live){const bucket=nfrOppBucket(z,lower);counts[bucket]+=1;gaps[bucket]+=measuredGapCount(z,lower)}
  const opportunities=counts.opportunity
  return {counts,gaps,opportunities,live:live.length}
}

const liveZones=zones.filter((z)=>z.live)
// Winsorized fuel LQ for a zone whose reading category() has already proven non-null. NaN for a null
// reading, which fails every comparison, so a missing reading surfaces as a failed invariant.
const fw=(z:Zone)=>z.fuelLQ===null?Number.NaN:winsorizeLQ(z.fuelLQ)
// A share-of-share LQ is demand-weighted-mean 1.0 across the aggregated population by
// construction. This is the real property of the definition, so it is what we assert: if the
// normalisation ever drifted back to a median (or aggregated over a different set of hexes than
// it divides), this check fails rather than silently renaming a relative index "location quotient".
const fuelReadable=liveZones.filter((z)=>z.fuelLQ!==null)
const fuelWeighted=fuelReadable.reduce((a,z)=>a+z.fuelLQ!*z.fuelDemand,0)/Math.max(fuelReadable.reduce((a,z)=>a+z.fuelDemand,0),1e-6)
const nfrWeighted=liveZones.reduce((a,z)=>a+z.nfrLQ*z.nfrDemand,0)/Math.max(liveZones.reduce((a,z)=>a+z.nfrDemand,0),1e-6)
export const validationChecks = {
  hexCounts:dataStatus.traffic===200&&dataStatus.population===200&&dataStatus.affluence===200&&dataStatus.nfrFormats===109&&rawZones.length===200,
  stationCount:dataStatus.stations===236,
  emaratCount:dataStatus.emarat===66,
  corridorScoresJoinByStationId:stationCorridorValidation,
  allRenderedInsideDubai:zones.every((z)=>isInsideDubai(z.lat,z.lon)),
  livePartition:liveZones.length+zones.filter((z)=>!z.live).length===zones.length,
  opportunitiesLiveOnly:zones.filter((z)=>{const r=category(z);return r&&(ACTIONABLE_KEYS as readonly ActionKey[]).includes(r.key)}).every((z)=>z.live),
  lqIsShareOfShare:Math.abs(fuelWeighted-1)<1e-9&&Math.abs(nfrWeighted-1)<1e-9,
  // A gated hex must be an ABSENT reading, never a zero: fuelLQ is null and it can never carry
  // an action or a category, so a thin-traffic hex cannot surface as a finding.
  gatedHexesAreAbsentNotZero:liveZones.filter((z)=>z.fuelDemand<fuelDemandFloor).every((z)=>z.fuelLQ===null&&category(z)===null),
  // 1.0 must sit strictly inside the band, or "fair share" itself would classify as a problem.
  bandStraddlesFairShare:DEFAULT_LOWER<1&&DEFAULT_UPPER>1,
  // Multiplicative symmetry about 1.0: lower x upper === 1 for a log-space band.
  bandIsLogSymmetric:Math.abs(DEFAULT_LOWER*DEFAULT_UPPER-1)<1e-9,
  // Archetypes are MECE: every live zone gets exactly one, and grouping by archetype
  // partitions the population it is built from.
  archetypesAreMece:(()=>{const live=zones.filter((z)=>z.live);const grouped=live.reduce<Record<string,number>>((acc,z)=>{const a=archetype(z);acc[a]=(acc[a]??0)+1;return acc},{});return Object.values(grouped).reduce((a,b)=>a+b,0)===live.length})(),
  // Every archetype the data can actually produce must have a format list, or a card would
  // render a recommendation with nothing in it.
  everyLiveArchetypeHasFormats:[...new Set(zones.filter((z)=>z.live).map((z)=>archetype(z)))].every((a)=>a==="unclassified"||FORMATS[a].length>0),
  // Both checks test the RESOLVED land use. Testing the raw `landuse` column here while the tier
  // is decided on `primary_context` would fail on the 7 disagreeing hexes and, worse, would be
  // asserting the rule against a column the code no longer uses.
  affluenceTierResidentialOnly:zones.every((z)=>residentialAffluenceTier(z)===null||/residential/.test(resolvedLanduse(z))),
  // RENAMED FROM `nonResidentialNeverPremium`, because the guarantee now rides on the archetype
  // rather than on the retired tier: the three residential labels all read "neighbourhood", so this
  // is what stops an industrial estate being called one. Reads `isResidentialArchetype` instead of
  // spelling the three names out, so adding a fourth residential band cannot slip past it.
  nonResidentialNeverNeighbourhood:zones.filter((z)=>!/residential/.test(resolvedLanduse(z))).every((z)=>!isResidentialArchetype(archetype(z))),
  // THE KICKER RULE, ASSERTED: an AED/sqm figure may be printed only where the archetype is
  // residential. The sticker gates its affluence segment on exactly this predicate, so a
  // non-residential hex can never show a label and an affluence figure side by side.
  affluenceShownOnlyOnNeighbourhoods:liveZones.every((z)=>!isResidentialArchetype(archetype(z))||residentialAffluenceTier(z)!==null),
  // No live land-use tag is silently absorbed by the residential catch-all.
  landuseVocabularyRecognised:unrecognisedLanduse.length===0,
  noSharjahAjmanOpportunity:rawZones.filter((z)=>!isInsideDubai(z.lat,z.lon)).every((z)=>!zones.some((inside)=>inside.id===z.id)),
  consolidateHasEmarat:zones.filter((z)=>category(z)?.key==="consolidate").every((z)=>z.hasEmarat>0),
  consolidateCannibalizationValid:zones.filter((z)=>category(z)?.key==="consolidate"&&category(z)?.cause==="cannibalization").every((z)=>z.canRate>0.5),
  existingHuffExcludesSite:[...stationHuffResults.entries()].every(([id,result])=>result.excludeStationId===id&&result.baselineStationCount===stations.length-1),
  huffIdentity:[...stationHuffResults.values()].every((result)=>Math.abs(result.captured-result.fromEmarat-result.fromComp-result.newly)<1e-6*Math.max(1,result.captured)),
  combinedTrace:zones.every((z)=>{const result=category(z);return !result||Boolean(result.trace.fuel&&result.trace.nfr)}),
  // THE SPINE, STATED AS THE SITE-PRESENCE SPLIT. Two separate claims, because they fail in
  // opposite directions: the first would hide a real dual gap, the second would invent a new site
  // out of a retail shortfall with no fuel case behind it.
  //
  // 1. An existing Emarat site with a measured retail gap is ALWAYS a grow — unless consolidation
  //    has already claimed it, which is the only legitimate diverter (fuel-over or cannibalising).
  growRequiresExistingSite:zones.filter((z)=>{const r=category(z);return r&&z.hasEmarat>0&&r.trace.nfr==="short"&&r.key!=="consolidate"}).every((z)=>category(z)?.key==="grow"),
  // 2. Retail alone can never conjure a forecourt: no fuel gap, no new-build recommendation.
  // `fuelLQ` is nullable on Zone, but category() returns null for a null reading, so every zone that
  // survives a `key===` filter below necessarily has one. fw() states that rather than asserting it
  // with `!`: a null would return NaN, and NaN fails every comparison, so the invariant reports false
  // instead of silently passing on a hex with no fuel reading at all.
  newSiteRequiresFuelGap:zones.filter((z)=>category(z)?.key==="integrate").every((z)=>z.hasEmarat===0&&fw(z)<DEFAULT_LOWER),
  // THE NON-RETAIL OUTCOMES MUST BE JUSTIFIED BY FUEL AND ASSET FACTS ALONE — asserted on the real
  // zones by re-reading the same public wall category() reads, rather than by re-deriving a hex with
  // retail stubbed out. `nfrMultiFormatById` is a module lookup keyed by id, so a spread-and-blank
  // zone would still resolve its real retail row and the check would compare a verdict to itself.
  consolidateRestsOnFuelOrCannibalization:zones.filter((z)=>category(z)?.key==="consolidate").every((z)=>z.hasEmarat>0&&(fw(z)>DEFAULT_UPPER||z.canRate>0.5)),
  watchRestsOnCrowdingWithoutAsset:zones.filter((z)=>category(z)?.key==="watch").every((z)=>z.hasEmarat===0&&fw(z)>DEFAULT_UPPER),
  // "Add fuel" must mean retail is genuinely fine, or a dual gap is being reported as a fuel-only one.
  fuelActionHasNoRetailGap:zones.filter((z)=>category(z)?.key==="fuel").every((z)=>measuredGapCount(z)===0&&fw(z)<DEFAULT_LOWER),
  // A retail grade may exist ONLY on a retail-led action, and must always exist on one.
  tierOnlyOnRetailActions:zones.every((z)=>{const r=category(z);return !r||(r.tier!==null)===ACTION_TIERED[r.key]}),
  // ONE TIER DEFINITION, now asserted against the tier function itself. This used to compare the
  // verdict's tier to `nfrOppBucket(z)`, which only worked because the bucket WAS the tier; with the
  // two separated, that comparison would be checking a grade against a shortfall state. Pointing it
  // at `nfrValueTier` keeps the real claim — a verdict's grade is the one grade this file computes —
  // rather than deleting a check whose subject moved.
  actionTierMatchesValueTier:zones.every((z)=>{const r=category(z);return !r||r.tier===null||r.tier===nfrValueTier(z)}),
  // A tier is still a RESIDENTIAL-led grade, so the archetype behind it must be the one the tier
  // table maps from. This is the check that replaces the old bucket comparison's second job.
  valueTierFollowsArchetype:liveZones.every((z)=>nfrValueTier(z)===TIER_BY_ARCHETYPE[archetype(z)]),
  // The six outcomes PARTITION the readable hexes: summing the per-key counts must reproduce the
  // readable population exactly, so no hex is counted twice and none is silently dropped.
  actionKeysAreMece:(()=>{
    const readable=zones.filter((z)=>category(z)!==null)
    return ACTION_KEYS.reduce((sum,key)=>sum+readable.filter((z)=>category(z)?.key===key).length,0)===readable.length
  })(),
  // An area must never be called retail-short unless the format survey reached it AND found
  // material demand. Restated from the old `nfrLocal>0` form, which the measured wall makes wrong:
  // a zero-supply shortfall is a real gap precisely where no retail is nearby.
  nfrShortRequiresObservation:zones.every((z)=>{const result=category(z);return !result||result.trace.nfr!=="short"||(anyFormatSurveyed(z)&&anyMeasuredFormat(z))}),
  // The opportunity buckets must PARTITION the live hexes, or the tier cards would be counting
  // some areas twice and missing others while still printing a total.
  nfrOppBucketsAreMece:(()=>{const {counts,live}=nfrOpportunityCounts();return Object.values(counts).reduce((a,b)=>a+b,0)===live})(),
  // The shade can never claim more gaps than there are measured formats to be short on.
  nfrGapCountWithinMeasuredSet:liveZones.every((z)=>measuredGapCount(z)<=MEASURED_NFR_FORMATS.length),
  // The opportunity bucket asserts at least one measured shortfall; "served" asserts none. If either
  // slipped, a hex with nothing short would be coloured as an opportunity or vice versa.
  nfrOpportunityBucketHasGaps:liveZones.filter((z)=>nfrOppBucket(z)==="opportunity").every((z)=>measuredGapCount(z)>=1),
  // THE DEPTH MUST BE INDEXABLE. The colour now carries the gap count directly, so every opportunity
  // hex's count has to land inside the ramp — a 4th gap would silently clamp to the darkest shade and
  // report three. Paired with `nfrGapCountWithinMeasuredSet`, this pins the ramp length to the
  // measured format count rather than leaving them to agree by coincidence.
  oppDepthRampCoversGapCounts:OPP_DEPTH_RAMP.length===MEASURED_NFR_FORMATS.length,
  nfrServedBucketHasNoGaps:liveZones.filter((z)=>nfrOppBucket(z)==="served").every((z)=>measuredGapCount(z)===0),
  // "Not observed" must mean the SURVEY DID NOT REACH — never a completed survey that happened to
  // find nothing. This is the check that stops the old bug returning.
  nfrNotObservedMeansUnsurveyed:liveZones.filter((z)=>nfrOppBucket(z)==="not-observed").every((z)=>!anyFormatSurveyed(z)),
  // ...and conversely, no surveyed hex may be filed as unobserved.
  nfrSurveyedHexIsNeverNotObserved:liveZones.filter((z)=>anyFormatSurveyed(z)).every((z)=>nfrOppBucket(z)!=="not-observed"),
  // A measured zero with real demand IS a gap. Proven against the pipeline's OWN verdict: our
  // rule (surveyed AND material demand AND index < lower) must reproduce `classification==="gap"`
  // for every measured cell. It agrees 327/327; the old supply>0 rule missed 65 of them.
  // We now depart from the feed on exactly ONE class of cell: a surveyed zero whose index the feed
  // read as balanced/over_served. Everywhere else the agreement must still be exact, so a future
  // feed change cannot quietly widen the divergence.
  nfrGapMatchesFeedExceptZeroSupply:nfrMultiFormatHexes.every((row)=>{
    const z=zoneById.get(row.id)
    return !z||MEASURED_NFR_FORMATS.every((format)=>{
      if(nfrZeroSupplyShortfall(z,format))return true
      return (nfrMeasured(z,format)&&(nfrAccessibilityIndex(z,format)??Infinity)<NFR_DEFAULT_LOWER)===(row.formats[format].classification==="gap")
    })
  }),
  // ...and every departure IS a zero-supply cell, so the exception cannot be used to smuggle in a
  // different disagreement. Both directions are needed: the check above alone would pass if the
  // exception were widened to cover unrelated cells.
  nfrDeparturesAreOnlyZeroSupply:nfrMultiFormatHexes.every((row)=>{
    const z=zoneById.get(row.id)
    return !z||MEASURED_NFR_FORMATS.every((format)=>{
      const ours=measuredGapFormats(z).includes(format)
      return ours===(row.formats[format].classification==="gap")||nfrZeroSupplyShortfall(z,format)
    })
  }),
  // A surveyed zero with material demand must ALWAYS be short, whatever its index says.
  nfrZeroSupplyIsAlwaysShort:liveZones.every((z)=>MEASURED_NFR_FORMATS.every((format)=>!nfrZeroSupplyShortfall(z,format)||measuredGapFormats(z).includes(format))),
  // NON-VACUITY: at least one gap must have zero supply, or the whole distinction above is
  // untested and this file would pass while still discarding the strongest evidence it has.
  nfrZeroSupplyGapsExist:liveZones.some((z)=>measuredGapFormats(z).some((format)=>nfrSupplyCount(z,format)===0)),
  // No-material-demand is a FINDING, so it must sit on a surveyed hex with nothing material —
  // never absorb an unsurveyed one, and never claim provision the way "served" does.
  nfrNoDemandBucketIsSurveyed:liveZones.filter((z)=>nfrOppBucket(z)==="no-material-demand").every((z)=>anyFormatSurveyed(z)&&!anyMeasuredFormat(z)),
  // Three DIFFERENT claims must not share one fill. They did: no-material-demand was given the
  // same hex as not-observed, which is also the fuel view's "no data" grey, so a completed survey
  // was painted exactly like absent data. Every bucket colour must be unique.
  nfrBucketFillsAreDistinct:new Set(NFR_BUCKET_ORDER.map((bucket)=>bucket==="served"?oppServedFill:bucket==="no-material-demand"?oppNoDemandFill:bucket==="not-observed"?oppNotObservedFill:OPP_DEPTH_RAMP[OPP_DEPTH_RAMP.length-1])).size===NFR_BUCKET_ORDER.length,
  // ...and no shade of the opportunity ramp may collide with a no-reading grey either. The greys are
  // near-neutral and the ramp's lightest shade is pale, so this is the pairing most likely to drift
  // into two states looking alike, which is the whole reason those greys were separated.
  // Compared as STRINGS, not as the literal types. Written with `!==` against the `as const` fills,
  // TypeScript proved the two sets disjoint and rejected the comparison as unintentional — i.e. it
  // was vacuous the moment it was written, and would only have started type-checking once the bug it
  // guards against was already present. Widening keeps it a live runtime check.
  oppRampNeverLooksLikeAbsence:(OPP_DEPTH_RAMP as readonly string[]).every((shade)=>!([oppServedFill,oppNoDemandFill,oppNotObservedFill] as readonly string[]).includes(shade)),
  // THE FORMAT VIEW'S OWN GUARDRAILS. Hex case is not meaningful in CSS but IS meaningful to `===`,
  // and this palette is written uppercase to match the brief that specified it while the rest of the
  // file is lowercase, so every comparison here normalises first. That mismatch is exactly how a
  // "distinct colours" check passes while two identical colours sit on the map.
  // THE NON-FUEL HEADER RESTS ON THIS. That panel is now a single line, and it covers the
  // "profile not established" case by printing ARCHETYPE_LABEL[archetype(z)] rather than branching on
  // the value tier — which is only correct while profile-unknown and unclassified are the same set. If
  // a second archetype were ever mapped to profile-unknown, that hex would print its land-use label
  // under a tier the suggestion block calls unknown, and the two would quietly disagree.
  profileUnknownIsExactlyUnclassified:liveZones.every((z)=>(nfrValueTier(z)==="profile-unknown")===(archetype(z)==="unclassified")),
  formatFillsAreDistinct:new Set(Object.values(MEASURED_NFR_FORMAT_FILL).map((c)=>c.toLowerCase())).size===MEASURED_NFR_FORMATS.length,
  // THE WALL, at the palette. Both the non-fuel tallies and the action map's retail rows are keyed off
  // this palette, so a suggested format acquiring a colour here is the single edit that would let an
  // unmeasured format be counted and coloured as though it had been surveyed. The `satisfies` clause
  // fixes the keys at compile time; this says the same thing about the data, which is what a reader
  // checking the wall can actually run.
  formatPaletteHoldsTheMeasuredWall:Object.keys(MEASURED_NFR_FORMAT_FILL).every((format)=>!(SUGGESTED_NFR_FORMATS as readonly string[]).includes(format))&&Object.keys(MEASURED_NFR_FORMAT_FILL).length===MEASURED_NFR_FORMATS.length,
  formatFillsNeverLookLikeRampOrAbsence:Object.values(MEASURED_NFR_FORMAT_FILL).every((c)=>!([...OPP_DEPTH_RAMP,oppServedFill,oppNoDemandFill,oppNotObservedFill] as readonly string[]).map((s)=>s.toLowerCase()).includes(c.toLowerCase())),
  // The tallies OVERLAP, so their union — never their sum — must equal the card they sit under. This
  // is the check that keeps the card's headline reproducible from its own breakdown.
  formatTallyUnionEqualsOpportunityCard:(()=>{
    const ids=new Set<number>()
    for(const format of MEASURED_NFR_FORMATS)for(const z of nfrFormatViewZones(format))ids.add(z.id)
    return ids.size===nfrOpportunityZones("opportunity").length
  })(),
  // NON-VACUITY for the overlap disclosure: if the tallies happened not to overlap, the note telling
  // the reader they do would be false, and a partition would be the honest presentation instead.
  formatTalliesGenuinelyOverlap:MEASURED_NFR_FORMATS.reduce((n,format)=>n+nfrFormatViewZones(format).length,0)>nfrOpportunityZones("opportunity").length,
  // THE SUM THE CHIP NOTE PROMISES. The three tallies add to the short-FORMAT figure the card prints
  // (`gaps.opportunity`), because both count the same area-by-format shortfalls — once per area, once
  // per format. The note states that in words, so it has to hold: without this check, "they sum to the
  // 102 short formats above" is an unverified claim about two independently-computed numbers, and a
  // reader who adds the chips is the one who finds out it drifted.
  formatTalliesSumToShortFormatCount:MEASURED_NFR_FORMATS.reduce((n,format)=>n+nfrFormatViewZones(format).length,0)===nfrOpportunityCounts().gaps.opportunity,
  // Every opportunity area is short on at least one measured format — true by the definition of the
  // bucket, so a failure here means the bucket and the tallies have drifted apart.
  everyOpportunityAppearsInSomeTally:nfrOpportunityZones("opportunity").every((z)=>MEASURED_NFR_FORMATS.some((format)=>isShortOn(z,format))),
  // "All three" is a SUBSET of each single-format tally, which is why it is presented as a nested
  // highlight rather than a fifth category alongside them.
  allThreeIsSubsetOfEveryFormat:nfrFormatViewZones("all-three").every((z)=>MEASURED_NFR_FORMATS.every((format)=>isShortOn(z,format))),
  // ...and it is exactly the set the darkest ramp shade already paints, in BOTH directions — equal
  // counts alone would pass if one set contained a hex the other did not.
  allThreeMatchesDarkestRampExactly:(()=>{
    const darkest=OPP_DEPTH_RAMP[OPP_DEPTH_RAMP.length-1]
    const byRamp=new Set(nfrOpportunityZones("opportunity").filter((z)=>oppFill(z)===darkest).map((z)=>z.id))
    const byView=nfrFormatViewZones("all-three")
    return byView.length===byRamp.size&&byView.every((z)=>byRamp.has(z.id))
  })(),
  // A FORMAT VIEW MUST NOT TOUCH THE OTHER THREE BUCKETS. This is the explicit instruction that the
  // served / no-material-demand / not-observed colours stay put, asserted rather than trusted to the
  // early return inside oppFormatFill.
  formatViewLeavesOtherBucketsUnpainted:liveZones.every((z)=>nfrOppBucket(z)==="opportunity"||([...MEASURED_NFR_FORMATS,"all-three"] as NfrFormatView[]).every((view)=>oppFormatFill(z,view)===oppFill(z))),
  // Only an unestablished land use may carry the unknown-profile tier, and an established one
  // never may — otherwise "profile not established" would absorb areas that do have a profile.
  nfrProfileUnknownIsUnclassifiedOnly:liveZones.every((z)=>(nfrValueTier(z)==="profile-unknown")===(archetype(z)==="unclassified")),
  // Premium is residential-only by construction here, matching the affluence rule: a
  // non-residential hex must never be reported as high buying power.
  nfrPremiumIsResidentialOnly:liveZones.filter((z)=>nfrValueTier(z)==="premium").every((z)=>residentialAffluenceTier(z)==="premium"),
  // The non-fuel band must straddle fair share the same way the fuel band does.
  nfrBandStraddlesFairShare:NFR_DEFAULT_LOWER<1&&NFR_DEFAULT_UPPER>1,
  // AFFLUENCE MUST NOT REACH THE MEASUREMENT. The panel's suggestion copy is affluence-aware, so
  // this proves the qualifier stops at the copy: for every live hex the observed measured set is
  // drawn only from the same three formats, and the gap count is reproducible from the raw
  // accessibility index WITHOUT consulting the tier. An edit that keys a measured format off
  // affluence fails loudly here instead of silently re-pricing the map.
  nfrMeasuredSetIsTierIndependent:liveZones.every((z)=>{
    const measuredAreInSet=nfrMeasuredFormats(z).every((format)=>(MEASURED_NFR_FORMATS as readonly string[]).includes(format))
    // Must restate the WHOLE short test, zero-supply arm included. Recomputing with the index arm
    // alone made this fail the moment a surveyed zero became short — the check was asserting a rule
    // the app no longer used, and reported it as a tier leak.
    const recomputedWithoutTier=MEASURED_NFR_FORMATS.filter((format)=>nfrMeasured(z,format)&&(nfrZeroSupplyShortfall(z,format)||(nfrAccessibilityIndex(z,format)??Infinity)<NFR_DEFAULT_LOWER)).length
    return measuredAreInSet&&recomputedWithoutTier===measuredGapCount(z)
  }),
  }
if(process.env.NODE_ENV!=="production")for(const [name,passed] of Object.entries(validationChecks))console.assert(passed,`NetSight validation failed: ${name}`)

