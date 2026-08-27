"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

type Geometry={type:string;coordinates?:unknown}
type GeoJsonProperties=Record<string,unknown>|null
type FeatureCollection<G=Geometry,P=GeoJsonProperties>={type:"FeatureCollection";features:Array<{type:"Feature";geometry:G;properties:P}>}
import type { Zone, Station } from "@/lib/netsight"
import { ABSENCE_FILL, ABSENCE_STROKE, NFR_BUCKET_LABEL, NO_DEMAND_DASH, NO_TRAFFIC_DASH, actionFill, category, classifyLQ, dubaiBoundaryLatLngs, flaggedCannibalisationStationIds, fuelClassColors, hexPoly, measuredGapFormats, nfrMultiFormatById, nfrOppBucket, oppFill, oppFormatFill, stationOverlapPairs, type NfrFormatView } from "@/lib/netsight"
import stationFacilityData from "@/data/station_facilities_100m.json"

type View = "fuel" | "nfr" | "combined"
export type MapFilter = { stations: string[]; zones: number[] } | null
export type OperatorFilter = "All" | "Emarat" | "ENOC/EPPCO" | "ADNOC" | "Other"

const stationColors: Record<string, string> = { Emarat: "#16834a", "ENOC/EPPCO": "#e8781c", ADNOC: "#2166ae", Other: "#808892" }
const cartoBasemapKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY?.trim()
const cartoBasemapUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png${cartoBasemapKey ? `?key=${encodeURIComponent(cartoBasemapKey)}` : ""}`
type StationFacilitySummary = {
  station_id: string
  data_status: "available" | "available_zero" | "limited"
  total_facilities: number | null
  category_counts: Array<{ category: string; count: number }>
}
const stationFacilitiesById = new Map(
  (stationFacilityData as StationFacilitySummary[]).map((row) => [row.station_id, row]),
)
const classColors = { over: ["#f3cbc5", "#b5382d"], bal: ["#dce2d7", "#839274"], nfr: ["#d9d3ef", "#5547a2"], fuel: ["#f7dda8", "#a56d18"], dual: ["#efb29b", "#993e27"] }
// Fuel tab only: over-served and well-served recede to grey so under-served amber is the one
// saturated colour on the map. Kept SEPARATE from classColors because that table is shared
// with the other views, where over/balanced still carry meaning worth colouring.
// classifyLQ is called with n=999 on this tab, so only over / fuel / bal can occur here.
// fuelClassColors, the action palette and the absence palette live in lib/netsight.ts so the legend can
// read the same values without importing this leaflet-only module.


function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const x = p(a), y = p(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`
}

// Reads the SAME two conditions fill() branches on, in the same order, so the outline texture and
// the fill can never describe different states of the same hex. Returns null when the hex carries a
// real reading and is therefore judged on the colour scale.
export function absenceKind(z: Zone): "noDemand" | "noTraffic" | null {
  if (!z.live) return "noDemand"
  if (z.fuelLQ === null) return "noTraffic"
  return null
}
// The non-fuel map's equivalent. It reads the SAME two tokens as the fuel and action maps, but it
// asks nfrOppBucket which state a hex is in, because the non-fuel pass reaches a different set of
// hexes: "not-observed" is that map's "could not be scored", and it is the state a dead hex lands in
// here, whereas the fuel map calls the same hex "no material demand". Returning the shared kind means
// the appearance is common while the classification stays each map's own.
function nfrAbsenceKind(z: Zone, lower: number): "noDemand" | "noTraffic" | null {
  const bucket = nfrOppBucket(z, lower)
  if (bucket === "not-observed") return "noTraffic"
  if (bucket === "no-material-demand") return "noDemand"
  return null
}

function fill(z: Zone, view: View, upper: number, lower: number, nfrFormat: NfrFormatView | null) {
  // THE NON-FUEL MAP HAS TWO COLOURINGS, and they are two readings of the same measurement rather
  // than two unrelated palettes: the depth ramp by gap COUNT, and — when a tally under the
  // opportunity card is selected — one measured format's own colour. Both come out of
  // `measuredGapFormats`. The land-use / affluence tier colours nothing here.
  if (view === "nfr") return nfrFormat ? oppFormatFill(z, nfrFormat, lower) : oppFill(z, lower)
  if (!z.live) return ABSENCE_FILL.noDemand
  if (z.fuelLQ === null) return ABSENCE_FILL.noTraffic
  // actionFill() is the one place the action palette is resolved, so a legend swatch and a hex can
  // never disagree. A readable hex always has a verdict here (both absence cases returned above).
  if (view === "combined") {
    const verdict = category(z, z.canRate, upper, lower)
    return verdict ? actionFill(verdict.key) : ABSENCE_FILL.noTraffic
  }
  if (view === "fuel") {
    const c = classifyLQ(z.fuelLQ!, 999, upper, lower, z.live)
    if (c.cls === "none") return ABSENCE_FILL.noTraffic
    const palette = fuelClassColors[c.cls] ?? classColors[c.cls]
    return mix(palette[0], palette[1], 0.25 + 0.75 * c.mag)
  }
  return "#839274"
}

function roadColor(lq: unknown, upper: number, lower: number) {
  const value=Number(lq)
  if(!Number.isFinite(value))return "#9ca3af"
  if(value>upper)return "#b5382d"
  if(value<lower)return "#a56d18"
  return "#839274"
}

// The tooltip reads category()'s own `sow` label rather than keeping a fourth copy of the four
// action names. A hand-kept table here had already drifted ("Rationalise or repurpose" survived a
// rename everywhere else), which is the drift a second source of truth guarantees.

function zoneTooltip(z: Zone, view: View, upper: number, lower: number) {
  // ONE LINE ONLY. The click panel is the single source for a hex's detail; repeating the profile,
  // population and affluence here created two places to keep in step for no extra reach.
  if(view==="nfr"){
    // Says WHY there is nothing to report, in the same words as the bucket and the legend. "No
    // location evidence" was ambiguous between "we looked and found none" and "we never looked".
    if(!nfrMultiFormatById.get(z.id))return "Catchment survey did not reach this polygon"
    const bucket=nfrOppBucket(z,lower)
    const gapCount=measuredGapFormats(z,lower).length
    return `${NFR_BUCKET_LABEL[bucket]}${gapCount>0?` · ${gapCount} ${gapCount===1?"gap":"gaps"}`:""}`
  }
  if (!z.live) return "No material demand here"
  if (z.fuelLQ === null) return "Not enough traffic observed"
  if (view === "combined") {
    const verdict = category(z, z.canRate, upper, lower)
    if (!verdict) return "No recommendation for this area"
    // NO TIER. The hex no longer carries one, so a hover that named one would describe a dimension
    // the colour has stopped expressing. The tier is read as a chip on the card or in the click
    // panel. `sow` keeps consolidate and watch apart on hover even though they share a swatch.
    return verdict.sow
  }
  if (z.fuelLQ > upper) return "Over-served area"
  if (z.fuelLQ < lower) return z.hasEmarat === 0 ? "Under-served area, no Emarat station" : "Under-served area"
  return "Well-served area"
}

function MapResize() {
  const map = useMap()
  useEffect(() => {
    const node = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(node)
    map.invalidateSize()
    return () => observer.disconnect()
  }, [map])
  return null
}

export function NetSightMap({
  zones,
  stations,
  view,
  upper,
  lower,
  onZone,
  onStation,
  mapFilter = null,
  showZones = true,
  onToggleZones,
  networkView = false,
  onNetworkView,
  showOverlapPartners = false,
  selectedOverlapStationId = null,
  cannibalisationSummaryMode = false,
  operatorFilter = "All",
  nfrFormat = null,
}: {
  zones: Zone[]
  stations: Station[]
  view: View
  upper: number
  lower: number
  onZone: (z: Zone) => void
  onStation: (s: Station) => void
  mapFilter?: MapFilter
  showZones?: boolean
  onToggleZones?: (next: boolean) => void
  networkView?: boolean
  onNetworkView?: (next: boolean) => void
  showOverlapPartners?: boolean
  selectedOverlapStationId?: string|null
  cannibalisationSummaryMode?: boolean
  operatorFilter?: OperatorFilter
  // Only ever set on the non-fuel tab. `fill` reads it inside the `view === "nfr"` branch, so an
  // insight on another tab cannot recolour anything even if this were passed by mistake.
  nfrFormat?: NfrFormatView | null
}) {
  const [roadData,setRoadData]=useState<FeatureCollection<Geometry,GeoJsonProperties>|null>(null)
  const [roadError,setRoadError]=useState(false)
  const [overlapRoadData,setOverlapRoadData]=useState<FeatureCollection<Geometry,GeoJsonProperties>|null>(null)
  const [overlapRoadError,setOverlapRoadError]=useState(false)
  const selectedOverlapRoadData=useMemo(()=>{
    if(!overlapRoadData||!selectedOverlapStationId)return null
    return {
      ...overlapRoadData,
      features:overlapRoadData.features.filter((feature)=>feature.properties?.source_station_id===selectedOverlapStationId),
    } as FeatureCollection<Geometry,GeoJsonProperties>
  },[overlapRoadData,selectedOverlapStationId])
  const selectedOverlapStationIds=useMemo(()=>{
    const ids=new Set<string>()
    if(selectedOverlapStationId)ids.add(selectedOverlapStationId)
    const partner=selectedOverlapRoadData?.features[0]?.properties?.partner_station_id
    if(typeof partner==="string")ids.add(partner)
    return ids
  },[selectedOverlapRoadData,selectedOverlapStationId])
  const selectedOverlapPair=useMemo(()=>{
    if(!selectedOverlapStationId)return null
    return stationOverlapPairs.find((pair)=>pair.source_station_id===selectedOverlapStationId)??null
  },[selectedOverlapStationId])
  useEffect(()=>{
    if(!networkView||roadData||roadError)return
    fetch("/data/network/road_opportunity.geojson")
      .then((response)=>{if(!response.ok)throw new Error(String(response.status));return response.json()})
      .then((data)=>setRoadData(data as FeatureCollection<Geometry,GeoJsonProperties>))
      .catch(()=>setRoadError(true))
  },[networkView,roadData,roadError])
  useEffect(()=>{
    if(!showOverlapPartners||overlapRoadData||overlapRoadError)return
    fetch("/data/network/station_overlap_shared_roads.geojson")
      .then((response)=>{if(!response.ok)throw new Error(String(response.status));return response.json()})
      .then((data)=>setOverlapRoadData(data as FeatureCollection<Geometry,GeoJsonProperties>))
      .catch(()=>setOverlapRoadError(true))
  },[showOverlapPartners,overlapRoadData,overlapRoadError])
  const filteredStations = mapFilter ? new Set(mapFilter.stations) : null
  const filteredZones = mapFilter ? new Set(mapFilter.zones) : null
  const zoneFilterActive = Boolean(filteredZones && filteredZones.size > 0)
  const stationFilterActive = Boolean(filteredStations && filteredStations.size > 0)

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[25.1, 55.22]} zoom={11} className="h-full w-full" zoomControl attributionControl>
        <MapResize />
        <TileLayer
          url={cartoBasemapUrl}
          subdomains="abcd"
          maxZoom={19}
          attribution="&copy; OpenStreetMap &copy; CARTO"
        />

        {showZones && !networkView &&
          zones.map((z) => {
            // No location-profile gate any more. The only thing that dims a hex here is an active
            // insight selection, so a hex is faded because a finding excluded it — never because a
            // second, invisible filter was still set.
            const match = !zoneFilterActive || filteredZones!.has(z.id)
            const baseOpacity = z.live ? 0.74 : 0.24
            return (
              <Polygon
                key={z.id}
                positions={hexPoly(z.lat, z.lon)}
                pathOptions={{
                  fillColor: fill(z, view, upper, lower, nfrFormat),
                  fillOpacity: match ? baseOpacity : 0.07,
                  color: match && zoneFilterActive ? "#111111" : "#ffffff",
                  weight: match && zoneFilterActive ? 1.4 : 0.65,
                  // THE TWO NO-READING STATES ARE DRAWN IDENTICALLY ON ALL THREE MAPS, from the same
                  // tokens the three legends read, so a reader who learns the pair on one tab can
                  // carry it to the next. Texture does the separating, because fill alone cannot:
                  // these hexes are drawn at low opacity, so any tint they carried would wash out.
                  //
                  // WHICH hexes are in which state is still decided per map by that map's own
                  // engine, and the two engines genuinely disagree: a hex with no material demand is
                  // "noDemand" on the fuel and action maps, but the non-fuel pass never reached it,
                  // so nfrOppBucket files the same hex as "not-observed". Only the appearance is
                  // shared; nothing here reassigns a hex.
                  //
                  // The non-fuel outline is no longer gated on z.live. That gate existed because a
                  // dash then meant "the survey missed here", which overclaimed for hexes that were
                  // never survey candidates. Under the shared label "No data · not assessed" the
                  // dash makes the weaker and correct claim, and its fill already said not-observed,
                  // so the outline now matches the swatch instead of contradicting it.
                  ...(() => {
                    const kind = view === "nfr" ? nfrAbsenceKind(z, lower) : absenceKind(z)
                    if (!match || kind === null) return {}
                    return {
                      dashArray: kind === "noTraffic" ? NO_TRAFFIC_DASH : NO_DEMAND_DASH,
                      color: ABSENCE_STROKE,
                      weight: 1,
                      fillOpacity: kind === "noTraffic" ? 0.6 : 0.4,
                    }
                  })(),
                }}
                eventHandlers={{ click: () => onZone(z) }}
              >
                <Tooltip sticky>{zoneTooltip(z, view, upper, lower)}</Tooltip>
              </Polygon>
            )
          })}

        {dubaiBoundaryLatLngs.map((polygon, index) => {
          const outerRing = polygon[0]
          const lats = outerRing.map(([lat]) => lat)
          const lons = outerRing.map(([, lon]) => lon)
          const width = Math.max(...lons) - Math.min(...lons)
          const height = Math.max(...lats) - Math.min(...lats)
          const isMainlandOrHatta = width > 0.12 && height > 0.12
          if (!isMainlandOrHatta) return null
          // The drawn boundary is clipped to the mainland. Hatta is a detached exclave ~50 km east,
          // so outlining it stretched the map to hold an empty box no hex is analysed in. This is a
          // DRAWING change only: which hexes are analysed comes from isInsideDubai on the full
          // geometry, which still includes Hatta and is untouched.
          const isHatta = Math.min(...lons) > 56
          if (isHatta) return null
          return (
            <Polygon
              key={`dubai-boundary-${index}`}
              positions={polygon}
              interactive={false}
              // The study-area edge is CONTEXT, not a finding. At weight 3 in #C0392B it was the
              // loudest mark on a map whose only saturated colour means "integrate a new site", so
              // the frame competed with the recommendations inside it. A thin neutral line still
              // reads as the edge of the analysis without looking like a result.
              pathOptions={{ color: "#7b8189", weight: 1.5, dashArray: "5 4", fill: false }}
            />
          )
        })}

        {networkView&&roadData&&!showOverlapPartners&&<GeoJSON
          key="directed-road-opportunity"
          data={roadData}
          style={(feature)=>({
            color:roadColor(feature?.properties?.network_fuel_lq,upper,lower),
            weight:Math.max(1.2,Math.min(4,1.2+Number(feature?.properties?.network_demand??0)/8)),
            opacity:.78,
          })}
          onEachFeature={(feature,layer)=>{
            const p=feature.properties??{}
            const lq=Number(p.network_fuel_lq)
            const unserved=100*Number(p.outside_unserved_share??0)
            layer.bindPopup(`<strong>${p.road_name||"Road segment"}</strong><br/>Network fuel LQ: ${Number.isFinite(lq)?lq.toFixed(2):"Not readable"}<br/>Congestion: ${Number(p.congestion??0).toFixed(1)}%<br/>Reachable stations: ${Number(p.accessible_station_count??0)}<br/>Nearest station: ${p.nearest_station_time_s==null?"None within 5 min":`${(Number(p.nearest_station_time_s)/60).toFixed(1)} min`}<br/>Outside / unserved: ${unserved.toFixed(1)}%`)
          }}
        />}

        {/* The Reilly breakpoint overlay is GONE — dashed line, red dot and permanent label. It named a
            named academic model on the face of the map and asserted a single crossover point as a fact,
            which is a harder claim than anything else this demo makes. The `breakpoint` helper stays in
            lib for the methods list; nothing renders it. */}

        {showOverlapPartners&&selectedOverlapRoadData&&selectedOverlapRoadData.features.length>0&&<GeoJSON
          key={`shared-road-demand-${selectedOverlapStationId}`}
          data={selectedOverlapRoadData}
          style={(feature)=>({
            color:"#7c3aed",
            weight:1.5+Math.min(5,Number(feature?.properties?.road_share_of_pair??0)*55),
            opacity:.82,
          })}
          onEachFeature={(feature,layer)=>{
            const p=feature.properties??{}
            layer.bindTooltip(`${p.source_station_name||"Emarat"} → ${p.partner_station_name||"Emarat"}<br/>This road contributes ${(100*Number(p.road_share_of_pair??0)).toFixed(1)}% of the directional pair transfer`,{sticky:true})
          }}
        />}

        {stations.map((s) => {
          const knownOperator = s.operator in stationColors ? s.operator : "Other"
          if (operatorFilter !== "All" && knownOperator !== operatorFilter) return null
          const overlapMatch=showOverlapPartners&&selectedOverlapStationIds.has(s.id)
          const match = overlapMatch||!stationFilterActive || filteredStations!.has(s.id)
          const emarat = s.operator === "Emarat"
          const cannibalisationFlagged=emarat&&flaggedCannibalisationStationIds.has(s.id)
          const nearbyFacilities = stationFacilitiesById.get(s.id)
          return (
            <Fragment key={s.id}>
            {cannibalisationFlagged&&<CircleMarker
              center={[s.lat,s.lon]}
              radius={overlapMatch?11:match&&stationFilterActive?10:8}
              interactive={false}
              pathOptions={{fill:false,color:"#cc0000",opacity:match?1:.2,weight:2.5}}
            />}
            <CircleMarker
              center={[s.lat, s.lon]}
              radius={overlapMatch ? 8 : match && stationFilterActive ? 7 : 5}
              pathOptions={{
                fillColor: stationColors[s.operator] ?? stationColors.Other,
                color: overlapMatch ? "#7c3aed" : match && stationFilterActive ? "#111111" : "#ffffff",
                fillOpacity: match ? 0.95 : 0.12,
                opacity: match ? 1 : 0.2,
                weight: overlapMatch ? 3 : match && stationFilterActive ? 2 : 1.5,
              }}
              eventHandlers={cannibalisationSummaryMode?{}:{ click: () => onStation(s) }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.97}>
                {!nearbyFacilities || nearbyFacilities.data_status !== "available" ? (
                  <strong>Limited data in demo version</strong>
                ) : (
                  <div className="min-w-[190px] max-w-[260px]">
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.operator}</div>
                    <div className="my-2 border-t" />
                    <div className="font-semibold">
                      {nearbyFacilities.total_facilities} {nearbyFacilities.total_facilities === 1 ? "facility" : "facilities"} within 100 m
                    </div>
                    <div className="mt-1 grid gap-0.5">
                      {nearbyFacilities.category_counts.map(({ category, count }) => (
                        <div key={category}>{count} {category}</div>
                      ))}
                    </div>
                  </div>
                )}
              </Tooltip>
              {!cannibalisationSummaryMode&&<Popup>
                <strong>{s.name}</strong>
                <br />
                {s.operator}
                {showOverlapPartners&&selectedOverlapStationId===s.id&&selectedOverlapPair&&<>
                  <hr className="my-2" />
                  <strong>Directional transfer screening</strong>
                  <br />
                  {(100*selectedOverlapPair.total_emarat_transfer_rate).toFixed(1)}% transfers to the full Emarat network
                  <br />
                  {(100*selectedOverlapPair.partner_share_of_capture).toFixed(1)}% transfers to the principal partner shown
                  <br />
                  That is {(100*selectedOverlapPair.partner_share_of_emarat_transfer).toFixed(1)}% of all Emarat-bound transfer
                </>}
              </Popup>}
            </CircleMarker>
            </Fragment>
          )
        })}
      </MapContainer>

      {onNetworkView&&<button
        type="button"
        onClick={()=>onNetworkView(!networkView)}
        aria-pressed={networkView}
        className="absolute right-3 top-3 z-[800] rounded-sm border-2 border-black/20 bg-background px-3 py-2 text-sm font-semibold shadow-md hover:bg-muted"
      >
        {networkView?"Show hex view":"Show road-network view"}
      </button>}

      {networkView&&!roadData&&!roadError&&<div className="absolute left-1/2 top-3 z-[800] -translate-x-1/2 border bg-background px-3 py-2 text-sm shadow">Loading road network…</div>}
      {networkView&&roadError&&<div className="absolute left-1/2 top-3 z-[800] -translate-x-1/2 border border-primary bg-background px-3 py-2 text-sm shadow">Road layer could not be loaded</div>}
      {showOverlapPartners&&!overlapRoadData&&!overlapRoadError&&<div className="absolute left-1/2 top-14 z-[800] -translate-x-1/2 border bg-background px-3 py-2 text-sm shadow">Loading shared demand roads…</div>}
      {showOverlapPartners&&overlapRoadError&&<div className="absolute left-1/2 top-14 z-[800] -translate-x-1/2 border border-primary bg-background px-3 py-2 text-sm shadow">Shared-road layer could not be loaded</div>}
      {showOverlapPartners&&overlapRoadData&&!selectedOverlapStationId&&<div className="absolute left-1/2 top-14 z-[800] -translate-x-1/2 border bg-background px-3 py-2 text-sm font-semibold shadow">Select a highlighted Emarat station to inspect its shared roads</div>}
      {showOverlapPartners&&selectedOverlapStationId&&selectedOverlapRoadData?.features.length===0&&<div className="absolute left-1/2 top-14 z-[800] -translate-x-1/2 border bg-background px-3 py-2 text-sm shadow">This station is not currently flagged for own-network transfer</div>}
      {showOverlapPartners&&selectedOverlapPair&&<div className="absolute left-12 top-3 z-[800] max-w-[330px] border bg-background/95 px-3 py-2 text-sm shadow-md">
        <div className="font-bold">Directional demand transfer</div>
        <div className="mt-1"><strong>{(100*selectedOverlapPair.partner_share_of_capture).toFixed(1)}%</strong> of this station's captured demand transfers to the highlighted principal partner.</div>
        <div className="mt-1 text-muted-foreground"><strong>{(100*selectedOverlapPair.total_emarat_transfer_rate).toFixed(1)}%</strong> transfers to all other Emarat stations combined. These are different measures.</div>
        <div className="mt-1 text-muted-foreground">The principal partner receives <strong>{(100*selectedOverlapPair.partner_share_of_emarat_transfer).toFixed(1)}%</strong> of that Emarat-bound transfer.</div>
      </div>}

      {onToggleZones && !networkView && (
        <button
          type="button"
          onClick={() => onToggleZones(!showZones)}
          aria-pressed={showZones}
          className={`absolute right-3 ${onNetworkView?"top-14":"top-3"} z-[800] rounded-sm border-2 border-black/20 bg-background px-3 py-2 text-sm font-semibold shadow-md hover:bg-muted`}
        >
          {showZones ? "Hide zones" : "Show zones"}
        </button>
      )}
    </div>
  )
}
