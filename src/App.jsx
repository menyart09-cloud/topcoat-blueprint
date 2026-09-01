import React, { useState, useRef, useCallback, useEffect } from 'react'

const ORANGE = '#0077B6'
const DARK   = '#1c1c2e'

// Quick-pick coating types for the Results screen — anything else can be typed in
const COATING_TYPES = ['Concrete Overlay', 'Epoxy', 'Granite Overlay', 'Rock Carpet', 'Rubber', 'Sealed Concrete', 'Stained Concrete']

const ROOM_COLORS = [
  { fill: 'rgba(255,80,80,0.35)',   border: '#e53935', solid: '#e53935' },
  { fill: 'rgba(33,150,243,0.35)',  border: '#1565c0', solid: '#1565c0' },
  { fill: 'rgba(76,175,80,0.35)',   border: '#2e7d32', solid: '#2e7d32' },
  { fill: 'rgba(255,193,7,0.35)',   border: '#f57f17', solid: '#f57f17' },
  { fill: 'rgba(156,39,176,0.35)',  border: '#6a1b9a', solid: '#6a1b9a' },
  { fill: 'rgba(255,138,0,0.35)',   border: '#e65100', solid: '#e65100' },
  { fill: 'rgba(0,188,212,0.35)',   border: '#006064', solid: '#006064' },
  { fill: 'rgba(233,30,99,0.35)',   border: '#880e4f', solid: '#880e4f' },
  { fill: 'rgba(139,195,74,0.35)',  border: '#33691e', solid: '#33691e' },
  { fill: 'rgba(63,81,181,0.35)',   border: '#1a237e', solid: '#1a237e' },
  { fill: 'rgba(255,87,34,0.35)',   border: '#bf360c', solid: '#bf360c' },
  { fill: 'rgba(0,150,136,0.35)',   border: '#004d40', solid: '#004d40' },
]

// ── Parse feet+inches ─────────────────────────────────────────
function parseFeetInches(str) {
  if (!str) return null
  str = str.trim()
  // Inches only: 144", 144in, 144 inches
  const inchesOnly = str.match(/^(\d+\.?\d*)\s*(?:"|in|inch|inches)$/i)
  if (inchesOnly) return parseFloat(inchesOnly[1]) / 12

  // Feet and inches: 28ft 2in, 28'2", 28-2, 28 2
  const feetInches = str.match(/^(\d+\.?\d*)\s*(?:ft|feet|')?\s*[-\s]\s*(\d+\.?\d*)\s*(?:in|inches|")?$/i)
  if (feetInches) return parseFloat(feetInches[1]) + parseFloat(feetInches[2]) / 12
  const ftIn2 = str.match(/^(\d+\.?\d*)\s*(?:ft|feet|')\s*(\d+\.?\d*)\s*(?:in|inches|")?$/i)
  if (ftIn2) return parseFloat(ftIn2[1]) + parseFloat(ftIn2[2]) / 12

  // Feet only with marker: 28ft, 28'
  const feetOnly = str.match(/^(\d+\.?\d*)\s*(?:ft|feet|')$/i)
  if (feetOnly) return parseFloat(feetOnly[1])

  // Plain decimal or integer (assumes feet)
  const decimal = parseFloat(str)
  if (!isNaN(decimal) && decimal > 0) return decimal
  return null
}

// ── Polygon area (shoelace, returns ft²) ─────────────────────
function polygonAreaFt(points, fracPerFt, aspectRatio) {
  if (points.length < 3) return 0
  const pts = points.map(p => ({ x: p.x / fracPerFt, y: (p.y / aspectRatio) / fracPerFt }))
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(area / 2)
}

// ── Polygon perimeter (returns ft) ───────────────────────────
function polygonPerimeterFt(points, fracPerFt, aspectRatio) {
  if (points.length < 2) return 0
  let perim = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const dx = (points[j].x - points[i].x) / fracPerFt
    const dy = (points[j].y - points[i].y) / (fracPerFt * aspectRatio)
    perim += Math.sqrt(dx*dx + dy*dy)
  }
  return perim
}

// ── Single wall's real-world length in feet — same formula as one
// iteration of polygonPerimeterFt, so it always agrees with the total ──
function edgeLengthFt(a, b, fracPerFt, aspectRatio) {
  const dx = (b.x - a.x) / fracPerFt
  const dy = (b.y - a.y) / (fracPerFt * aspectRatio)
  return Math.sqrt(dx*dx + dy*dy)
}

// ── Format feet as feet'-inches", matching how a print labels a dimension ──
function feetInchesLabel(ft) {
  let totalInches = Math.round(ft * 12)
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  return `${feet}'-${inches}"`
}

// ── Currency helpers, used by every dollar input in the app ──────
// Parses a currency STRING that may already be comma-formatted (e.g. a
// value the user has tabbed away from and had auto-formatted to
// "1,000.00") back into a plain number for math. Plain parseFloat stops
// at the first comma, silently truncating "1,000" down to 1 — this strips
// commas first so formatted values never corrupt a total.
function parseCurrency(str) {
  if (str == null) return NaN
  return parseFloat(String(str).replace(/,/g, ''))
}
// Formats a currency input's value on blur — pads to two decimals and
// adds thousands separators (10 -> 10.00, 1000 -> 1,000.00). Leaves
// non-numeric/empty input alone rather than forcing a value in.
function formatCurrencyOnBlur(value) {
  const n = parseCurrency(value)
  if (isNaN(n)) return value
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Nearest point on a line segment (for tap-to-insert-corner) ──
function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx-ax, aby = by-ay
  const apx = px-ax, apy = py-ay
  const abLenSq = abx*abx + aby*aby
  let t = abLenSq > 1e-12 ? (apx*abx + apy*aby) / abLenSq : 0
  t = Math.max(0, Math.min(1, t))
  const x = ax + abx*t, y = ay + aby*t
  const dx = px-x, dy = py-y
  return { x, y, dist: Math.sqrt(dx*dx + dy*dy), t }
}

// ── Splice a freeform detour into a polygon's boundary ──────────
// start/end are {edge, point} — edge is the index of the original edge the
// anchor point sits on. Replaces whichever of the two arcs between them is
// SHORTER (fewer original points) with the new detour chain, so a detour
// stays a local modification rather than accidentally replacing most of
// the room if it happens to close on a far-away edge.
function spliceDetourIntoPolygon(points, start, end, detourPoints) {
  const n = points.length
  if (start.edge === end.edge) {
    // Both anchors land on the same original edge — order them by how far
    // along that edge each one is, so the chain doesn't cross itself.
    const chain = start.t <= end.t
      ? [start.point, ...detourPoints, end.point]
      : [end.point, ...[...detourPoints].reverse(), start.point]
    const next = [...points]
    next.splice(start.edge + 1, 0, ...chain)
    return next
  }
  const forwardDist  = (end.edge - start.edge + n) % n
  const backwardDist = n - forwardDist
  if (forwardDist <= backwardDist) {
    // Keep the arc from end.edge+1 around to start.edge; the detour
    // replaces the (shorter) forward arc between them.
    const kept = []
    for (let k = (end.edge + 1) % n; ; k = (k + 1) % n) {
      kept.push(points[k])
      if (k === start.edge) break
    }
    return [...kept, start.point, ...detourPoints, end.point]
  } else {
    // Keep the arc from start.edge+1 around to end.edge; the detour
    // replaces the (shorter) backward arc, so it's spliced in reversed.
    const kept = []
    for (let k = (start.edge + 1) % n; ; k = (k + 1) % n) {
      kept.push(points[k])
      if (k === end.edge) break
    }
    return [...kept, end.point, ...[...detourPoints].reverse(), start.point]
  }
}

// ── Centroid ─────────────────────────────────────────────────
function centroid(points) {
  return {
    x: points.reduce((s,p)=>s+p.x,0) / points.length,
    y: points.reduce((s,p)=>s+p.y,0) / points.length
  }
}

// ── Compute a CSS transform that zooms/centers the Results-screen
// preview on a given room, so its doorways are visible while pricing
// perimeter product. Returns identity (no zoom) when room is null.
function getRoomZoomTransform(room, imgSize) {
  if (!room || !imgSize.w || !imgSize.h) return { scale: 1, tx: 0, ty: 0 }
  let minX=1, minY=1, maxX=0, maxY=0
  room.points.forEach(p => {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  })
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2
  const bboxW = (maxX-minX) || 0.05, bboxH = (maxY-minY) || 0.05
  const padding = 1.25 // room fills roughly the middle 80% of the frame — tight enough to clearly see doorways
  const scale = Math.min(Math.min(1/(bboxW*padding), 1/(bboxH*padding)), 8)
  return { scale: Math.max(scale, 1), tx: imgSize.w*(0.5-cx), ty: imgSize.h*(0.5-cy) }
}

// ── SVG points string ─────────────────────────────────────────
function toSvgPoints(points, w, h) {
  return points.map(p => `${p.x*w},${p.y*h}`).join(' ')
}

// ── Crosshair marker (plain CSS, rendered via ZoomableBlueprint's overlay) ──
// x,y are already true on-screen pixel coordinates (from toScreen), so sizes
// here are genuine fixed CSS pixels — no zoom-compensation math involved.
function renderCrosshairMarker(x, y, color, key, isFirst, label) {
  const arm = 11, thick = 1.8, halo = 4.4, dotR = 2.5
  return (
    <div key={key} style={{ position:'absolute', left:0, top:0 }}>
      <div style={{ position:'absolute', left:x-arm, top:y-halo/2, width:arm*2, height:halo, background:'#fff' }}/>
      <div style={{ position:'absolute', left:x-halo/2, top:y-arm, width:halo, height:arm*2, background:'#fff' }}/>
      <div style={{ position:'absolute', left:x-arm, top:y-thick/2, width:arm*2, height:thick, background:color }}/>
      <div style={{ position:'absolute', left:x-thick/2, top:y-arm, width:thick, height:arm*2, background:color }}/>
      <div style={{ position:'absolute', left:x-dotR, top:y-dotR, width:dotR*2, height:dotR*2, borderRadius:'50%', background:color, border:'1px solid #fff' }}/>
      {isFirst && (
        <div style={{ position:'absolute', left:x-arm*1.4, top:y-arm*1.4, width:arm*2.8, height:arm*2.8, borderRadius:'50%', border:`1.5px dashed ${color}` }}/>
      )}
      {label && (
        <div style={{ position:'absolute', left:x, top:y-arm*1.6, transform:'translate(-50%,-100%)', color, fontWeight:700, fontSize:13, whiteSpace:'nowrap', filter:'drop-shadow(0 1px 2px rgba(255,255,255,0.9))' }}>
          {label}
        </div>
      )}
    </div>
  )
}

// ── Move-corner marker (plain CSS, same overlay approach) ──────
function renderMoveCornerMarker(x, y, isSelected, key, accentColor) {
  const col = accentColor || '#00695c'
  if (!isSelected) {
    return (
      <div key={key} style={{ position:'absolute', left:x-5.5, top:y-5.5, width:11, height:11, borderRadius:'50%', background:col, border:'2px solid #fff' }}/>
    )
  }
  // Selected: hollow crosshair rather than a solid dot, so the blueprint
  // line underneath stays visible while nudging it into position. Kept
  // deliberately small, and the selection ring is faint, since this sits
  // directly over the exact spot you're trying to align to.
  const arm = 9, thick = 1.5
  return (
    <div key={key} style={{ position:'absolute', left:0, top:0 }}>
      <div style={{ position:'absolute', left:x-arm, top:y-thick/2, width:arm*2, height:thick+1.5, background:'#fff' }}/>
      <div style={{ position:'absolute', left:x-thick/2, top:y-arm, width:thick+1.5, height:arm*2, background:'#fff' }}/>
      <div style={{ position:'absolute', left:x-arm, top:y-thick/2, width:arm*2, height:thick, background:col }}/>
      <div style={{ position:'absolute', left:x-thick/2, top:y-arm, width:thick, height:arm*2, background:col }}/>
      <div style={{ position:'absolute', left:x-16, top:y-16, width:32, height:32, borderRadius:'50%', border:`1.5px dashed ${col}`, opacity:0.4 }}/>
    </div>
  )
}

// ── Edge hint marker (tap anywhere along the edge to add a corner there) ──
function renderEdgeHintMarker(x, y, key) {
  return (
    <div key={key} style={{ position:'absolute', left:x-6, top:y-6, width:12, height:12, borderRadius:'50%', background:'rgba(255,255,255,0.85)', border:'1.5px solid #f57f17' }}/>
  )
}

// ── Room name / sq ft / wall-length label sizes, specified in REAL-WORLD
// INCHES on the drawing — not screen pixels. This matches how Bluebeam
// Revu and AutoCAD size model-space text: a label height is a fixed
// measurement on the actual print, so it's automatically identical across
// every room (same inches everywhere) AND naturally grows/shrinks as you
// zoom in/out, proportionally with the walls and everything else on the
// drawing — rather than staying a constant screen size regardless of zoom.
// DEFAULT_LABEL_SIZE_INCHES is the starting value for the user-adjustable
// "Label Size" control — name/sq ft stay proportional multiples of it.
const DEFAULT_LABEL_SIZE_INCHES = 5
const NAME_TO_WALL_RATIO = 5.6 / 3.5
const SQFT_TO_WALL_RATIO = 4.2 / 3.5

// Converts a real-world inch height into a pixel font-size AT ZOOM=1 (i.e.
// against the image's own unscaled display width). Rendering this inside
// the zoom-transformed content lets the browser's own CSS transform do the
// proportional growth as the user zooms — the same mechanism the walls
// and room outlines already use.
function inchesToFontSize(inches, fracPerFt, imgWpx) {
  if (!fracPerFt) return 12
  const frac = (inches / 12) * fracPerFt
  // This floor used to be 4, back when this value WAS the literal on-screen
  // font-size. Now it's only an input to a transform:scale() factor (see
  // LABEL_BASE_PX below), so a floor that high silently clamped every
  // Label Size setting to the identical result on jobs with a small
  // fracPerFt (wide-scale blueprints) — the actual root cause of Label
  // Size appearing completely unresponsive on some jobs. Only guard
  // against exactly zero/negative here, not against small-but-real values.
  return Math.max(frac * imgWpx, 0.3)
}

// Room labels are rendered at this FIXED font-size, with the actual
// desired size applied via a CSS transform:scale() instead of varying
// font-size directly. Some mobile browsers (iOS Safari confirmed, per
// MDN's own "limited availability" note on text-size-adjust) apply their
// own "text inflation" to font-size — silently overriding whatever size
// was requested, independent of the DOM/React. A transform runs AFTER
// layout, purely visually, and isn't subject to that override at all —
// this sidesteps the unreliable browser behavior instead of fighting it.
const LABEL_BASE_PX = 24

// ── Derive name/sqft/wall label sizes (in real-world inches) from the
// single user-adjustable base value, keeping the same proportions.
function getLabelInches(labelSizeInches) {
  const wall = labelSizeInches || DEFAULT_LABEL_SIZE_INCHES
  return { name: wall * NAME_TO_WALL_RATIO, sqft: wall * SQFT_TO_WALL_RATIO, wall }
}

// ── Clamp a fractional image coordinate to [0,1] ────────────────
function clamp01(v) { return Math.min(1, Math.max(0, v)) }

// ── PDF to high-res image ─────────────────────────────────────
// ── Ensure pdf.js library is loaded (shared by all PDF rendering) ─
async function ensurePdfJs() {
  if (window.pdfjsLib) return
  await new Promise((res, rej) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = res
    script.onerror = () => rej(new Error('Could not load PDF renderer'))
    document.head.appendChild(script)
  })
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

// ── Render one page of a loaded pdf.js document to a data URL.
// maxDimension caps the longest output side — large architectural
// sheets (e.g. 36"x24" at high scale) were rendering to 40+ megapixel
// canvases with a fixed scale multiplier, which is far more detail
// than tracing ever needs and a real risk on memory-constrained
// devices. Scale is computed per-page so a small sheet still renders
// at full quality (never upscaled) while a large one gets capped. ──
async function renderPdfPageToDataUrl(pdfDoc, pageNum, maxDimension, quality = 0.95) {
  const page = await pdfDoc.getPage(pageNum)
  const baseViewport = page.getViewport({ scale: 1.0 })
  const longestSide = Math.max(baseViewport.width, baseViewport.height)
  const scale = Math.min(3.0, maxDimension / longestSide)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas.toDataURL('image/jpeg', quality)
}

// ── Load a PDF file. Single-page PDFs render immediately at full
// quality. Multi-page PDFs return low-res thumbnails of every page
// so the user can pick which one to import, plus the raw bytes so
// the chosen page can be re-rendered at full quality afterward. ──
async function pdfFileToPageInfo(file, onProgress) {
  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read PDF'))
    reader.onload = e => resolve(e.target.result)
    reader.readAsArrayBuffer(file)
  })
  await ensurePdfJs()
  // Pass a copy — pdf.js can transfer/detach the buffer it's given,
  // and we need the original bytes intact for re-rendering later.
  const pdfDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise

  if (pdfDoc.numPages <= 1) {
    const dataUrl = await renderPdfPageToDataUrl(pdfDoc, 1, 4000, 0.95)
    return { single: true, src: dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg', name: file.name, size: file.size, fromPdf: true }
  }

  const thumbnails = []
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const thumb = await renderPdfPageToDataUrl(pdfDoc, p, 500, 0.7)
    thumbnails.push({ pageNum: p, thumb })
    if (onProgress) onProgress(p, pdfDoc.numPages)
  }
  return { single: false, thumbnails, buffer: arrayBuffer, name: file.name, size: file.size }
}

// ── Re-render one specific page of an already-loaded PDF buffer,
// at full import quality (used once the user confirms their pick) ─
async function renderFullPdfPage(arrayBuffer, pageNum) {
  await ensurePdfJs()
  const pdfDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise
  const dataUrl = await renderPdfPageToDataUrl(pdfDoc, pageNum, 4000, 0.95)
  return { src: dataUrl, base64: dataUrl.split(',')[1] }
}

// ── AI room identifier ────────────────────────────────────────
async function identifyRoom(base64, mime, polygon) {
  const c = polygon.reduce((a,p)=>({x:a.x+p.x/polygon.length,y:a.y+p.y/polygon.length}),{x:0,y:0})
  const pts = polygon.map(p => `(${(p.x*100).toFixed(1)}%, ${(p.y*100).toFixed(1)}%)`).join(', ')
  const prompt = `You are analyzing a blueprint floor plan image.

A room has been traced with a polygon at these image coordinates (as % of image width/height):
Polygon points: ${pts}
Polygon center: (${(c.x*100).toFixed(1)}%, ${(c.y*100).toFixed(1)}%)

Your task: identify what room or space is at the CENTER of this polygon.

Instructions:
1. Look carefully at the text labels printed INSIDE or very near the center point
2. Common room labels include: Bedroom, Master Bedroom, Living Room, Kitchen, Bathroom, Garage, Dining Room, Office, Laundry, Utility, Foyer, Entry, Hall, Closet, Pantry, Bath, Porch, Court, Family Room
3. Read the exact text as written on the blueprint — preserve the capitalization
4. If you see a number (like "Bedroom 2"), include it
5. If no label is visible inside the polygon, look at nearby text

Respond ONLY with this JSON (no markdown, no explanation):
{"name": "Exact Room Name From Blueprint"}`

  try {
    const res = await fetch('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mime, customPrompt: prompt, mode: 'identify' })
    })
    const data = await res.json()
    return data?.name || 'Room'
  } catch { return 'Room' }
}

// ── Scan blueprint for all room names ────────────────────────
async function scanRoomNames(base64, mime) {
  const prompt = `Look carefully at this blueprint floor plan image.
Find and list ALL room names, space labels, and area names printed on it.
Include every labeled space you can see. For each one, also estimate its
position in the image as a fraction of width/height (0 to 1, top-left is 0,0)
— this is used later to match each name back to the right room.

Respond ONLY with JSON in this exact shape, no markdown:
{"rooms": [{"name": "Living Room", "x": 0.42, "y": 0.61}, {"name": "Kitchen", "x": 0.71, "y": 0.22}]}`

  try {
    const smallBase64 = await compressImage(base64, mime, 0.5)
    const res = await fetch('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: smallBase64, mime: 'image/jpeg', customPrompt: prompt, mode: 'roomlist' })
    })
    const data = await res.json()
    if (!res.ok) return null
    if (data && Array.isArray(data.rooms)) return data.rooms
    if (Array.isArray(data)) return data.map(n => (typeof n === 'string' ? { name: n, x: null, y: null } : n)) // legacy shape safety net
    return null
  } catch { return null }
}

// ── Reorder a cached {name,x,y} room-name list by proximity to a given
// room's centroid — this is what makes the AI's best-guess-first behavior
// work for EVERY room traced, not just the first, without a fresh API
// call per room. Entries with no position data sort to the middle rather
// than dominating either end.
function reorderNamesByProximity(scannedRooms, targetCentroid) {
  if (!scannedRooms || !targetCentroid) return (scannedRooms || []).map(r => r.name)
  return [...scannedRooms]
    .map(r => ({ ...r, _dist: (r.x == null || r.y == null) ? 0.5 : Math.hypot(r.x - targetCentroid.x, r.y - targetCentroid.y) }))
    .sort((a, b) => a._dist - b._dist)
    .map(r => r.name)
}

// ── EXIF orientation handling ─────────────────────────────────
// Historically, canvas ignored a photo's EXIF orientation tag even when
// an <img> displayed it correctly — the classic "landscape photo comes
// in rotated" bug. Verified directly against a real device-shot-style
// test image: current Chromium now applies EXIF orientation correctly
// for BOTH <img> decoding and canvas drawing, using the browser's own
// naturalWidth/naturalHeight (already-corrected) as the source of truth.
// So the fix isn't manually re-rotating — it's round-tripping every
// upload through a canvas once, at natural size, which normalizes the
// pixels and strips the EXIF tag entirely. This makes every screen
// downstream (Straighten, Calibrate, Draw, the saved report) consistent
// regardless of how any specific phone/app wrote that tag, and needs no
// per-orientation transform math at all.
async function fixImageOrientation(src, base64) {
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = src
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    const correctedSrc = canvas.toDataURL('image/jpeg', 0.92)
    return { src: correctedSrc, base64: correctedSrc.split(',')[1] }
  } catch {
    return { src, base64 } // if anything goes wrong, fall back to the original rather than break the upload
  }
}

// ── Manual 90° rotation — the fallback for cases automatic EXIF
// correction can't catch (stripped metadata, screenshots, etc.).
// Rotates clockwise each call; call four times to return to start.
async function rotateImage90(src) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalHeight
  canvas.height = img.naturalWidth
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  return canvas.toDataURL('image/jpeg', 0.92)
}

// Compress image to reduce file size for API calls
async function compressImage(base64, mime, quality = 0.5) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // Scale down to max 1200px wide
      const maxW = 1200
      const scale = Math.min(1, maxW / img.width)
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const compressed = canvas.toDataURL('image/jpeg', quality)
      resolve(compressed.split(',')[1])
    }
    img.onerror = () => resolve(base64)
    img.src = `data:${mime};base64,${base64}`
  })
}

// ── Largest axis-aligned rect inscribed in a rotated W×H image ─
// Standard rotate-and-crop formula: after rotating a w×h rect by
// angle `a`, returns the biggest same-orientation rectangle that
// contains no blank corner pixels.
function largestInscribedRect(w, h, angleRad) {
  let a = Math.abs(angleRad) % Math.PI
  if (a > Math.PI / 2) a = Math.PI - a
  const widthIsLonger = w >= h
  const longSide  = widthIsLonger ? w : h
  const shortSide = widthIsLonger ? h : w
  const sinA = Math.sin(a), cosA = Math.cos(a)
  if (shortSide <= 2 * sinA * cosA * longSide || Math.abs(sinA - cosA) < 1e-10) {
    // Half-constrained case: crop touches the two long sides only
    const x = 0.5 * shortSide
    return widthIsLonger ? { w: x / sinA, h: x / cosA } : { w: x / cosA, h: x / sinA }
  }
  // Fully-constrained case: crop touches all four sides
  const cos2a = cosA * cosA - sinA * sinA
  return {
    w: (w * cosA - h * sinA) / cos2a,
    h: (h * cosA - w * sinA) / cos2a
  }
}

// ── Rotate image to level a tapped line, then crop off blank corners ─
async function straightenAndCropImage(src, angleRad) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight
        const cos = Math.cos(angleRad), sin = Math.sin(angleRad)
        const absCos = Math.abs(cos), absSin = Math.abs(sin)

        // Canvas big enough to hold the fully rotated image
        const boundW = Math.ceil(W * absCos + H * absSin)
        const boundH = Math.ceil(W * absSin + H * absCos)
        const rotCanvas = document.createElement('canvas')
        rotCanvas.width = boundW
        rotCanvas.height = boundH
        const rctx = rotCanvas.getContext('2d')
        rctx.translate(boundW / 2, boundH / 2)
        rctx.rotate(angleRad)
        rctx.drawImage(img, -W / 2, -H / 2, W, H)

        // Crop to the largest rect with no blank corners
        const { w: cropWf, h: cropHf } = largestInscribedRect(W, H, angleRad)
        const cw = Math.max(1, Math.floor(Math.min(cropWf, boundW)))
        const ch = Math.max(1, Math.floor(Math.min(cropHf, boundH)))
        const cx = Math.floor((boundW - cw) / 2)
        const cy = Math.floor((boundH - ch) / 2)

        const outCanvas = document.createElement('canvas')
        outCanvas.width = cw
        outCanvas.height = ch
        outCanvas.getContext('2d').drawImage(rotCanvas, cx, cy, cw, ch, 0, 0, cw, ch)

        const dataUrl = outCanvas.toDataURL('image/jpeg', 0.94)
        resolve({ src: dataUrl, base64: dataUrl.split(',')[1], naturalWidth: cw, naturalHeight: ch })
      } catch (err) { reject(err) }
    }
    img.onerror = () => reject(new Error('Could not load image for straightening'))
    img.src = src
  })
}

// ── Save blueprint image to photo album ───────────────────────
async function saveToPhotos(canvasEl, jobName) {
  const filename = `${(jobName||'TopCoat').replace(/[^a-zA-Z0-9]/g,'-')}-Report.jpg`

  // Build blob from canvas using toDataURL (more iOS-compatible than toBlob)
  const dataUrl = canvasEl.toDataURL('image/jpeg', 0.92)
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  const u8arr = new Uint8Array(bstr.length)
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
  const blob = new Blob([u8arr], { type: mime })
  const file = new File([blob], filename, { type: mime })

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // Mobile: use Web Share API so the file can be saved to Photos/Gallery —
  // but only if the browser actually supports sharing FILES specifically.
  // Some browsers (notably a handful of Android ones) expose navigator.share
  // for text/links only, without file support, which would otherwise throw
  // here instead of falling through to the direct-download path below.
  const canShareFile = isMobile && navigator.canShare && navigator.canShare({ files: [file] })
  if (canShareFile) {
    await navigator.share({ files: [file], title: jobName || 'TopCoat Blueprint' })
    return
  }

  // Desktop: direct download to Downloads folder — no popup
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── Auto-save an in-app camera capture to the phone's photo library ──
// Unlike a report (which is generated fresh), a captured blueprint photo
// is already just an image — this reuses saveToPhotos as-is (via a
// throwaway canvas) rather than duplicating its already-tested
// share/download logic. Only meant for photos taken WITH the app's
// camera button, not files picked from an existing library — those
// already live there. Failure here is non-critical: the photo is still
// usable inside the app either way, so this never blocks the upload.
async function savePhotoToLibrary(src, jobName) {
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = src
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    await saveToPhotos(canvas, jobName ? `${jobName}-Blueprint` : 'TopCoat-Blueprint')
  } catch (e) {
    console.error('Could not save captured photo to library:', e)
  }
}

// ── Header ────────────────────────────────────────────────────
function Header({ screen, onBack, onReset }) {
  const showBack  = screen !== 'upload'
  const showReset = screen !== 'upload'
  return (
    <div style={{ background: DARK, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 100 }}>
      {showBack && (
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>←</button>
      )}
      <img src="/icon-512.png" alt="TopCoat" style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, objectFit: 'cover' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>TopCoat Tech Estimator</div>
        <div style={{ color: '#888', fontSize: 10 }}>Draw room overlays · AI calculates sq footage</div>
      </div>
      {showReset && (
        <button onClick={onReset} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>↺</button>
      )}
    </div>
  )
}

// ── Upload Screen ─────────────────────────────────────────────
function UploadScreen({ onFile, error, converting, convertProgress, jobName, setJobName }) {
  const [drag, setDrag] = useState(false)
  const uploadRef = useRef()
  const cameraRef = useRef()

  async function handleFiles(files, fromCamera) {
    const file = files[0]
    if (!file) return
    if (file.name?.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      onFile({ loading: true })
      try {
        const info = await pdfFileToPageInfo(file, (current, total) => onFile({ loading: true, progress: { current, total } }))
        if (info.single) {
          onFile({ src: info.src, base64: info.base64, mime: info.mime, name: info.name, size: info.size, fromPdf: true })
        } else {
          onFile({ needsPageSelect: true, thumbnails: info.thumbnails, buffer: info.buffer, name: info.name, size: info.size })
        }
      }
      catch (err) { onFile({ error: err.message }) }
      return
    }
    let mime = file.type || ''
    if (!mime || mime === 'application/octet-stream') {
      const ext = (file.name||'').split('.').pop().toLowerCase()
      const map = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',heic:'image/jpeg',heif:'image/jpeg' }
      mime = map[ext] || 'image/jpeg'
    }
    const reader = new FileReader()
    reader.onerror = () => onFile({ error: 'Could not read file.' })
    reader.onload = async e => {
      const rawSrc = e.target.result
      const rawBase64 = rawSrc.split(',')[1]
      if (!rawBase64 || rawBase64.length < 200) { onFile({ error: 'Image appears empty.' }); return }
      // Correct for EXIF orientation now, once, so every screen downstream
      // (Straighten, Calibrate, Draw, the saved report) works with an
      // already-correctly-oriented image and never has to think about it.
      const { src, base64 } = await fixImageOrientation(rawSrc, rawBase64)
      onFile({ src, base64, mime, name: file.name, size: file.size })
      // Photos taken WITH the app's camera only exist inside the app
      // otherwise — back them up to the phone's own photo library too,
      // using the already-corrected orientation. Files picked from an
      // existing library already live there, so this only fires for
      // fresh captures. Runs in the background; never blocks the upload.
      if (fromCamera) savePhotoToLibrary(src, jobName)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Job Name */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,color:'#222',marginBottom:8}}>Job Name</div>
        <input type="text" value={jobName} onChange={e=>setJobName(e.target.value)}
          placeholder="e.g. Smith Residence, 123 Main St"
          style={{width:'100%',padding:'10px 14px',fontSize:15,border:'2px solid #ddd',borderRadius:8,outline:'none',boxSizing:'border-box'}} />
      </div>

      <button onClick={() => cameraRef.current?.click()} style={{ width:'100%', padding:'16px', background:ORANGE, color:'#fff', border:'none', borderRadius:14, fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:12, boxShadow:'0 4px 16px rgba(0,119,182,0.35)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        Take a Photo
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => handleFiles(e.target.files, true)} />

      <div onClick={() => !converting && uploadRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files)}}
        style={{ border:`2px dashed ${drag?ORANGE:'#ccc'}`, borderRadius:14, padding:'24px 20px', textAlign:'center', cursor:converting?'wait':'pointer', background:drag?'#f0faff':'#fff' }}>
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,.pdf,application/pdf" style={{ display:'none' }} onChange={e=>handleFiles(e.target.files)} />
        {converting ? (
          convertProgress ? (
            <>
              <div style={{width:36,height:36,border:'3px solid #e0e0e0',borderTop:`3px solid ${ORANGE}`,borderRadius:'50%',margin:'0 auto 14px',animation:'spin 0.8s linear infinite'}}/>
              <div style={{fontWeight:600,fontSize:14,color:'#222',marginBottom:10}}>Generating previews — page {convertProgress.current} of {convertProgress.total}</div>
              <div style={{width:'100%',height:8,background:'#e8e8e8',borderRadius:4,overflow:'hidden'}}>
                <div style={{width:`${(convertProgress.current/convertProgress.total)*100}%`,height:'100%',background:ORANGE,borderRadius:4,transition:'width 0.2s'}}/>
              </div>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </>
          ) : (
            <><div style={{fontSize:28,marginBottom:8}}>⏳</div><div style={{fontWeight:600,fontSize:14,color:'#222'}}>Converting PDF…</div></>
          )
        ) : (
          <><div style={{fontSize:32,marginBottom:8}}>📄</div><div style={{fontWeight:600,fontSize:14,color:'#222',marginBottom:4}}>Upload Blueprint</div><div style={{fontSize:13,color:'#999'}}>PDF · JPG · PNG · WEBP</div><div style={{marginTop:8,display:'inline-block',background:'#e0f0f8',color:'#005f8a',borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:600}}>✓ PDF supported</div></>
        )}
      </div>
      {error && <div style={{marginTop:12,background:'#fdecea',border:'1px solid #f5c6c6',borderRadius:8,padding:'12px 14px',color:'#c62828',fontSize:13}}>⚠️ {error}</div>}
      <div style={{marginTop:16,background:'#fff',borderRadius:12,padding:'14px 16px',border:'1px solid #e8e8e8'}}>
        <div style={{fontWeight:600,fontSize:13,color:'#444',marginBottom:8}}>How it works</div>
        <div style={{fontSize:13,color:'#666',lineHeight:1.8}}>
          1️⃣ Enter job name · Upload blueprint<br/>
          2️⃣ Set scale by tapping a known dimension<br/>
          3️⃣ Trace each room by tapping corners<br/>
          4️⃣ AI names rooms · Sq footage auto-calculates<br/>
          5️⃣ Save results to your photo album
        </div>
      </div>
    </div>
  )
}

// ── ZoomableBlueprint ─────────────────────────────────────────
// Handles pinch-to-zoom + pan on mobile, Ctrl+wheel zoom + drag-pan on desktop.
// Exposes centerOn(xAtZoom1, yAtZoom1, targetZoom) via ref for programmatic
// centering (used by Move Corner to auto-center/zoom on a selected corner).
const ZoomableBlueprint = React.forwardRef(function ZoomableBlueprint({ onTap, children, style, onZoomChange, renderOverlay, initialView, onViewChange, debug }, ref) {
  const debugCounts = useRef({ touchStart: 0, touchMove1: 0, touchMove2: 0, mouseDown: 0, mouseMove: 0 })
  const [, forceDebugUpdate] = useState(0)
  const containerRef = useRef()
  const contentRef   = useRef() // unscaled wrapper around children — used to measure natural (zoom=1) size
  const lastTouchRef  = useRef(null)
  const pinchRef      = useRef(null)
  const singleDragRef = useRef(null) // single-finger drag-to-pan on touch (previously handled for free by native scroll)

  // The "true" pan/zoom state, tracked EXACTLY in JS memory and only ever
  // WRITTEN to the screen via a CSS transform — never read back from the
  // DOM. This is what fixes the drift-toward-a-corner bug: browsers
  // silently round scrollLeft/scrollTop to the nearest physical pixel
  // (confirmed via W3C discussion to be inconsistent and device-dependent
  // — e.g. a device with a 2.625 pixel ratio can turn scrollTo(0,20) into
  // 19.8). Reading that already-rounded value back to compute the NEXT
  // step compounds tiny errors over a multi-step pinch gesture. Keeping
  // our own exact numbers breaks that feedback loop entirely.
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 })
  const [, bump] = useState(0)
  const rerender = () => bump(v => v + 1)

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [baseSize, setBaseSize] = useState({ w: 0, h: 0 }) // content's natural (zoom=1) size, for clamping — 0 means "not yet measured"
  const appliedInitialView = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const roContainer = new ResizeObserver(() => setContainerSize({ w: container.clientWidth, h: container.clientHeight }))
    roContainer.observe(container)
    const roContent = new ResizeObserver(() => setBaseSize({ w: content.offsetWidth, h: content.offsetHeight }))
    roContent.observe(content)
    return () => { roContainer.disconnect(); roContent.disconnect() }
  }, [])

  // Keeps pan within the content's own edges — never shows blank space
  // beyond the image — while centering content that's narrower or
  // shorter than the container rather than pinning it to a corner.
  function clampView(zoom, panX, panY) {
    const cw = containerSize.w, ch = containerSize.h
    const contentW = baseSize.w * zoom, contentH = baseSize.h * zoom
    let minX, maxX, minY, maxY
    if (contentW <= cw) { minX = maxX = (cw - contentW) / 2 }
    else { minX = cw - contentW; maxX = 0 }
    if (contentH <= ch) { minY = maxY = (ch - contentH) / 2 }
    else { minY = ch - contentH; maxY = 0 }
    return {
      zoom,
      panX: Math.min(Math.max(panX, minX), maxX),
      panY: Math.min(Math.max(panY, minY), maxY)
    }
  }

  function setView(zoom, panX, panY) {
    const clamped = clampView(zoom, panX, panY)
    viewRef.current = clamped
    rerender()
    if (onZoomChange) onZoomChange(clamped.zoom)
    if (onViewChange && containerSize.w > 0 && baseSize.w > 0) {
      // Report WHERE we're centered as a fraction of the image (0-1), not
      // raw pixels — this is what makes it possible to restore "roughly
      // the same spot you were looking at" on a totally different screen,
      // even when Straighten has changed the image's actual pixel
      // dimensions in between (its rotate+crop step).
      const fx = (containerSize.w / 2 - clamped.panX) / (clamped.zoom * baseSize.w)
      const fy = (containerSize.h / 2 - clamped.panY) / (clamped.zoom * baseSize.h)
      onViewChange({ zoom: clamped.zoom, fx, fy })
    }
  }

  // Apply an incoming fractional view (from a previous screen) exactly
  // once, as soon as we've actually measured our own container/content —
  // not on every later resize, which would fight the user's own panning.
  useEffect(() => {
    if (appliedInitialView.current) return
    if (!containerSize.w || !baseSize.w) return
    appliedInitialView.current = true
    if (initialView && initialView.zoom > 1.01) {
      const z = Math.min(Math.max(initialView.zoom, 1), 12)
      const panX = containerSize.w / 2 - initialView.fx * baseSize.w * z
      const panY = containerSize.h / 2 - initialView.fy * baseSize.h * z
      const clamped = clampView(z, panX, panY)
      viewRef.current = clamped
      rerender()
      if (onZoomChange) onZoomChange(clamped.zoom)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, baseSize.w, baseSize.h])

  // Converts a fractional image coordinate (0-1) into true on-screen pixel
  // coordinates, using only our own exact JS-tracked view state — no DOM
  // reads, so overlay markers can never inherit any rounding drift either.
  function toScreen(fx, fy, imgW, imgH) {
    const v = viewRef.current
    return { x: fx * imgW * v.zoom + v.panX, y: fy * imgH * v.zoom + v.panY }
  }

  React.useImperativeHandle(ref, () => ({
    centerOn(xAtZoom1, yAtZoom1, targetZoom) {
      const z = Math.min(Math.max(targetZoom, 1), 12)
      const panX = containerSize.w / 2 - xAtZoom1 * z
      const panY = containerSize.h / 2 - yAtZoom1 * z
      setView(z, panX, panY)
    },
    getView() { return viewRef.current },
    nudge() {
      // Forces a fresh repaint/re-composite of the transformed layer.
      // Needed because some browsers don't reliably re-rasterize sharply
      // when content changes INSIDE an already-transformed layer without
      // the transform value itself changing (confirmed WebKit bug #27684
      // — "composited elements appear pixelated when scaled up using
      // transform" — plus a similar Chrome rasterization-caching
      // behavior). An imperceptible, immediately-reverted pan change
      // forces the browser to recognize "the transform changed" and
      // re-render at full sharpness, without any visible jump.
      const v = viewRef.current
      viewRef.current = { ...v, panX: v.panX + 0.01 }
      rerender()
      requestAnimationFrame(() => {
        viewRef.current = v
        rerender()
      })
    }
  }))

  function onTouchStart(e) {
    debugCounts.current.touchStart++
    if (debug) forceDebugUpdate(n => n + 1)
    if (e.touches.length === 2) {
      pinchRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastTouchRef.current = null
      singleDragRef.current = null
    } else if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() }
      singleDragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      pinchRef.current = null
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current !== null) {
      debugCounts.current.touchMove2++
      e.preventDefault()
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const delta = newDist / pinchRef.current
      const v = viewRef.current
      const oldZoom = v.zoom
      const newZoom = Math.min(Math.max(oldZoom * delta, 1), 12)

      const container = containerRef.current
      if (container && newZoom !== oldZoom) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        const rect = container.getBoundingClientRect()
        const screenX = midX - rect.left, screenY = midY - rect.top
        const ratio = newZoom / oldZoom
        // Exact zoom-toward-point formula, using only our own tracked pan
        // (never scrollLeft/scrollTop): newPan = screen*(1-ratio) + oldPan*ratio
        const newPanX = screenX * (1 - ratio) + v.panX * ratio
        const newPanY = screenY * (1 - ratio) + v.panY * ratio
        setView(newZoom, newPanX, newPanY)
      }
      pinchRef.current = newDist
      lastTouchRef.current = null
      singleDragRef.current = null
    } else if (e.touches.length === 1 && singleDragRef.current) {
      debugCounts.current.touchMove1++
      const t = e.touches[0]
      const v = viewRef.current
      // Always move the view — tap vs. drag is already correctly decided
      // by actual pointer movement (the 12px threshold below), and
      // clampView (inside setView) already prevents panning past the
      // content's own edges. A separate "is there room to pan" prediction
      // here was solving a problem that was already solved elsewhere,
      // while repeatedly causing its own bugs (stale size measurements,
      // interactions with aspect-ratio-based sizing, a touch/mouse gap).
      e.preventDefault()
      const dx = t.clientX - singleDragRef.current.x
      const dy = t.clientY - singleDragRef.current.y
      setView(v.zoom, v.panX + dx, v.panY + dy)
      singleDragRef.current = { x: t.clientX, y: t.clientY }
      if (lastTouchRef.current) {
        const dx2 = Math.abs(t.clientX - lastTouchRef.current.x)
        const dy2 = Math.abs(t.clientY - lastTouchRef.current.y)
        if (dx2 > 12 || dy2 > 12) lastTouchRef.current = null // moved too far to still be a tap
      }
    }
  }

  function onTouchEnd(e) {
    if (debug) forceDebugUpdate(n => n + 1)
    if (pinchRef.current !== null) { pinchRef.current = null; singleDragRef.current = null; return }
    singleDragRef.current = null
    if (!lastTouchRef.current) return
    const t = e.changedTouches[0]
    const dx = Math.abs(t.clientX - lastTouchRef.current.x)
    const dy = Math.abs(t.clientY - lastTouchRef.current.y)
    const dt = Date.now() - lastTouchRef.current.time
    if (dx < 12 && dy < 12 && dt < 400) {
      onTap && onTap({ clientX: t.clientX, clientY: t.clientY })
    }
    lastTouchRef.current = null
  }

  // Desktop: Ctrl+wheel (or trackpad pinch) = zoom toward cursor
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onWheel(e) {
      if (!e.ctrlKey) return // let the browser handle normal scroll = pan
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top
      const v = viewRef.current
      const delta = e.deltaY > 0 ? 0.85 : 1.18
      const oldZoom = v.zoom
      const newZoom = Math.min(Math.max(oldZoom * delta, 1), 12)
      if (newZoom === oldZoom) return
      const ratio = newZoom / oldZoom
      const newPanX = screenX * (1 - ratio) + v.panX * ratio
      const newPanY = screenY * (1 - ratio) + v.panY * ratio
      setView(newZoom, newPanX, newPanY)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
    // Re-attach (fresh closure) whenever the measured sizes actually change —
    // otherwise this effect's empty deps would permanently freeze onWheel's
    // view of containerSize/baseSize at 0,0 (their value before the
    // ResizeObserver ever fires), silently breaking zoom-toward-cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, baseSize.w, baseSize.h])

  // Desktop drag-to-pan (left mouse button)
  const isDragging = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })
  const dragMoved  = useRef(false)

  function onMouseDown(e) {
    if (e.button !== 0) return
    debugCounts.current.mouseDown++
    if (debug) forceDebugUpdate(n => n + 1)
    // Always start tracking a potential drag — tap vs. drag is already
    // correctly decided by actual mouse movement (dragMoved, checked in
    // onClick below), and clampView (inside setView) already prevents
    // panning past the content's own edges. Predicting in advance
    // whether there's "somewhere to pan to" was solving an
    // already-solved problem, while repeatedly causing its own bugs.
    isDragging.current = true
    dragMoved.current = false
    lastMouse.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  function onMouseMove(e) {
    if (!isDragging.current) return
    debugCounts.current.mouseMove++
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true
    const v = viewRef.current
    setView(v.zoom, v.panX + dx, v.panY + dy)
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  function onMouseUp() {
    isDragging.current = false
    if (debug) forceDebugUpdate(n => n + 1)
  }

  const view = viewRef.current
  return (
    <div style={{ position:'relative', height:'100%', ...style }}>
    <div ref={containerRef}
      style={{
        overflow: 'hidden',
        background: '#111',
        position: 'relative',
        cursor: 'grab',
        touchAction: 'none', // we handle all pan/zoom ourselves now — no native scroll involved at all
        height: '100%',
        width: '100%'
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={e => {
        // Ignore click if we just finished a real drag
        if (dragMoved.current) { dragMoved.current = false; return }
        if (!('ontouchstart' in window)) onTap && onTap(e)
      }}
    >
      <div ref={contentRef} style={{
        transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom}) translateZ(0)`,
        transformOrigin: 'top left',
        transition: 'none',
        position: 'absolute',
        top: 0, left: 0,
        width: '100%',
        imageRendering: 'high-quality',
        WebkitImageRendering: 'high-quality',
      }}>
        {children}
      </div>
    </div>
    {/* Overlay lives OUTSIDE the scrolling/transformed subtree, as a sibling
        covering the same box — so it always matches the visible viewport
        regardless of scroll position, and markers inside it use plain pixel
        positioning rather than inheriting the content's CSS transform. */}
    {renderOverlay && (
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {renderOverlay(toScreen)}
      </div>
    )}
    {debug && (
      <div style={{
        position:'absolute', top:4, left:4, zIndex:999, pointerEvents:'none',
        background:'rgba(0,0,0,0.85)', color:'#0f0', fontFamily:'monospace', fontSize:11,
        padding:'6px 8px', borderRadius:4, lineHeight:1.5, whiteSpace:'pre'
      }}>
{`touchStart: ${debugCounts.current.touchStart}
touchMove(1 finger): ${debugCounts.current.touchMove1}
touchMove(2 finger): ${debugCounts.current.touchMove2}
mouseDown: ${debugCounts.current.mouseDown}
mouseMove: ${debugCounts.current.mouseMove}
zoom: ${(view.zoom ?? NaN).toFixed(3)}
panX: ${(view.panX ?? NaN).toFixed(1)}
panY: ${(view.panY ?? NaN).toFixed(1)}
container: ${(containerSize.w ?? NaN).toFixed(0)}x${(containerSize.h ?? NaN).toFixed(0)}
baseSize: ${(baseSize.w ?? NaN).toFixed(0)}x${(baseSize.h ?? NaN).toFixed(0)}`}
      </div>
    )}
    </div>
  )
})

// ── PDF Page Picker ────────────────────────────────────────────
// Shown only for multi-page PDFs. Scroll the list, tap a page to
// select it (tap again to deselect), then confirm explicitly —
// nothing imports until the button is pressed.
function PdfPageScreen({ thumbnails, buffer, pdfName, pdfSize, jobName, onImported }) {
  const [selected, setSelected]   = useState(null)
  const [importing, setImporting] = useState(false)
  const [err, setErr]             = useState('')

  function toggle(pageNum) {
    if (importing) return
    setSelected(p => p === pageNum ? null : pageNum)
  }

  async function handleConfirm() {
    if (selected == null || importing) return
    setImporting(true); setErr('')
    try {
      const res = await renderFullPdfPage(buffer, selected)
      onImported({ src: res.src, base64: res.base64, mime: 'image/jpeg', name: pdfName, size: pdfSize, fromPdf: true })
    } catch (e) {
      setErr('Could not import that page — try again.')
      setImporting(false)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background:DARK,padding:'9px 16px',display:'flex',alignItems:'center',gap:8}}>
        {jobName && <span style={{color:ORANGE,fontSize:11,fontWeight:700,flexShrink:0}}>{jobName}</span>}
        <span style={{color:'#fff',fontWeight:600,fontSize:14}}>📄 This PDF has {thumbnails.length} pages — tap the one to import</span>
      </div>

      <div style={{flex:1,minHeight:0,overflowY:'auto',padding:'12px',WebkitOverflowScrolling:'touch'}}>
        {thumbnails.map(({ pageNum, thumb }) => {
          const isSel = selected === pageNum
          return (
            <div key={pageNum} onClick={()=>toggle(pageNum)}
              style={{
                position:'relative', marginBottom:14, borderRadius:12, overflow:'hidden', cursor:'pointer',
                border:`3px solid ${isSel?ORANGE:'#e0e0e0'}`,
                boxShadow: isSel ? '0 4px 14px rgba(0,119,182,0.35)' : '0 1px 4px rgba(0,0,0,0.08)',
                background:'#fff'
              }}>
              <img src={thumb} alt={`Page ${pageNum}`} style={{width:'100%',display:'block',maxHeight:340,objectFit:'contain',background:'#f4f4f2'}} draggable={false} />
              <div style={{position:'absolute',top:8,left:8,background:isSel?ORANGE:'rgba(0,0,0,0.55)',color:'#fff',fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:6}}>
                Page {pageNum}
              </div>
              {isSel && (
                <div style={{position:'absolute',top:8,right:8,width:26,height:26,borderRadius:'50%',background:ORANGE,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:800,boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}>✓</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{padding:'10px 12px',background:'#f4f4f2',borderTop:'1px solid #e0e0e0',flexShrink:0}}>
        {err && <div style={{fontSize:12,color:'#c62828',marginBottom:8}}>{err}</div>}
        <button onClick={handleConfirm} disabled={selected==null || importing}
          style={{width:'100%',padding:'13px',background:(selected==null||importing)?'#ccc':ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:(selected==null||importing)?'not-allowed':'pointer',boxShadow:(selected==null||importing)?'none':'0 4px 14px rgba(0,119,182,0.35)'}}>
          {importing ? 'Importing Page…' : selected==null ? 'Select a page above' : `Import Page ${selected} →`}
        </button>
      </div>
    </div>
  )
}

// ── Straighten Screen ─────────────────────────────────────────
// Optional. Tap two points along a line that should be level (e.g. a
// wall edge), and the photo gets rotated so that line runs horizontal.
// Skippable — most uploads (especially PDFs) won't need this.
// Lets the user trim the photo down to just the floor plan before
// straightening/calibrating — extraneous content (notes sections, title
// blocks, legends) otherwise shares the same calibrated scale as the
// actual floor plan, wasting effective precision on pixels that were
// never going to be traced anyway. Crop box is tracked as a fraction of
// the image (0-1), independent of display size, using pointer events so
// mouse and touch share one code path rather than two separately
// maintained ones.
function CropScreen({ image, onDone, onSkip }) {
  const imgRef = useRef()
  const blueprintCtrlRef = useRef()
  const overlayElRef = useRef() // shares position/size with ZoomableBlueprint's own container
  const [imgSize, setImgSize] = useState({ w: 300, h: 400 })
  const [box, setBox] = useState({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 })
  const boxRef = useRef(box)
  boxRef.current = box
  const activeHandle = useRef(null)
  const MIN_SIZE = 0.08

  useEffect(() => {
    const update = () => { if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Converts a pointer position into a fractional image coordinate,
  // accounting for the current zoom/pan — the inverse of ZoomableBlueprint's
  // own toScreen(). Needed because the crop handles must track correctly
  // no matter how far the user has zoomed or panned to see part of a wide
  // or tall blueprint that doesn't fit on screen at 1x.
  function clientToFraction(clientX, clientY) {
    const view = blueprintCtrlRef.current?.getView()
    const rect = overlayElRef.current?.getBoundingClientRect()
    if (!view || !rect) return { x: 0, y: 0 }
    const screenX = clientX - rect.left, screenY = clientY - rect.top
    const fx = (screenX - view.panX) / (view.zoom * imgSize.w)
    const fy = (screenY - view.panY) / (view.zoom * imgSize.h)
    return { x: Math.max(0, Math.min(1, fx)), y: Math.max(0, Math.min(1, fy)) }
  }

  function onHandleDown(handle, e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    activeHandle.current = handle
  }

  function onHandleMove(handle, e) {
    if (activeHandle.current !== handle) return
    e.preventDefault()
    const { x, y } = clientToFraction(e.clientX, e.clientY)
    const b = boxRef.current
    let next = { ...b }
    if (handle === 'tl') { next.w = b.x + b.w - x; next.h = b.y + b.h - y; next.x = x; next.y = y }
    if (handle === 'tr') { next.w = x - b.x; next.h = b.y + b.h - y; next.y = y }
    if (handle === 'bl') { next.w = b.x + b.w - x; next.x = x; next.h = y - b.y }
    if (handle === 'br') { next.w = x - b.x; next.h = y - b.y }
    if (next.w < MIN_SIZE) { if (handle === 'tl' || handle === 'bl') next.x = b.x + b.w - MIN_SIZE; next.w = MIN_SIZE }
    if (next.h < MIN_SIZE) { if (handle === 'tl' || handle === 'tr') next.y = b.y + b.h - MIN_SIZE; next.h = MIN_SIZE }
    next.x = Math.max(0, next.x); next.y = Math.max(0, next.y)
    if (next.x + next.w > 1) next.w = 1 - next.x
    if (next.y + next.h > 1) next.h = 1 - next.y
    boxRef.current = next
    setBox(next)
  }

  function onHandleUp(handle, e) {
    if (activeHandle.current === handle) activeHandle.current = null
  }

  function handleCropContinue() {
    const img = imgRef.current
    const b = boxRef.current
    const naturalW = img.naturalWidth, naturalH = img.naturalHeight
    const sx = b.x * naturalW, sy = b.y * naturalH, sw = b.w * naturalW, sh = b.h * naturalH
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw); canvas.height = Math.round(sh)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const newSrc = canvas.toDataURL('image/jpeg', 0.92)
    onDone({ src: newSrc, base64: newSrc.split(',')[1] })
  }

  const handles = ['tl', 'tr', 'bl', 'br']
  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 60px)'}}>
      <div style={{padding:'10px 14px',background:'#5b3fa8',color:'#fff',fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        ✂️ CROP — pinch to zoom, drag corners to trim the photo
      </div>
      <ZoomableBlueprint ref={blueprintCtrlRef} style={{height:'auto',minHeight:0,maxHeight:'75vh',maxWidth:1000,width:'100%',margin:'0 auto',aspectRatio:imgSize.w&&imgSize.h?`${imgSize.w} / ${imgSize.h}`:'4 / 3'}}
        renderOverlay={toScreen => {
          const tl = toScreen(box.x, box.y, imgSize.w, imgSize.h)
          const br = toScreen(box.x+box.w, box.y+box.h, imgSize.w, imgSize.h)
          const cropW = br.x - tl.x, cropH = br.y - tl.y
          return (
            <div ref={overlayElRef} style={{position:'absolute', inset:0}}>
              <svg style={{position:'absolute', inset:0, width:'100%', height:'100%'}}>
                <defs>
                  <mask id="cropmask">
                    <rect x="0" y="0" width="100%" height="100%" fill="#fff"/>
                    <rect x={tl.x} y={tl.y} width={cropW} height={cropH} fill="#000"/>
                  </mask>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#cropmask)"/>
                <rect x={tl.x} y={tl.y} width={cropW} height={cropH} fill="none" stroke="#fff" strokeWidth="2"/>
              </svg>
              {handles.map(h => {
                const hx = h.includes('l') ? tl.x : br.x
                const hy = h.includes('t') ? tl.y : br.y
                return (
                  <div key={h}
                    onPointerDown={e => onHandleDown(h, e)}
                    onPointerMove={e => onHandleMove(h, e)}
                    onPointerUp={e => onHandleUp(h, e)}
                    onPointerCancel={e => onHandleUp(h, e)}
                    style={{
                      position: 'absolute', left: hx, top: hy,
                      width: 36, height: 36, marginLeft: -18, marginTop: -18,
                      borderRadius: '50%', background: '#fff', border: '3px solid #5b3fa8',
                      touchAction: 'none', cursor: 'grab', boxSizing: 'border-box',
                      pointerEvents: 'auto'
                    }} />
                )
              })}
            </div>
          )
        }}>
        <img ref={imgRef} src={image.src} alt="Blueprint"
          onLoad={e => setImgSize({ w: e.target.clientWidth, h: e.target.clientHeight })}
          style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
      </ZoomableBlueprint>
      <div style={{display:'flex',gap:10,padding:'12px 14px',flexShrink:0}}>
        <button onClick={onSkip}
          style={{flex:1,padding:'13px',border:`2px solid ${ORANGE}`,color:ORANGE,background:'#fff',borderRadius:8,fontSize:15,fontWeight:700,cursor:'pointer'}}>
          Skip Crop →
        </button>
        <button onClick={handleCropContinue}
          style={{flex:1,padding:'13px',background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:'pointer'}}>
          Crop & Continue →
        </button>
      </div>
    </div>
  )
}

function StraightenScreen({ image, onDone, onSkip, onRotate, blueprintView, setBlueprintView }) {
  const [points, setPoints]   = useState([])
  const [zoomLevel, setZoomLevel] = useState(1)
  const [working, setWorking] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [straightenErr, setStraightenErr] = useState('')
  const imgRef = useRef()

  async function handleRotateClick() {
    if (rotating || !onRotate) return
    setRotating(true)
    setPoints([]) // tap points are in the old orientation's coordinate space — clear them
    try { await onRotate() } finally { setRotating(false) }
  }

  function handleTap(e) {
    if (points.length >= 2) { setPoints([]); return }
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.changedTouches?.[0]?.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return
    setPoints(p => [...p, {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top)  / rect.height
    }])
  }

  // Angle of the tapped line in real image-pixel space (not raw fraction
  // space, since photos aren't square — must scale by actual W/H).
  function getAngleRad() {
    if (points.length < 2 || !imgRef.current) return null
    const W = imgRef.current.naturalWidth, H = imgRef.current.naturalHeight
    if (!W || !H) return null
    const dx = (points[1].x - points[0].x) * W
    const dy = (points[1].y - points[0].y) * H
    return Math.atan2(dy, dx)
  }

  const angleRad = getAngleRad()
  const angleDeg = angleRad != null ? angleRad * 180 / Math.PI : null
  const bigAdjustment = angleDeg != null && Math.abs(angleDeg) > 30

  async function handleStraighten() {
    if (angleRad == null) return
    setWorking(true); setStraightenErr('')
    try {
      const result = await straightenAndCropImage(image.src, -angleRad)
      onDone(result)
    } catch (err) {
      setStraightenErr('Could not straighten that image — try again or skip.')
      setWorking(false)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background:'#3d2b56',padding:'9px 10px 9px 16px',display:'flex',alignItems:'center',gap:10}}>
        <span style={{color:'#fff',fontWeight:600,fontSize:14,flex:1,textAlign:'left'}}>🔄 STRAIGHTEN — tap 2 points on a line that should be level · Pinch to zoom</span>
        <button onClick={handleRotateClick} disabled={rotating} title="Rotate image 90°"
          style={{flexShrink:0,padding:'7px 11px',borderRadius:7,background:'rgba(255,255,255,0.18)',border:'1px solid rgba(255,255,255,0.4)',color:'#fff',fontSize:12,fontWeight:700,cursor:rotating?'wait':'pointer',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>
          {rotating ? '…' : '↻ Rotate'}
        </button>
      </div>

      <ZoomableBlueprint onTap={handleTap} style={{flex:1,minHeight:0,maxHeight:'75vh',maxWidth:1000,width:'100%',margin:'0 auto'}} onZoomChange={setZoomLevel}
        initialView={blueprintView} onViewChange={setBlueprintView}
        renderOverlay={toScreen => (
          <>
            {points.map((pt,i) => {
              const { x, y } = toScreen(pt.x, pt.y, imgRef.current?.clientWidth||400, imgRef.current?.clientHeight||300)
              return renderCrosshairMarker(x, y, i===0 ? '#8e24aa' : '#00897b', i, false, i===0?'1':'2')
            })}
          </>
        )}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {points.length===2 && (() => {
              const w = imgRef.current?.clientWidth || 400
              const h = imgRef.current?.clientHeight || 300
              return (
                <line x1={points[0].x*w} y1={points[0].y*h} x2={points[1].x*w} y2={points[1].y*h}
                  stroke="#00897b" strokeWidth={2} strokeDasharray="6,4" opacity="0.85"/>
              )
            })()}
          </svg>
        </div>
      </ZoomableBlueprint>

      <div style={{padding:'10px 12px',background:'#f4f4f2',borderTop:'1px solid #e0e0e0',flexShrink:0}}>
        <div style={{display:'flex',gap:6,marginBottom:8}}>
          <div style={{flex:1,padding:'6px 8px',background:points.length>=1?'#f3e5f5':'#fff',border:`1px solid ${points.length>=1?'#ce93d8':'#ddd'}`,borderRadius:6,textAlign:'center',fontSize:12,fontWeight:600,color:points.length>=1?'#6a1b9a':'#999'}}>
            {points.length>=1?'✓ Point 1 set':'Tap point 1'}
          </div>
          <div style={{flex:1,padding:'6px 8px',background:points.length>=2?'#e0f2f1':'#fff',border:`1px solid ${points.length>=2?'#80cbc4':'#ddd'}`,borderRadius:6,textAlign:'center',fontSize:12,fontWeight:600,color:points.length>=2?'#00695c':'#999'}}>
            {points.length>=2?'✓ Point 2 set':'Tap point 2'}
          </div>
          {points.length>0 && (
            <button onClick={()=>setPoints(p=>p.slice(0,-1))} style={{padding:'6px 10px',background:'transparent',border:'1px solid #ddd',borderRadius:6,fontSize:12,color:'#888',cursor:'pointer',flexShrink:0}}>↺</button>
          )}
        </div>

        {angleDeg != null && (
          <div style={{fontSize:11,color:bigAdjustment?'#c62828':'#555',fontWeight:600,marginBottom:8}}>
            {bigAdjustment
              ? `⚠️ ${Math.abs(angleDeg).toFixed(1)}° adjustment — double-check you tapped a line that should be level`
              : `Tilt detected: ${Math.abs(angleDeg).toFixed(1)}°`}
          </div>
        )}
        {straightenErr && (
          <div style={{fontSize:12,color:'#c62828',marginBottom:8}}>{straightenErr}</div>
        )}

        <div style={{display:'flex',gap:8}}>
          <button onClick={onSkip} disabled={working}
            style={{flex:1,padding:'11px',background:'transparent',color:ORANGE,border:`2px solid ${ORANGE}`,borderRadius:10,fontSize:14,fontWeight:700,cursor:working?'not-allowed':'pointer'}}>
            Skip Straightening →
          </button>
          <button onClick={handleStraighten} disabled={points.length<2 || working}
            style={{flex:1,padding:'11px',background:(points.length<2||working)?'#ccc':ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:(points.length<2||working)?'not-allowed':'pointer',boxShadow:(points.length<2||working)?'none':'0 4px 14px rgba(0,119,182,0.35)'}}>
            {working ? 'Straightening…' : 'Straighten & Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Calibration Screen ────────────────────────────────────────
function CalibrateScreen({ image, jobName, onDone, blueprintView, setBlueprintView }) {
  const [points, setPoints]   = useState([])
  const [knownFt, setKnownFt] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1)
  const imgRef = useRef()
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const update = () => { if (imgRef.current) setImgSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  function handleTap(e) {
    if (points.length >= 2) { setPoints([]); return }
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.changedTouches?.[0]?.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return
    setPoints(p => [...p, {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top)  / rect.height
    }])
  }

  // Width ÷ height of the actual loaded image. All downstream area/perimeter
  // math treats X as "fraction of width" and Y as "fraction of height" —
  // two DIFFERENT physical units on any non-square image. aspectRatio is
  // what converts a height-fraction into its width-fraction equivalent
  // (divide by aspectRatio) so the two can be validly combined.
  const aspectRatio = (imgRef.current?.naturalWidth / imgRef.current?.naturalHeight) || 1.4

  function calcScale() {
    if (points.length < 2) return null
    let ft = 0
    if (knownFt.includes('|')) {
      const [fPart, iPart] = knownFt.split('|')
      ft = (parseFloat(fPart)||0) + (parseFloat(iPart)||0) / 12
    } else {
      ft = parseFeetInches(knownFt) || 0
    }
    if (!ft || ft <= 0) return null
    const dx = points[1].x - points[0].x
    // Normalize dy to width-fraction-equivalent units before combining with
    // dx — without this, a calibration line tapped at any diagonal angle
    // (not perfectly horizontal or vertical) produces a systematically wrong
    // scale on any non-square blueprint image, since it mixes two different
    // units under one square root.
    const dy = (points[1].y - points[0].y) / aspectRatio
    return Math.sqrt(dx*dx + dy*dy) / ft
  }

  const fracPerFt = calcScale()
  const parsedFt = knownFt.includes('|')
    ? (parseFloat(knownFt.split('|')[0])||0) + (parseFloat(knownFt.split('|')[1])||0)/12
    : parseFeetInches(knownFt)
  const scaleOk   = fracPerFt && fracPerFt > 0.001 && fracPerFt < 0.08
  const canGo     = points.length === 2 && scaleOk

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background:'#1a2744',padding:'9px 16px',display:'flex',alignItems:'center',gap:8}}>
        {jobName && <span style={{color:ORANGE,fontSize:11,fontWeight:700,flexShrink:0}}>{jobName}</span>}
        <span style={{color:'#fff',fontWeight:600,fontSize:14}}>📏 SET SCALE — Tap A then B on a known dimension line · Pinch to zoom</span>
      </div>

      {/* Zoomable blueprint - max height */}
      <ZoomableBlueprint onTap={handleTap} style={{height:'auto',minHeight:0,maxHeight:'75vh',maxWidth:1000,width:'100%',margin:'0 auto',aspectRatio:imgSize.w&&imgSize.h?`${imgSize.w} / ${imgSize.h}`:'4 / 3'}} debug={true} onZoomChange={setZoomLevel}
        initialView={blueprintView} onViewChange={setBlueprintView}
        renderOverlay={toScreen => (
          <>
            {points.map((pt,i) => {
              const { x, y } = toScreen(pt.x, pt.y, imgRef.current?.clientWidth||400, imgRef.current?.clientHeight||300)
              return renderCrosshairMarker(x, y, i===0 ? '#e53935' : '#1565c0', i, false, i===0?'A':'B')
            })}
          </>
        )}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint" onLoad={e => setImgSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
        </div>
      </ZoomableBlueprint>

      {/* Compact controls strip */}
      <div style={{padding:'10px 12px',background:'#f4f4f2',borderTop:'1px solid #e0e0e0',flexShrink:0}}>
        {/* Status row */}
        <div style={{display:'flex',gap:6,marginBottom:8}}>
          <div style={{flex:1,padding:'6px 8px',background:points.length>=1?'#e8f5e9':'#fff',border:`1px solid ${points.length>=1?'#a5d6a7':'#ddd'}`,borderRadius:6,textAlign:'center',fontSize:12,fontWeight:600,color:points.length>=1?'#2e7d32':'#999'}}>
            {points.length>=1?'✓ A set':'Tap A'}
          </div>
          <div style={{flex:1,padding:'6px 8px',background:points.length>=2?'#e8f5e9':'#fff',border:`1px solid ${points.length>=2?'#a5d6a7':'#ddd'}`,borderRadius:6,textAlign:'center',fontSize:12,fontWeight:600,color:points.length>=2?'#2e7d32':'#999'}}>
            {points.length>=2?'✓ B set':'Tap B'}
          </div>
          {points.length>0 && (
            <button onClick={()=>setPoints(p=>p.slice(0,-1))} style={{padding:'6px 10px',background:'transparent',border:'1px solid #ddd',borderRadius:6,fontSize:12,color:'#888',cursor:'pointer',flexShrink:0}}>↺</button>
          )}
        </div>
        {/* Distance input — separate ft and in fields for mobile keypad */}
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
          <input type="number" inputMode="numeric" placeholder="Ft" value={knownFt.split('|')[0]||''} min="0"
            onChange={e=>setKnownFt(e.target.value+'|'+(knownFt.split('|')[1]||'0'))}
            style={{flex:2,padding:'8px 6px',fontSize:18,border:'2px solid #ddd',borderRadius:8,outline:'none',textAlign:'center'}} />
          <span style={{fontSize:14,color:'#666',fontWeight:700,flexShrink:0}}>ft</span>
          <input type="number" inputMode="numeric" placeholder="In" value={knownFt.split('|')[1]==='0'?'':(knownFt.split('|')[1]||'')} min="0" max="11"
            onChange={e=>setKnownFt((knownFt.split('|')[0]||'0')+'|'+(e.target.value||'0'))}
            style={{flex:1,padding:'8px 6px',fontSize:18,border:'2px solid #ddd',borderRadius:8,outline:'none',textAlign:'center'}} />
          <span style={{fontSize:14,color:'#666',fontWeight:700,flexShrink:0}}>in</span>
        </div>
        {fracPerFt && (
          <div style={{fontSize:11,color:scaleOk?'#2e7d32':'#c62828',fontWeight:600,marginBottom:6}}>
            {scaleOk ? `✓ Scale OK — ${parsedFt?.toFixed(1)} ft calibrated` : '⚠️ Scale off — use a longer line'}
          </div>
        )}
        <button onClick={()=>canGo&&onDone(fracPerFt, aspectRatio)} disabled={!canGo}
          style={{width:'100%',padding:'11px',background:canGo?ORANGE:'#ccc',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:canGo?'pointer':'not-allowed',boxShadow:canGo?'0 4px 14px rgba(0,119,182,0.35)':'none'}}>
          Continue — Draw Overlays →
        </button>
      </div>
    </div>
  )
}

// ── Drawing Screen ────────────────────────────────────────────
const DrawScreen = React.forwardRef(function DrawScreen({ image, fracPerFt, aspectRatio, rooms, jobName, onAddRoom, onRemoveRoom, onUpdateRoom, onFinish, labelSizeInches, setLabelSizeInches, blueprintView, setBlueprintView }, ref) {
  const [points,      setPoints]      = useState([])
  const [naming,      setNaming]      = useState(null)
  const [customName,  setCustomName]  = useState('')
  const [identifying, setIdentifying] = useState(false)
  const [zoomLevel,   setZoomLevel]   = useState(1)
  const [scannedNames, setScannedNames] = useState(null)  // null = not yet scanned
  const [scanningNames, setScanningNames] = useState(false)
  // Editing an already-placed room (adding missed corners) rather than tracing a new one
  const [editingRoomId,       setEditingRoomId]       = useState(null)
  const [editingColor,        setEditingColor]        = useState(null)
  const [editingName,         setEditingName]         = useState('')
  const [editingOriginalRoom, setEditingOriginalRoom] = useState(null)
  // Corner tools: Move / Add / Delete, all working on a copy of one room's points
  const [cornerTool,         setCornerTool]         = useState(null) // 'move' | 'add' | 'delete' | null
  const [cornerToolRoomId,   setCornerToolRoomId]   = useState(null)
  const [cornerToolPoints,   setCornerToolPoints]   = useState(null)
  const [cornerToolOriginal, setCornerToolOriginal] = useState(null)
  const [selectedCornerIdx,  setSelectedCornerIdx]  = useState(null)
  const [moveIncrement,      setMoveIncrement]      = useState(1) // inches: 1, 6, or 12
  // Edit Room bubble — which room's tool menu is open
  const [editBubbleRoom, setEditBubbleRoom] = useState(null)
  // Add Corner: a freeform detour that starts and ends on the room's
  // existing boundary — starts on any edge, tap freely, then closes when
  // a tap lands near the boundary again (same tolerance as picking a corner
  // to move — you don't need to hit the line exactly).
  const [addDetourActive, setAddDetourActive] = useState(false)
  const [addDetourStart,  setAddDetourStart]  = useState(null) // {edge, point}
  const [addDetourPoints, setAddDetourPoints] = useState([])
  const imgRef = useRef()
  const containerRef = useRef()
  const blueprintCtrlRef = useRef()

  // Room names are scanned on-demand when user closes a polygon

  // Assign the next NEW room whichever color isn't currently in use by any
  // remaining room — not just "the next one in the palette" — so deleting
  // a room and adding another can never leave two rooms sharing a color.
  const usedColorBorders = new Set(rooms.map(r => (r.color || ROOM_COLORS[0]).border))
  const nextColor = ROOM_COLORS.find(c => !usedColorBorders.has(c.border))
  const color = nextColor || ROOM_COLORS[rooms.length % ROOM_COLORS.length]

  function getPoint(e) {
    if (!imgRef.current) return null
    const rect = imgRef.current.getBoundingClientRect()
    // Handle plain {clientX,clientY} from ZoomableBlueprint, or real events
    const clientX = e.clientX ?? (e.changedTouches?.[0]?.clientX ?? e.touches?.[0]?.clientX)
    const clientY = e.clientY ?? (e.changedTouches?.[0]?.clientY ?? e.touches?.[0]?.clientY)
    if (clientX == null || clientY == null) return null
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top)  / rect.height
    }
  }

  // ── Corner tools: hit-test / auto-center on a corner ────────────
  function centerOnCorner(pts, idx) {
    if (!imgRef.current || !blueprintCtrlRef.current) return
    const p = pts[idx]
    const baseW = imgRef.current.clientWidth
    const baseH = imgRef.current.clientHeight
    const targetZoom = Math.max(zoomLevel, 10)
    blueprintCtrlRef.current.centerOn(p.x * baseW, p.y * baseH, targetZoom)
  }

  function hitTestCorner(pt, pts, rect) {
    const thresh = 30 / rect.width
    let bestIdx = -1, bestDist = Infinity
    pts.forEach((p, idx) => {
      const dx = pt.x - p.x, dy = pt.y - p.y
      const d = Math.sqrt(dx*dx + dy*dy)
      if (d < thresh && d < bestDist) { bestDist = d; bestIdx = idx }
    })
    return bestIdx
  }

  function handleCornerToolTap(e) {
    const pt = getPoint(e)
    if (!pt || !imgRef.current || !cornerToolPoints) return
    const rect = imgRef.current.getBoundingClientRect()

    if (cornerTool === 'move' || cornerTool === 'delete') {
      const idx = hitTestCorner(pt, cornerToolPoints, rect)
      if (idx >= 0) {
        setSelectedCornerIdx(idx)
        centerOnCorner(cornerToolPoints, idx)
      }
      return
    }

    if (cornerTool === 'add') {
      // Hit-test against the ORIGINAL (unmodified) boundary — same
      // tolerance used for picking a corner in Move Corner, so you don't
      // have to hit the line exactly, either to start or to close.
      const edgeThresh = 30 / rect.width
      let bestEdge = -1, bestEdgeDist = Infinity, bestEdgePoint = null
      const n = cornerToolPoints.length
      for (let i = 0; i < n; i++) {
        const a = cornerToolPoints[i], b = cornerToolPoints[(i+1) % n]
        const near = nearestPointOnSegment(pt.x, pt.y, a.x, a.y, b.x, b.y)
        if (near.dist < edgeThresh && near.dist < bestEdgeDist) {
          bestEdgeDist = near.dist; bestEdge = i; bestEdgePoint = near
        }
      }
      const nearBoundary = bestEdge >= 0

      if (!addDetourActive) {
        // Not tracing a detour yet — the first tap has to land on the
        // boundary to anchor where the detour begins.
        if (nearBoundary) {
          setAddDetourActive(true)
          setAddDetourStart({ edge: bestEdge, point: { x: bestEdgePoint.x, y: bestEdgePoint.y }, t: bestEdgePoint.t })
          setAddDetourPoints([])
        }
        return
      }

      if (nearBoundary) {
        // Tap landed back on the boundary — close the detour, splicing
        // the whole chain into the room's outline in one go.
        const end = { edge: bestEdge, point: { x: bestEdgePoint.x, y: bestEdgePoint.y }, t: bestEdgePoint.t }
        setCornerToolPoints(prev => spliceDetourIntoPolygon(prev, addDetourStart, end, addDetourPoints))
        setAddDetourActive(false)
        setAddDetourStart(null)
        setAddDetourPoints([])
      } else {
        // Freeform — anywhere is fine, keep building the detour path.
        setAddDetourPoints(prev => [...prev, { x: pt.x, y: pt.y }])
      }
    }
  }

  function nudgeCorner(dir) {
    if (selectedCornerIdx == null) return
    const deltas = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }
    const [dxDir, dyDir] = deltas[dir]
    setCornerToolPoints(prev => {
      const next = [...prev]
      const p = next[selectedCornerIdx]
      const fracDx = (dxDir * moveIncrement / 12) * fracPerFt
      const fracDy = (dyDir * moveIncrement / 12) * fracPerFt * aspectRatio
      next[selectedCornerIdx] = { x: clamp01(p.x + fracDx), y: clamp01(p.y + fracDy) }
      centerOnCorner(next, selectedCornerIdx)
      return next
    })
  }

  function deleteSelectedCorner() {
    if (selectedCornerIdx == null || !cornerToolPoints || cornerToolPoints.length <= 3) return
    setCornerToolPoints(prev => prev.filter((_, i) => i !== selectedCornerIdx))
    setSelectedCornerIdx(null)
  }

  function startCornerTool(room, tool) {
    if (naming || identifying || points.length > 0 || cornerTool || editingRoomId) return
    setCornerToolRoomId(room.id)
    setCornerToolPoints([...room.points])
    setCornerToolOriginal(room)
    setSelectedCornerIdx(null)
    setCornerTool(tool)
    setEditBubbleRoom(null)
    setAddDetourActive(false); setAddDetourStart(null); setAddDetourPoints([])
    onRemoveRoom(room.id)
  }

  function finishCornerTool() {
    if (!cornerToolRoomId || !cornerToolPoints) return
    const sqft  = Math.round(polygonAreaFt(cornerToolPoints, fracPerFt, aspectRatio))
    const perim = Math.round(polygonPerimeterFt(cornerToolPoints, fracPerFt, aspectRatio))
    onAddRoom({ ...cornerToolOriginal, points: [...cornerToolPoints], sqft, perim })
    setCornerTool(null); setCornerToolRoomId(null); setCornerToolPoints(null)
    setCornerToolOriginal(null); setSelectedCornerIdx(null)
    setAddDetourActive(false); setAddDetourStart(null); setAddDetourPoints([])
  }

  function cancelCornerTool() {
    if (cornerToolOriginal) onAddRoom(cornerToolOriginal)
    setCornerTool(null); setCornerToolRoomId(null); setCornerToolPoints(null)
    setCornerToolOriginal(null); setSelectedCornerIdx(null)
    setAddDetourActive(false); setAddDetourStart(null); setAddDetourPoints([])
  }

  // Abandons only the in-progress detour (not yet spliced in), staying in
  // Add Corner mode so any earlier, already-closed detours in this same
  // session are kept.
  function cancelDetour() {
    setAddDetourActive(false); setAddDetourStart(null); setAddDetourPoints([])
  }

  // Switches which corner tool is active WITHOUT leaving the room-edit
  // session or discarding anything already done — same working copy of
  // points carries over. Any in-progress (not yet closed) detour is
  // dropped, and any selected corner is cleared since selection means
  // different things in each tool.
  function switchCornerTool(tool) {
    if (tool === cornerTool) return
    if (addDetourActive) cancelDetour()
    setSelectedCornerIdx(null)
    setCornerTool(tool)
  }

  async function handleTap(e) {
    if (naming || identifying) return
    if (cornerTool) { handleCornerToolTap(e); return }
    if (!imgRef.current) return
    // ZoomableBlueprint passes plain {clientX, clientY} object
    const pt = getPoint(e)
    if (!pt || pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) return

    if (points.length >= 3) {
      const first = points[0]
      const rect = imgRef.current.getBoundingClientRect()
      const thresh = 35 / rect.width
      const dx = pt.x - first.x
      const dy = pt.y - first.y
      if (Math.sqrt(dx*dx + dy*dy) < thresh) {
        await closePolygon()
        return
      }
    }
    setPoints(p => [...p, pt])
  }

  async function closePolygon() {
    if (points.length < 3) return
    const sqft  = Math.round(polygonAreaFt(points, fracPerFt, aspectRatio))
    const perim = Math.round(polygonPerimeterFt(points, fracPerFt, aspectRatio))
    const c     = centroid(points)
    const roomColor = editingRoomId ? (editingColor || color) : color
    setNaming({ sqft, perim, centroid: c, color: roomColor })
    setCustomName(editingRoomId ? editingName : '')
    // Scan for room names if we haven't yet — this fetches the FULL list
    // with position data once per job; reordering by proximity for each
    // individual room happens locally at render time, not here.
    if (scannedNames === null && !scanningNames) {
      setScanningNames(true)
      const names = await scanRoomNames(image.base64, image.mime)
      setScannedNames(names && names.length > 0 ? names : [])
      setScanningNames(false)
    }
  }

  function confirmRoom() {
    try {
      if (!naming) return
      const name = customName.trim() || 'Room'
      const roomColor = naming.color || color || ROOM_COLORS[0]
      onAddRoom({
        id: editingRoomId || Date.now(),
        name,
        sqft: naming.sqft || 0,
        perim: naming.perim || 0,
        points: [...points],
        color: roomColor
      })
      setPoints([]); setNaming(null); setCustomName('')
      setEditingRoomId(null); setEditingColor(null); setEditingName(''); setEditingOriginalRoom(null)
      // Force a fresh repaint right as the new room's content gets added —
      // see nudge()'s comment for why this is needed on some browsers.
      requestAnimationFrame(() => blueprintCtrlRef.current?.nudge())
    } catch(err) {
      console.error('confirmRoom error:', err)
      setPoints([]); setNaming(null); setCustomName('')
      setEditingRoomId(null); setEditingColor(null); setEditingName(''); setEditingOriginalRoom(null)
    }
  }

  function cancelRoom() {
    // If this was an edit of an existing room, put it back unchanged rather than losing it
    if (editingRoomId && editingOriginalRoom) onAddRoom(editingOriginalRoom)
    setPoints([]); setNaming(null); setCustomName('')
    setEditingRoomId(null); setEditingColor(null); setEditingName(''); setEditingOriginalRoom(null)
  }

  // Re-open an already-placed room so more corners can be tapped in.
  // Pulls it out of the finished rooms list until it's closed again.
  function startEditRoom(room) {
    if (naming || identifying || points.length > 0) return
    setPoints([...room.points])
    setEditingRoomId(room.id)
    setEditingColor(room.color)
    setEditingName(room.name)
    setEditingOriginalRoom(room)
    onRemoveRoom(room.id)
  }

  function cancelEditRoom() {
    if (editingOriginalRoom) onAddRoom(editingOriginalRoom)
    setPoints([])
    setEditingRoomId(null); setEditingColor(null); setEditingName(''); setEditingOriginalRoom(null)
  }

  // Lets the parent check for, and safely back out of, an in-progress room
  // edit before navigating away (back button / New Job) — so a room being
  // edited, OR a brand-new room still being traced, can never just
  // silently vanish.
  React.useImperativeHandle(ref, () => ({
    hasActiveRoomEdit: () => points.length > 0 || !!cornerTool,
    cancelActiveRoomEdit: () => {
      if (editingRoomId) cancelEditRoom()
      else if (points.length > 0) { setPoints([]); setNaming(null); setCustomName('') }
      if (cornerTool) cancelCornerTool()
    },
    // For the header Back button specifically: while actively tracing,
    // one tap of Back should undo just the last tapped corner (same as
    // the in-screen Undo button) rather than leaving the whole screen —
    // matches how "back" behaves everywhere else in the app (one step at
    // a time), not a jump all the way out to Calibrate.
    hasLocalUndo: () => points.length > 0 && !naming,
    undoOneStep: () => { setPoints(p => p.slice(0, -1)) }
  }))

  const [imgSize, setImgSize] = useState({ w: 300, h: 400 })
  useEffect(() => {
    const update = () => { if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const cornerToolBanner = {
    move:   selectedCornerIdx==null ? '🎯 MOVE CORNER — tap a corner to nudge' : '🎯 MOVE CORNER — use the arrows to nudge it',
    add:    addDetourActive ? '➕ ADD CORNER — tap to keep going, or tap a line to close it' : '➕ ADD CORNER — tap a line to start',
    delete: selectedCornerIdx==null ? '🗑️ DELETE CORNER — tap a corner to remove' : '🗑️ DELETE CORNER — tap Delete below to confirm',
  }
  const cornerToolColor = { move:'#00695c', add:'#f57f17', delete:'#c62828' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background: identifying ? '#ff8f00' : cornerTool ? cornerToolColor[cornerTool] : color.solid, padding:'9px 16px', color:'#fff', display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
        {jobName && <span style={{fontSize:11,opacity:0.8,flexShrink:0}}>{jobName} ·</span>}
        <span style={{fontWeight:700,fontSize:14}}>
          {cornerTool
            ? cornerToolBanner[cornerTool]
            : naming
              ? `✓ ${naming.sqft.toLocaleString()} sf · ${naming.perim}ft — pick a name below`
              : points.length===0
                ? `✏️ TRACE — Room ${rooms.length+1}, tap corners`
                : `✏️ TRACE — ${editingRoomId ? `Editing "${editingName}" · ` : ''}${points.length} pts · ${points.length>=3 ? 'tap near ⭕ to close' : 'keep tapping corners'}`}
        </span>
      </div>

      {/* Zoomable pinch-to-zoom drawing area - fills all available space */}
      <ZoomableBlueprint ref={blueprintCtrlRef} onTap={e=>{if(!naming&&!identifying)handleTap(e)}} style={{flex:1,maxHeight:'none',minHeight:0,maxWidth:1000,width:'100%',margin:'0 auto'}} debug={true} onZoomChange={setZoomLevel}
        initialView={blueprintView} onViewChange={setBlueprintView}
        renderOverlay={toScreen => (
          <>
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible'}}>
              {rooms.map(room => (
                <polygon key={`outline-${room.id}`}
                  points={room.points.map(p => { const s = toScreen(p.x, p.y, imgSize.w||400, imgSize.h||300); return `${s.x},${s.y}` }).join(' ')}
                  fill="none" stroke={(room.color||ROOM_COLORS[0]).border} strokeWidth={2}/>
              ))}
              {!naming && points.length>=2 && (
                <polyline points={points.map(p => { const s = toScreen(p.x, p.y, imgSize.w||400, imgSize.h||300); return `${s.x},${s.y}` }).join(' ')}
                  fill="none" stroke={color.border} strokeWidth={2} strokeDasharray="6,3"/>
              )}
              {naming && (
                <polygon points={points.map(p => { const s = toScreen(p.x, p.y, imgSize.w||400, imgSize.h||300); return `${s.x},${s.y}` }).join(' ')}
                  fill="none" stroke={color.border} strokeWidth={2}/>
              )}
            </svg>
            {cornerToolPoints && (
              <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible'}}>
                <polygon points={cornerToolPoints.map(p => { const s = toScreen(p.x, p.y, imgSize.w||400, imgSize.h||300); return `${s.x},${s.y}` }).join(' ')}
                  fill="none" stroke={cornerToolColor[cornerTool]} strokeWidth={1.5} strokeDasharray="6,3" opacity={0.75}/>
                {addDetourActive && addDetourStart && (
                  <polyline points={[addDetourStart.point, ...addDetourPoints].map(p => { const s = toScreen(p.x, p.y, imgSize.w||400, imgSize.h||300); return `${s.x},${s.y}` }).join(' ')}
                    fill="none" stroke="#f57f17" strokeWidth={2} strokeDasharray="5,4"/>
                )}
              </svg>
            )}
            {!naming && points.map((pt,i) => {
              const { x, y } = toScreen(pt.x, pt.y, imgSize.w||400, imgSize.h||300)
              return renderCrosshairMarker(x, y, color.border, i, i===0)
            })}
            {cornerTool === 'add' && cornerToolPoints && cornerToolPoints.map((a,i) => {
              const b = cornerToolPoints[(i+1) % cornerToolPoints.length]
              const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }
              const { x, y } = toScreen(mid.x, mid.y, imgSize.w||400, imgSize.h||300)
              return renderEdgeHintMarker(x, y, `edge-${i}`)
            })}
            {(cornerTool === 'move' || cornerTool === 'delete') && cornerToolPoints && cornerToolPoints.map((pt,i) => {
              const { x, y } = toScreen(pt.x, pt.y, imgSize.w||400, imgSize.h||300)
              return renderMoveCornerMarker(x, y, i===selectedCornerIdx, i, cornerTool === 'delete' ? '#c62828' : '#00695c')
            })}
            {cornerTool === 'add' && cornerToolPoints && cornerToolPoints.map((pt,i) => {
              const { x, y } = toScreen(pt.x, pt.y, imgSize.w||400, imgSize.h||300)
              return renderMoveCornerMarker(x, y, false, `pt-${i}`, '#f57f17')
            })}
            {addDetourActive && addDetourStart && (() => {
              const { x, y } = toScreen(addDetourStart.point.x, addDetourStart.point.y, imgSize.w||400, imgSize.h||300)
              return renderMoveCornerMarker(x, y, true, 'detour-start', '#f57f17')
            })()}
            {addDetourActive && addDetourPoints.map((pt,i) => {
              const { x, y } = toScreen(pt.x, pt.y, imgSize.w||400, imgSize.h||300)
              return renderMoveCornerMarker(x, y, false, `detour-${i}`, '#f57f17')
            })}
          </>
        )}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false}
            onLoad={()=>setImgSize({w:imgRef.current.clientWidth,h:imgRef.current.clientHeight})} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {rooms.map(room => {
              const c = centroid(room.points)
              const labelInches = getLabelInches(labelSizeInches)
              const nameFS = inchesToFontSize(labelInches.name, fracPerFt, imgSize.w||400)
              const sqftFS = inchesToFontSize(labelInches.sqft, fracPerFt, imgSize.w||400)
              const wallFS = inchesToFontSize(labelInches.wall, fracPerFt, imgSize.w||400)
              return (
                <g key={room.id}>
                  <polygon points={toSvgPoints(room.points, imgSize.w, imgSize.h)} fill={(room.color||ROOM_COLORS[0]).fill} stroke="none"/>
                  {fracPerFt && room.points.map((a, i) => {
                    const b = room.points[(i+1) % room.points.length]
                    const lenFt = edgeLengthFt(a, b, fracPerFt, aspectRatio)
                    if (lenFt < 2) return null
                    const midX = (a.x+b.x)/2, midY = (a.y+b.y)/2
                    const lx = midX + (c.x - midX) * 0.05
                    const ly = midY + (c.y - midY) * 0.05
                    const lpx = lx * imgSize.w, lpy = ly * imgSize.h
                    // Rotate the label to run along the wall it's measuring
                    // (standard architectural convention), computed in the
                    // same pixel space the label is drawn in — not
                    // real-world feet — since this is a purely visual
                    // alignment, not a distance calculation. Normalized to
                    // stay within ±90° of upright so text never renders
                    // upside-down or backwards, regardless of which
                    // direction the wall's two corners happen to be
                    // ordered in.
                    const apx = a.x*imgSize.w, apy = a.y*imgSize.h, bpx = b.x*imgSize.w, bpy = b.y*imgSize.h
                    let wallAngle = Math.atan2(bpy-apy, bpx-apx) * 180/Math.PI
                    if (wallAngle > 90) wallAngle -= 180
                    if (wallAngle < -90) wallAngle += 180
                    return (
                      <text key={`wall-${room.id}-${i}`} x={lpx} y={lpy}
                        transform={`rotate(${wallAngle} ${lpx} ${lpy}) translate(${lpx} ${lpy}) scale(${wallFS/LABEL_BASE_PX}) translate(${-lpx} ${-lpy})`}
                        textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize={LABEL_BASE_PX} fontWeight="400"
                        style={{filter:'drop-shadow(0 0 2px rgba(255,255,255,0.9))'}}>
                        {feetInchesLabel(lenFt)}
                      </text>
                    )
                  })}
                  {(() => { const cpx = c.x*imgSize.w, cpy = c.y*imgSize.h; return (<>
                  <text x={cpx} y={cpy}
                    transform={`translate(${cpx} ${cpy}) scale(${nameFS/LABEL_BASE_PX}) translate(${-cpx} ${-cpy})`}
                    textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={LABEL_BASE_PX} fontWeight="800"
                    style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}>
                    {room.name}
                  </text>
                  <text x={cpx} y={cpy + nameFS*0.9}
                    transform={`translate(${cpx} ${cpy + nameFS*0.9}) scale(${sqftFS/LABEL_BASE_PX}) translate(${-cpx} ${-(cpy + nameFS*0.9)})`}
                    textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={LABEL_BASE_PX} fontWeight="600"
                    style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}>
                    {room.sqft.toLocaleString()} sf
                  </text>
                  </>)})()}
                </g>
              )
            })}
            {naming && (
              <polygon points={toSvgPoints(points, imgSize.w, imgSize.h)} fill={color.fill} stroke="none"/>
            )}
            {cornerToolPoints && (
              <polygon points={toSvgPoints(cornerToolPoints, imgSize.w||400, imgSize.h||300)} fill={`${cornerToolColor[cornerTool]}2e`} stroke="none"/>
            )}
          </svg>
        </div>
      </ZoomableBlueprint>

      {/* Naming panel */}
      {naming && (
        <div style={{padding:'12px 16px',background:'#fff',borderTop:'2px solid #e8e8e8'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:14,color:'#222'}}>Name this room</div>
            <div style={{fontSize:12,color:'#888'}}>{(naming.sqft||0).toLocaleString()} sf · {naming.perim||0} ft perim</div>
          </div>
          {/* Room name buttons — from AI scan or fallback list */}
          {scanningNames && <div style={{fontSize:12,color:'#888',marginBottom:8}}>🔍 Loading room names from blueprint…</div>}
          {!scanningNames && (
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              {(() => {
                const candidates = (scannedNames && scannedNames.length > 0
                  ? reorderNamesByProximity(scannedNames, naming.centroid)
                  : ['Garage','Living Room','Kitchen','Master Bedroom','Bedroom','Bathroom','Dining Room','Foyer','Hallway','Laundry','Office','Porch','Court','Utility','Pantry']
                )
                // Don't keep suggesting a name that's already been assigned
                // to another room in this job — but never hide the current
                // room's own name while editing it.
                const usedNames = new Set(
                  rooms.filter(r => r.id !== editingRoomId).map(r => r.name.trim().toLowerCase())
                )
                return candidates.filter(n => !usedNames.has(n.trim().toLowerCase()))
              })().map((n,idx)=>(
                <button key={idx+'-'+n} onClick={()=>setCustomName(n)}
                  style={{padding:'5px 10px',background:customName===n?ORANGE:'#f0f0f0',color:customName===n?'#fff':'#444',border:`1px solid ${customName===n?ORANGE:'#ddd'}`,borderRadius:20,fontSize:12,cursor:'pointer',fontWeight:customName===n?700:400}}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <input type="text" value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Or type a custom name"
            style={{width:'100%',padding:'8px 14px',fontSize:15,border:'2px solid #ddd',borderRadius:8,outline:'none',marginBottom:10,boxSizing:'border-box'}} />
          <div style={{display:'flex',gap:8}}>
            <button onClick={confirmRoom} disabled={!customName.trim()}
              style={{flex:2,padding:'11px',background:customName.trim()?ORANGE:'#ccc',color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:customName.trim()?'pointer':'not-allowed'}}>✓ Add Room</button>
            <button onClick={cancelRoom} style={{flex:1,padding:'11px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:14,color:'#888',cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Controls */}
      {!naming && !cornerTool && (
        <div style={{padding:'8px 12px', flexShrink:0, background:'#f4f4f2'}}>
          <div style={{display:'flex',gap:6,marginBottom:6}}>
            {points.length>=3 && (
              <button onClick={closePolygon} style={{flex:2,padding:'9px',background:color.solid,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                ⬡ Close Room
              </button>
            )}
            {points.length>0 && (
              <button onClick={()=>setPoints(p=>p.slice(0,-1))} style={{flex:1,padding:'9px',background:'transparent',border:'1px solid #ddd',borderRadius:7,fontSize:13,color:'#888',cursor:'pointer'}}>↩ Undo</button>
            )}
          </div>
          {editingRoomId && points.length>0 && (
            <button onClick={cancelEditRoom} style={{width:'100%',padding:'7px',background:'transparent',border:'1px solid #f5c6c6',borderRadius:7,fontSize:12,color:'#c62828',cursor:'pointer',marginBottom:6}}>
              ✕ Cancel Edit — Restore Original Room
            </button>
          )}
          {rooms.length>0 && points.length===0 && (
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'8px 10px',background:'#fff',border:'1px solid #e0e0e0',borderRadius:8,marginBottom:8}}>
                <span style={{fontSize:13,fontWeight:600,color:'#333'}}>Label Size</span>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={()=>setLabelSizeInches(v=>Math.max(1, Math.round((v-0.5)*10)/10))}
                    style={{width:26,height:26,borderRadius:6,border:`1.5px solid ${ORANGE}`,background:'#fff',color:ORANGE,fontSize:14,fontWeight:700,cursor:'pointer'}}>–</button>
                  <div style={{width:52,height:26,border:'1.5px solid #ddd',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,background:'#fff'}}>
                    {labelSizeInches}"
                  </div>
                  <button onClick={()=>setLabelSizeInches(v=>Math.min(24, Math.round((v+0.5)*10)/10))}
                    style={{width:26,height:26,borderRadius:6,border:`1.5px solid ${ORANGE}`,background:'#fff',color:ORANGE,fontSize:14,fontWeight:700,cursor:'pointer'}}>+</button>
                </div>
              </div>
              <div style={{maxHeight:160,overflowY:'auto',marginBottom:8,WebkitOverflowScrolling:'touch'}}>
                {rooms.map(room => (
                  <div key={room.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:'#fff',border:'1px solid #e8e8e8',borderRadius:7,marginBottom:5}}>
                    <div style={{width:12,height:12,borderRadius:3,background:(room.color||ROOM_COLORS[0]).fill,border:`2px solid ${(room.color||ROOM_COLORS[0]).border}`,flexShrink:0}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#222',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{room.name}</div>
                      <div style={{fontSize:11,color:'#888'}}>{room.sqft.toLocaleString()} sf</div>
                    </div>
                    <button onClick={()=>setEditBubbleRoom(room)} title="Edit room"
                      style={{padding:'6px 9px',background:'#f0f0f0',border:'1px solid #ddd',borderRadius:6,fontSize:13,cursor:'pointer',flexShrink:0}}>✏️</button>
                    <button onClick={()=>onRemoveRoom(room.id)} title="Delete room"
                      style={{padding:'6px 9px',background:'#fdecea',border:'1px solid #f5c6c6',color:'#c62828',borderRadius:6,fontSize:13,cursor:'pointer',flexShrink:0}}>🗑️</button>
                  </div>
                ))}
              </div>
              <button onClick={onFinish} style={{width:'100%',padding:'12px',background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:'pointer'}}>
                ✓ Done — {rooms.length} room{rooms.length!==1?'s':''}
              </button>
            </>
          )}
          {rooms.length===0 && points.length===0 && (
            <div style={{background:'#fff3e0',border:'1px solid #ffcc80',borderRadius:6,padding:'8px 12px',fontSize:12,color:'#bf360c'}}>
              💡 Pinch to zoom · tap corners to trace · tap ⭕ to close
            </div>
          )}
        </div>
      )}

      {/* Edit Room bubble — 2 entry points */}
      {editBubbleRoom && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:20}}
          onClick={()=>setEditBubbleRoom(null)}>
          <div style={{background:'#fff',borderRadius:14,padding:16,width:'100%',maxWidth:320,boxShadow:'0 8px 30px rgba(0,0,0,0.3)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:700,color:'#222',marginBottom:2}}>{editBubbleRoom.name}</div>
            <div style={{fontSize:12,color:'#888',marginBottom:14}}>Choose a tool</div>
            <button onClick={()=>{ startEditRoom(editBubbleRoom); setEditBubbleRoom(null) }}
              style={{width:'100%',textAlign:'left',padding:'11px 14px',marginBottom:8,background:'#f5f5f5',border:'1px solid #e0e0e0',borderRadius:9,fontSize:14,fontWeight:600,color:'#333',cursor:'pointer'}}>
              ✏️ Continue Tracing
              <div style={{fontSize:11,fontWeight:400,color:'#888',marginTop:2}}>Keep tracing new corners outward from where you closed it</div>
            </button>
            <button onClick={()=>startCornerTool(editBubbleRoom, 'move')}
              style={{width:'100%',textAlign:'left',padding:'11px 14px',marginBottom:14,background:'#e0f2f1',border:'1px solid #80cbc4',borderRadius:9,fontSize:14,fontWeight:600,color:'#00695c',cursor:'pointer'}}>
              🎯 Edit Corners
              <div style={{fontSize:11,fontWeight:400,color:'#3f8f83',marginTop:2}}>Add, move, or delete corners — switch between them freely</div>
            </button>
            <button onClick={()=>setEditBubbleRoom(null)} style={{width:'100%',padding:'10px',background:'transparent',border:'none',fontSize:13,color:'#888',cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Corner tool panel (Move / Add / Delete) */}
      {cornerTool && (
        <div style={{padding:'10px 12px', flexShrink:0, background:'#f4f4f2', borderTop:'2px solid #e0e0e0'}}>
          {/* Tool switcher — freely move between Add/Move/Delete without
              leaving this room-edit session; the working points carry over. */}
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            <button onClick={()=>switchCornerTool('add')}
              style={{flex:1,padding:'8px 4px',background:cornerTool==='add'?'#f57f17':'#fff8e1',border:`1.5px solid ${cornerTool==='add'?'#f57f17':'#ffe0a3'}`,borderRadius:7,fontSize:12,fontWeight:cornerTool==='add'?700:600,color:cornerTool==='add'?'#fff':'#8a5a00',cursor:'pointer'}}>
              ➕ Add
            </button>
            <button onClick={()=>switchCornerTool('move')}
              style={{flex:1,padding:'8px 4px',background:cornerTool==='move'?'#00695c':'#e0f2f1',border:`1.5px solid ${cornerTool==='move'?'#00695c':'#80cbc4'}`,borderRadius:7,fontSize:12,fontWeight:cornerTool==='move'?700:600,color:cornerTool==='move'?'#fff':'#00695c',cursor:'pointer'}}>
              🎯 Move
            </button>
            <button onClick={()=>cornerToolPoints && cornerToolPoints.length>3 && switchCornerTool('delete')}
              disabled={cornerToolPoints && cornerToolPoints.length<=3}
              title={cornerToolPoints && cornerToolPoints.length<=3 ? "Room only has 3 corners — can't remove any" : undefined}
              style={{flex:1,padding:'8px 4px',background:cornerTool==='delete'?'#c62828':(cornerToolPoints&&cornerToolPoints.length<=3?'#f5f5f5':'#fdecea'),border:`1.5px solid ${cornerTool==='delete'?'#c62828':(cornerToolPoints&&cornerToolPoints.length<=3?'#e0e0e0':'#f5c6c6')}`,borderRadius:7,fontSize:12,fontWeight:cornerTool==='delete'?700:600,color:cornerTool==='delete'?'#fff':(cornerToolPoints&&cornerToolPoints.length<=3?'#aaa':'#c62828'),cursor:cornerToolPoints&&cornerToolPoints.length<=3?'not-allowed':'pointer'}}>
              🗑️ Delete
            </button>
          </div>
          {cornerTool === 'add' && (
            <div style={{background:'#fff8e1',border:'1px solid #ffe0a3',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#8a5a00',fontWeight:600,marginBottom:10,textAlign:'center'}}>
              {addDetourActive
                ? '➕ Tap to add another point, or tap near a line to close it there'
                : '➕ Tap a line to start — then trace freely and close it back on the boundary'}
            </div>
          )}
          {(cornerTool === 'move' || cornerTool === 'delete') && selectedCornerIdx == null && (
            <div style={{background: cornerTool==='delete' ? '#fdecea' : '#e0f2f1', border:`1px solid ${cornerTool==='delete'?'#f5c6c6':'#80cbc4'}`, borderRadius:8, padding:'10px 14px', fontSize:13, color: cornerTool==='delete'?'#c62828':'#00695c', fontWeight:600, marginBottom:10, textAlign:'center'}}>
              {cornerTool==='delete' ? '🗑️ Tap the corner you want to remove' : '🎯 Tap the corner you want to nudge'}
            </div>
          )}
          {cornerTool === 'move' && selectedCornerIdx != null && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20,marginBottom:10}}>
              <div style={{display:'grid',gridTemplateColumns:'44px 44px 44px',gridTemplateRows:'38px 38px',gap:5}}>
                <div /><button onClick={()=>nudgeCorner('up')} style={{background:'#fff',border:'2px solid #00695c',borderRadius:7,fontSize:16,color:'#00695c',cursor:'pointer'}}>▲</button><div />
                <button onClick={()=>nudgeCorner('left')} style={{background:'#fff',border:'2px solid #00695c',borderRadius:7,fontSize:16,color:'#00695c',cursor:'pointer'}}>◀</button>
                <button onClick={()=>nudgeCorner('down')} style={{background:'#fff',border:'2px solid #00695c',borderRadius:7,fontSize:16,color:'#00695c',cursor:'pointer'}}>▼</button>
                <button onClick={()=>nudgeCorner('right')} style={{background:'#fff',border:'2px solid #00695c',borderRadius:7,fontSize:16,color:'#00695c',cursor:'pointer'}}>▶</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {[1,6,12].map(inches => (
                  <button key={inches} onClick={()=>setMoveIncrement(inches)}
                    style={{width:34,height:20,borderRadius:5,fontSize:10,fontWeight:moveIncrement===inches?700:600,
                      background:moveIncrement===inches?'#00695c':'#fff', color:moveIncrement===inches?'#fff':'#00695c',
                      border:`1.3px solid #00695c`, display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1,cursor:'pointer'}}>
                    {inches}"
                  </button>
                ))}
              </div>
            </div>
          )}
          {cornerTool === 'delete' && selectedCornerIdx != null && (
            <button onClick={deleteSelectedCorner} style={{width:'100%',padding:'11px',background:'#c62828',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:10}}>
              🗑️ Delete This Corner
            </button>
          )}
          {addDetourActive ? (
            <button onClick={cancelDetour} style={{width:'100%',padding:'11px',background:'transparent',border:'1px solid #f5c6c6',borderRadius:8,fontSize:14,color:'#c62828',cursor:'pointer'}}>
              ✕ Cancel This Detour
            </button>
          ) : (
          <div style={{display:'flex',gap:8}}>
            <button onClick={cancelCornerTool} style={{flex:1,padding:'11px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:14,color:'#888',cursor:'pointer'}}>
              Cancel
            </button>
            <button onClick={finishCornerTool} style={{flex:2,padding:'11px',background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>
              ✓ Done Editing Room
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  )
})

// ── Results Screen ────────────────────────────────────────────
const ResultsScreen = React.forwardRef(function ResultsScreen({ image, rooms, jobName, setJobName, fracPerFt, aspectRatio, labelSizeInches, miscItems, setMiscItems, reportSaved, onDirty, onReset, onEdit, onSaved }, ref) {
  const [editingJobName, setEditingJobName] = useState(false)
  const [pricingRoomId, setPricingRoomId] = useState(null) // which room's pricing card is expanded, if any
  const [jobNameDraft,   setJobNameDraft]   = useState(jobName)
  React.useImperativeHandle(ref, () => ({ triggerSave: () => handleSave() }))
  const totalSqft  = Math.round(rooms.reduce((s,r)=>s+(r.sqft||0),0))
  const totalPerim = Math.round(rooms.reduce((s,r)=>s+(r.perim||0),0))
  const [saving,     setSaving]     = useState(false)
  const [roomPrices, setRoomPrices] = useState({})  // { room.id: pricePerSqft string }
  const [roomCoatings, setRoomCoatings] = useState({}) // { room.id: coating name string }
  const [roomLfPrices, setRoomLfPrices] = useState({}) // { room.id: pricePerLf string } — for perimeter products like cove base
  const [roomDoorCounts, setRoomDoorCounts] = useState({}) // { room.id: number of doorways to exclude }
  const [roomDoorWidths, setRoomDoorWidths] = useState({}) // { room.id: standard door width in ft, default 3 }
  // Price/coating live only here, not in App's rooms/jobName/miscItems — so
  // they need their own watcher to tell the parent this job is now dirty
  // (this is what makes the "Report Saved" button and the New Job warning
  // correctly go stale again after changing a price, not just after
  // editing a room).
  const firstDirtyCheck = useRef(true)
  useEffect(() => {
    if (firstDirtyCheck.current) { firstDirtyCheck.current = false; return }
    if (onDirty) onDirty()
  }, [roomPrices, roomCoatings, roomLfPrices, roomDoorCounts, roomDoorWidths])
  const getDoorWidth = (room) => { const w = parseCurrency(roomDoorWidths[room.id]); return (!isNaN(w) && w >= 0) ? w : 3 }
  const getDoorCount = (room) => { const c = parseInt(roomDoorCounts[room.id], 10); return (!isNaN(c) && c >= 0) ? c : 0 }
  const getLfToPrice = (room) => Math.max((room.perim || 0) - getDoorCount(room) * getDoorWidth(room), 0)
  const getRoomAreaTotal = (room) => {
    const p = parseCurrency(roomPrices[room.id] || '')
    return (!isNaN(p) && p > 0) ? p * (room.sqft || 0) : 0
  }
  const getRoomLfTotal = (room) => {
    const p = parseCurrency(roomLfPrices[room.id] || '')
    return (!isNaN(p) && p > 0) ? p * getLfToPrice(room) : 0
  }
  const getRoomTotal = (room) => getRoomAreaTotal(room) + getRoomLfTotal(room)
  const miscTotal = miscItems.reduce((s, i) => s + (parseCurrency(i.amount) || 0), 0)
  const grandTotal = rooms.reduce((s, r) => s + getRoomTotal(r), 0) + miscTotal
  const hasAnyPrice = rooms.some(r => getRoomTotal(r) > 0) || miscTotal > 0
  const blueprintRef = useRef()
  const [imgSize, setImgSize] = useState({ w: 300, h: 400 })

  useEffect(() => {
    const update = () => { if (blueprintRef.current) setImgSize({ w: blueprintRef.current.clientWidth, h: blueprintRef.current.clientHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      // Load image from base64 - avoids canvas taint on iOS Safari
      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = (e) => reject(new Error('Image failed to load'))
        // Use base64 directly to avoid CORS/taint issues
        i.src = `data:${image.mime};base64,${image.base64}`
      })

      // On mobile, naturalWidth can be 0 if image not fully decoded — use fallback
      let imgW = img.naturalWidth || img.width || 0
      let imgH = img.naturalHeight || img.height || 0
      
      // If dimensions still 0, decode the image first
      if (imgW === 0 || imgH === 0) {
        if (img.decode) await img.decode()
        imgW = img.naturalWidth || img.width || 1200
        imgH = img.naturalHeight || img.height || 900
      }

      // Use scale 1 on mobile to avoid iOS memory limits on canvas
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      const scale   = isMobile ? 1 : 2

      // ── Compute crop region from room bounding box (fractions of full image) ─
      let minX = 1, minY = 1, maxX = 0, maxY = 0
      rooms.forEach(room => {
        room.points.forEach(pt => {
          if (pt.x < minX) minX = pt.x
          if (pt.y < minY) minY = pt.y
          if (pt.x > maxX) maxX = pt.x
          if (pt.y > maxY) maxY = pt.y
        })
      })
      const margin = 0.07
      const cropX1 = Math.max(0, minX - margin)
      const cropY1 = Math.max(0, minY - margin)
      const cropX2 = Math.min(1, maxX + margin)
      const cropY2 = Math.min(1, maxY + margin)

      // Legend sizing — each room gets a row
      // Legend sized to ~35% of image height, rows fit within that
      // Cap to iOS canvas limits — aspect ratio comes from the CROPPED
      // region, not the full blueprint, or the crop gets stretched/squashed
      // to fit the wrong-shaped box.
      const maxW = 3800
      const cropWpx = (cropX2 - cropX1) * imgW
      const cropHpx = (cropY2 - cropY1) * imgH
      const aspectRatio = cropHpx / cropWpx
      const cappedImgW = Math.min(cropWpx, maxW)
      const cappedImgH = Math.round(cappedImgW * aspectRatio)
      // Calculate exact legend height — generous padding so nothing gets cut off.
      // MUST use the exact same font-size formula as the actual drawing below
      // (fSize/F) — a mismatch here is what caused the bottom of the report
      // to get clipped: this reserves space based on one font size while the
      // real text draws at a different, larger one.
      const F_est = Math.min(Math.max(Math.round(cappedImgW / 28), 20), 60)
      const legendH = Math.round(
        F_est * 2.0 +                                                    // top pad
        F_est * 2.0 +                                                    // job name
        F_est * 2.0 +                                                    // totals
        (hasAnyPrice ? F_est * 3.2 : 0) +                                 // price line + divider (now at the bottom)
        F_est * 1.5 +                                                    // divider
        Math.ceil(rooms.length / Math.min(2, Math.max(rooms.length,1))) * F_est * 5.6 +           // room rows (1 col if only 1 room, else 2)
        (miscItems.length > 0 ? F_est * 1.6 + miscItems.length * F_est * 1.5 : 0) +               // misc items header + one line each
        F_est * 3.0                                                      // footer + bottom pad
      )
      const rowH    = Math.round((legendH - 220) / Math.max(rooms.length, 1))
      const totalH  = cappedImgH + legendH

      const canvas  = document.createElement('canvas')
      canvas.width  = cappedImgW * scale
      canvas.height = totalH * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')
      ctx.scale(scale, scale)

      // Background
      ctx.fillStyle = '#1c1c2e'
      ctx.fillRect(0, 0, cappedImgW, totalH)

      // Helper: fraction coords → cropped canvas pixels
      const toCanvasX = fx => ((fx - cropX1) / (cropX2 - cropX1)) * cappedImgW
      const toCanvasY = fy => ((fy - cropY1) / (cropY2 - cropY1)) * cappedImgH

      // Draw cropped portion of blueprint
      ctx.drawImage(img,
        cropX1 * imgW, cropY1 * imgH,
        (cropX2 - cropX1) * imgW, (cropY2 - cropY1) * imgH,
        0, 0, cappedImgW, cappedImgH
      )

      // Room polygons — in cropped coordinate space
      rooms.forEach(room => {
        if (!room.points || room.points.length < 3) return
        ctx.beginPath()
        room.points.forEach((pt, i) => {
          const x = toCanvasX(pt.x)
          const y = toCanvasY(pt.y)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.fillStyle = room.color?.fill || 'rgba(255,100,100,0.3)'
        ctx.fill()
        ctx.strokeStyle = room.color?.border || '#e53935'
        ctx.lineWidth = 3
        ctx.stroke()
        const c = centroid(room.points)
        const cx = toCanvasX(c.x)
        const cy = toCanvasY(c.y)
        // The report draws onto a CROPPED canvas, so the inches-based font
        // size (calibrated against the FULL image via fracPerFt) has to be
        // converted into the crop's own coordinate space — effectiveImgW is
        // "what the full image's width would be at this crop's pixel
        // density," which inchesToFontSize can use directly.
        const effectiveImgW = cappedImgW / (cropX2 - cropX1)
        const labelInches = getLabelInches(labelSizeInches)
        const nameFS = inchesToFontSize(labelInches.name, fracPerFt, effectiveImgW)
        const sqftFS = inchesToFontSize(labelInches.sqft, fracPerFt, effectiveImgW)
        const wallFS = inchesToFontSize(labelInches.wall, fracPerFt, effectiveImgW)
        // Wall length labels — same feet-inches format and placement (just
        // inside the wall, nudged toward centroid) as the live views, so
        // what you tune while testing is exactly what ends up in the report.
        if (fracPerFt) {
          room.points.forEach((a, i) => {
            const b = room.points[(i+1) % room.points.length]
            const lenFt = edgeLengthFt(a, b, fracPerFt, aspectRatio)
            if (lenFt < 2) return
            const midX = (a.x+b.x)/2, midY = (a.y+b.y)/2
            const lx = midX + (c.x - midX) * 0.05
            const ly = midY + (c.y - midY) * 0.05
            const lcx = toCanvasX(lx), lcy = toCanvasY(ly)
            ctx.font = `${wallFS}px Arial`
            ctx.fillStyle = '#fff'
            ctx.lineWidth = 3
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'
            ctx.strokeText(feetInchesLabel(lenFt), lcx, lcy)
            ctx.fillStyle = '#000'
            ctx.fillText(feetInchesLabel(lenFt), lcx, lcy)
          })
        }
        ctx.fillStyle = room.color?.border || '#e53935'
        ctx.font = `bold ${nameFS}px Arial`
        ctx.textAlign = 'center'
        ctx.fillText(room.name || 'Room', cx, cy - nameFS * 0.25)
        ctx.font = `${sqftFS}px Arial`
        ctx.fillStyle = '#fff'
        ctx.fillText(`${(room.sqft||0).toLocaleString()} sf`, cx, cy + sqftFS * 0.9)
      })

      // ── Legend section ────────────────────────────────────────
      const ly = cappedImgH
      const pad = 20

      // ── Legend with cursor-based exact positioning ──────────
      const F = F_est // same value used to reserve height above — kept as one variable so drawing can never outgrow what was reserved for it
      let cur = ly

      // Orange divider
      ctx.fillStyle = ORANGE
      ctx.fillRect(0, cur, cappedImgW, 4)
      cur += 4

      // Job name — auto-shrink to fit
      cur += F * 1.4
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      let jFont = F * 1.6
      ctx.font = `bold ${jFont}px Arial`
      const jText = jobName || 'TopCoat Tech Estimator'
      while (ctx.measureText(jText).width > cappedImgW - pad * 2 && jFont > F * 0.8) {
        jFont -= 1; ctx.font = `bold ${jFont}px Arial`
      }
      ctx.fillText(jText, pad, cur)
      cur += F * 0.6

      // Totals — auto-shrink to fit width
      cur += F * 1.2
      const totalText = `Total: ${totalSqft.toLocaleString()} sq ft  |  ${totalPerim} ft perimeter`
      let tFont = F * 1.1
      ctx.font = `${tFont}px Arial`
      while (ctx.measureText(totalText).width > cappedImgW - pad * 2 && tFont > F * 0.5) {
        tFont -= 1; ctx.font = `${tFont}px Arial`
      }
      ctx.fillStyle = '#0077B6'
      ctx.fillText(totalText, pad, cur)
      cur += F * 0.4

      // Divider
      cur += F * 0.8
      ctx.fillStyle = '#333'
      ctx.fillRect(pad, cur, cappedImgW - pad * 2, 1)
      cur += F * 0.6

      // Room rows — 2 columns to save vertical space, but a single room
      // gets the full width instead of being squeezed into half of it
      // while the other half sits empty.
      const numCols     = rooms.length <= 1 ? 1 : 2
      const swatchSize  = F * 1.4
      const roomRowH    = F * 4.3   // room for up to 4 lines: name, sqft/perim, coating, price
      const colW        = (cappedImgW - pad * 2) / numCols
      const numRows     = Math.ceil(rooms.length / numCols)
      // Truncate to fit width, accounting for the ellipsis's own width so the
      // truncated+ellipsis string never exceeds the available column budget
      function fitText(text, font, maxW) {
        ctx.font = font
        if (ctx.measureText(text).width <= maxW) return text
        const ellW = ctx.measureText('…').width
        let t = text
        while (ctx.measureText(t).width > maxW - ellW && t.length > 3) t = t.slice(0, -1)
        return t + '…'
      }
      rooms.forEach((room, i) => {
        const col   = i % numCols
        const row   = Math.floor(i / numCols)
        const rx    = pad + col * colW
        const ry    = cur + row * roomRowH
        const avail = colW - swatchSize - 20
        ctx.fillStyle = room.color?.border || '#e53935'
        ctx.fillRect(rx, ry, swatchSize, swatchSize)
        ctx.textAlign = 'left'

        const nameFont = `bold ${F * 1.0}px Arial`
        ctx.fillStyle = '#ffffff'
        ctx.font = nameFont
        ctx.fillText(fitText(room.name || 'Room', nameFont, avail), rx + swatchSize + 10, ry + swatchSize * 0.65)

        const subFont = `${F * 0.85}px Arial`
        ctx.fillStyle = '#aaaaaa'
        ctx.font = subFont
        const subText = `${(room.sqft||0).toLocaleString()} sf · ${room.perim||0} ft perim`
        ctx.fillText(fitText(subText, subFont, avail), rx + swatchSize + 10, ry + swatchSize * 1.35)

        const coating = roomCoatings[room.id]
        if (coating) {
          ctx.fillStyle = ORANGE
          ctx.font = subFont
          ctx.fillText(fitText(coating, subFont, avail), rx + swatchSize + 10, ry + swatchSize * 2.05)
        }

        const rt = getRoomTotal(room)
        if (rt > 0) {
          const priceFont = `bold ${F * 0.9}px Arial`
          ctx.fillStyle = '#4caf50'
          ctx.font = priceFont
          const priceText = `$${rt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
          ctx.fillText(fitText(priceText, priceFont, avail), rx + swatchSize + 10, ry + swatchSize * 2.75)
        }
      })
      cur += numRows * roomRowH + F * 1.2

      // Misc items — flat-dollar lines not tied to sq ft
      if (miscItems.length > 0) {
        ctx.textAlign = 'left'
        ctx.font = `bold ${F * 1.0}px Arial`
        ctx.fillStyle = '#ccc'
        ctx.fillText('Misc Items', pad, cur)
        cur += F * 1.3
        miscItems.forEach(item => {
          const label = item.label?.trim() || 'Item'
          const amt = parseCurrency(item.amount) || 0
          const amtText = `$${amt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
          ctx.font = `bold ${F * 0.85}px Arial`
          const amtW = ctx.measureText(amtText).width
          ctx.font = `${F * 0.85}px Arial`
          ctx.fillStyle = '#eee'
          ctx.fillText(fitText(label, `${F*0.85}px Arial`, cappedImgW - pad*2 - amtW - 20), pad, cur)
          ctx.font = `bold ${F * 0.85}px Arial`
          ctx.fillStyle = '#4caf50'
          ctx.textAlign = 'right'
          ctx.fillText(amtText, cappedImgW - pad, cur)
          ctx.textAlign = 'left'
          cur += F * 1.3
        })
        cur += F * 0.5
      }

      // Job Total — last, as the sum of everything above it (rooms + misc)
      if (hasAnyPrice && grandTotal > 0) {
        cur += F * 0.6
        ctx.fillStyle = '#333'
        ctx.fillRect(pad, cur, cappedImgW - pad * 2, 1)
        cur += F * 1.4
        const priceText = `Job Total: $${grandTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
        let pFont = F * 1.3
        ctx.font = `bold ${pFont}px Arial`
        while (ctx.measureText(priceText).width > cappedImgW - pad * 2 && pFont > F * 0.7) {
          pFont -= 2
          ctx.font = `bold ${pFont}px Arial`
        }
        ctx.fillStyle = '#4caf50'
        ctx.fillText(priceText, pad, cur)
        cur += F * 0.4
      }

      // Footer — always at bottom of canvas
      ctx.font = `${F * 0.75}px Arial`
      ctx.fillStyle = '#555'
      ctx.textAlign = 'center'
      ctx.fillText('TopCoat Tech · Estimator', cappedImgW / 2, totalH - F * 0.5)

      await saveToPhotos(canvas, jobName || 'TopCoat-Blueprint')
      if (onSaved) onSaved()
    } catch (err) {
      console.error('Save error:', err)
      // User cancelled share sheet — not a real error
      if (err.name === 'AbortError') {
        setSaving(false)
        return
      }
      alert('Could not save: ' + (err.message || 'Unknown error'))
    } finally { setSaving(false) }
  }

  return (
    <div className="fade-in" style={{ padding:'16px 16px 40px' }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{flex:1,minWidth:0}}>
          {editingJobName ? (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <input type="text" value={jobNameDraft} autoFocus
                onChange={e=>setJobNameDraft(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'){ setJobName(jobNameDraft); setEditingJobName(false) } if(e.key==='Escape'){ setJobNameDraft(jobName); setEditingJobName(false) } }}
                style={{fontWeight:700,fontSize:16,color:'#222',border:'1px solid #ddd',borderRadius:6,padding:'4px 8px',flex:1,minWidth:0}} />
              <button onClick={()=>{ setJobName(jobNameDraft); setEditingJobName(false) }}
                style={{background:ORANGE,color:'#fff',border:'none',borderRadius:6,padding:'6px 10px',fontSize:13,fontWeight:700,cursor:'pointer',flexShrink:0}}>✓</button>
            </div>
          ) : (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{fontWeight:700,fontSize:16,color:'#222',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{jobName || 'Results'}</div>
              <button onClick={()=>{ setJobNameDraft(jobName); setEditingJobName(true) }} title="Edit job name"
                style={{background:'transparent',border:'none',fontSize:13,cursor:'pointer',flexShrink:0,padding:2}}>✏️</button>
            </div>
          )}
          <div style={{fontSize:12,color:'#888'}}>{rooms.length} room{rooms.length!==1?'s':''} traced</div>
        </div>
        <button onClick={onReset} style={{background:'transparent',border:'1px solid #ddd',borderRadius:6,padding:'4px 12px',fontSize:12,color:'#666',cursor:'pointer',flexShrink:0}}>New Job</button>
      </div>

      {/* Blueprint with overlays */}
      <div style={{background:'#111',borderRadius:12,padding:8,marginBottom:16,position:'relative',overflow:'hidden'}}>
        {(() => {
          const zoomRoom = pricingRoomId ? rooms.find(r => r.id === pricingRoomId) : null
          const zt = getRoomZoomTransform(zoomRoom, imgSize)
          return (
        <div style={{position:'relative',transform:`scale(${zt.scale}) translate(${zt.tx}px, ${zt.ty}px)`,transformOrigin:'center center',transition:'transform 0.4s ease'}}>
          <img ref={blueprintRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',borderRadius:8}}
            onLoad={()=>setImgSize({w:blueprintRef.current.clientWidth,h:blueprintRef.current.clientHeight})} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {rooms.map(room => {
              const c = centroid(room.points)
              const labelInches = getLabelInches(labelSizeInches)
              const nameFS = inchesToFontSize(labelInches.name, fracPerFt, imgSize.w||400)
              const sqftFS = inchesToFontSize(labelInches.sqft, fracPerFt, imgSize.w||400)
              const wallFS = inchesToFontSize(labelInches.wall, fracPerFt, imgSize.w||400)
              return (
              <g key={room.id}>
                <polygon points={toSvgPoints(room.points,imgSize.w,imgSize.h)} fill={(room.color||ROOM_COLORS[0]).fill} stroke={(room.color||ROOM_COLORS[0]).border} strokeWidth="2"/>
                {fracPerFt && room.points.map((a, i) => {
                  const b = room.points[(i+1) % room.points.length]
                  const lenFt = edgeLengthFt(a, b, fracPerFt, aspectRatio)
                  if (lenFt < 2) return null
                  const midX = (a.x+b.x)/2, midY = (a.y+b.y)/2
                  const lx = midX + (c.x - midX) * 0.05
                  const ly = midY + (c.y - midY) * 0.05
                  const lpx = lx * imgSize.w, lpy = ly * imgSize.h
                  const apx = a.x*imgSize.w, apy = a.y*imgSize.h, bpx = b.x*imgSize.w, bpy = b.y*imgSize.h
                  let wallAngle = Math.atan2(bpy-apy, bpx-apx) * 180/Math.PI
                  if (wallAngle > 90) wallAngle -= 180
                  if (wallAngle < -90) wallAngle += 180
                  return (
                    <text key={`wall-${room.id}-${i}`} x={lpx} y={lpy}
                      transform={`rotate(${wallAngle} ${lpx} ${lpy}) translate(${lpx} ${lpy}) scale(${wallFS/LABEL_BASE_PX}) translate(${-lpx} ${-lpy})`}
                      textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize={LABEL_BASE_PX} fontWeight="400"
                      style={{filter:'drop-shadow(0 0 2px rgba(255,255,255,0.9))'}}>
                      {feetInchesLabel(lenFt)}
                    </text>
                  )
                })}
                {(() => { const cpx = c.x*imgSize.w, cpy = c.y*imgSize.h; return (<>
                <text x={cpx} y={cpy}
                  transform={`translate(${cpx} ${cpy}) scale(${nameFS/LABEL_BASE_PX}) translate(${-cpx} ${-cpy})`}
                  textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={LABEL_BASE_PX} fontWeight="800"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>
                  {room.name}
                </text>
                <text x={cpx} y={cpy + nameFS*0.9}
                  transform={`translate(${cpx} ${cpy + nameFS*0.9}) scale(${sqftFS/LABEL_BASE_PX}) translate(${-cpx} ${-(cpy + nameFS*0.9)})`}
                  textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={LABEL_BASE_PX} fontWeight="600"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>
                  {room.sqft.toLocaleString()} sf
                </text>
                </>)})()}
              </g>
              )
            })}
          </svg>
        </div>
          )
        })()}
      </div>

      {/* Room legend */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:'#333',marginBottom:12}}>Room Breakdown</div>
        {rooms.map(room => {
          const rPrice = roomPrices[room.id] || ''
          const rLfPrice = roomLfPrices[room.id] || ''
          const areaTotal = getRoomAreaTotal(room)
          const lfTotal = getRoomLfTotal(room)
          const rTotal = areaTotal + lfTotal
          const rCoating = roomCoatings[room.id] || ''
          const isCustomCoating = rCoating && !COATING_TYPES.includes(rCoating)
          const isExpanded = pricingRoomId === room.id
          const doorCount = getDoorCount(room)
          const doorWidth = getDoorWidth(room)
          const lfToPrice = getLfToPrice(room)

          if (!isExpanded) {
            // ── Collapsed row — tap to expand and price this room ──
            return (
              <div key={room.id} onClick={()=>setPricingRoomId(room.id)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',marginBottom:4,borderBottom:'1px solid #f0f0f0',cursor:'pointer'}}>
                <div style={{width:14,height:14,borderRadius:3,background:(room.color||ROOM_COLORS[0]).fill,border:`2px solid ${(room.color||ROOM_COLORS[0]).border}`,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,color:'#222'}}>{room.name}</div>
                  <div style={{fontSize:12,color:'#888'}}>{room.sqft.toLocaleString()} sq ft · {room.perim} ft perimeter{rCoating ? ` · ${rCoating}` : ''}</div>
                  <div style={{fontSize:12,marginTop:2}}>
                    {areaTotal > 0
                      ? <span style={{color:'#4caf50',fontWeight:700}}>Area: ${areaTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                      : <span style={{color:'#aaa',fontStyle:'italic'}}>Area not priced yet</span>}
                    <span style={{color:'#ccc'}}> · </span>
                    {lfTotal > 0
                      ? <span style={{color:'#4caf50',fontWeight:700}}>Perimeter: ${lfTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                      : <span style={{color:'#aaa',fontStyle:'italic'}}>Perimeter not priced yet</span>}
                  </div>
                </div>
                <span style={{fontSize:18,color:'#bbb',flexShrink:0}}>›</span>
              </div>
            )
          }

          // ── Expanded card — actively pricing this room ──
          return (
            <div key={room.id} style={{background:'#fafcfd',border:`2px solid ${ORANGE}`,borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                <div style={{width:14,height:14,borderRadius:3,background:(room.color||ROOM_COLORS[0]).fill,border:`2px solid ${(room.color||ROOM_COLORS[0]).border}`,flexShrink:0}} />
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:'#222'}}>{room.name} <span style={{fontSize:10,color:ORANGE,fontWeight:700}}>PRICING</span></div>
                  <div style={{fontSize:12,color:'#888'}}>{room.sqft.toLocaleString()} sq ft · {room.perim} ft perimeter{rCoating ? ` · ${rCoating}` : ''}</div>
                </div>
              </div>
              {/* Coating selector */}
              <div style={{marginLeft:24,marginBottom:8}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:5}}>
                  {COATING_TYPES.map(c => (
                    <button key={c} onClick={()=>setRoomCoatings(p=>({...p,[room.id]: p[room.id]===c ? '' : c}))}
                      style={{padding:'4px 10px',background:rCoating===c?ORANGE:'#f0f0f0',color:rCoating===c?'#fff':'#444',border:`1px solid ${rCoating===c?ORANGE:'#ddd'}`,borderRadius:16,fontSize:11,cursor:'pointer',fontWeight:rCoating===c?700:400}}>
                      {c}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="Or type a custom coating"
                  value={isCustomCoating ? rCoating : ''}
                  onChange={e=>setRoomCoatings(p=>({...p,[room.id]:e.target.value}))}
                  style={{width:'100%',maxWidth:280,padding:'5px 9px',fontSize:12,border:'1px solid #ddd',borderRadius:6,outline:'none',boxSizing:'border-box'}} />
              </div>
              {/* Area pricing */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:24,marginBottom:10}}>
                <span style={{fontSize:12,color:'#666',flexShrink:0,width:32}}>$/sf</span>
                <div style={{display:'flex',alignItems:'center',border:'1px solid #ddd',borderRadius:6,overflow:'hidden',flex:1,maxWidth:140}}>
                  <span style={{padding:'5px 8px',background:'#f5f5f5',color:'#666',fontSize:13,borderRight:'1px solid #ddd'}}>$</span>
                  <input type="text" inputMode="decimal" placeholder="0.00"
                    value={rPrice}
                    onChange={e=>setRoomPrices(p=>({...p,[room.id]:e.target.value}))}
                    onBlur={e=>setRoomPrices(p=>({...p,[room.id]:formatCurrencyOnBlur(e.target.value)}))}
                    style={{flex:1,padding:'5px 8px',fontSize:14,border:'none',outline:'none',width:80}} />
                </div>
                {areaTotal > 0 && (
                  <span style={{fontSize:13,fontWeight:700,color:'#4caf50'}}>
                    = ${areaTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </span>
                )}
              </div>
              {/* Perimeter pricing — e.g. cove base */}
              <div style={{marginLeft:24,marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'0.3px',marginBottom:6}}>
                  Perimeter Pricing <span style={{fontWeight:400,color:'#999',textTransform:'none'}}>— e.g. cove base</span>
                </div>
                <div style={{background:'#f7f9fb',border:'1px solid #e3e8ec',borderRadius:8,padding:'8px 10px',marginBottom:8,maxWidth:320}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <span style={{fontSize:12,color:'#555'}}>Doorways to exclude</span>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <button onClick={()=>setRoomDoorCounts(p=>({...p,[room.id]:Math.max(0,doorCount-1)}))}
                        style={{width:22,height:22,borderRadius:5,border:'1px solid #ccc',background:'#fff',color:'#555',fontSize:13,cursor:'pointer'}}>−</button>
                      <span style={{fontSize:13,fontWeight:700,width:16,textAlign:'center'}}>{doorCount}</span>
                      <button onClick={()=>setRoomDoorCounts(p=>({...p,[room.id]:doorCount+1}))}
                        style={{width:22,height:22,borderRadius:5,border:'1px solid #ccc',background:'#fff',color:'#555',fontSize:13,cursor:'pointer'}}>+</button>
                      <span style={{fontSize:11,color:'#999'}}>× </span>
                      <input type="text" inputMode="decimal" value={roomDoorWidths[room.id] ?? '3'}
                        onChange={e=>setRoomDoorWidths(p=>({...p,[room.id]:e.target.value}))}
                        style={{width:32,padding:'2px 4px',fontSize:11,border:'1px solid #ddd',borderRadius:4,outline:'none',textAlign:'center'}} />
                      <span style={{fontSize:11,color:'#999'}}>ft</span>
                    </div>
                  </div>
                  <div style={{height:1,background:'#e3e8ec',margin:'6px 0'}}/>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#333'}}>LF to price</span>
                    <span style={{fontSize:13,fontWeight:800,color:ORANGE}}>{Math.round(lfToPrice)} ft</span>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:'#666',flexShrink:0,width:32}}>$/lf</span>
                  <div style={{display:'flex',alignItems:'center',border:'1px solid #ddd',borderRadius:6,overflow:'hidden',flex:1,maxWidth:140}}>
                    <span style={{padding:'5px 8px',background:'#f5f5f5',color:'#666',fontSize:13,borderRight:'1px solid #ddd'}}>$</span>
                    <input type="text" inputMode="decimal" placeholder="0.00"
                      value={rLfPrice}
                      onChange={e=>setRoomLfPrices(p=>({...p,[room.id]:e.target.value}))}
                      onBlur={e=>setRoomLfPrices(p=>({...p,[room.id]:formatCurrencyOnBlur(e.target.value)}))}
                      style={{flex:1,padding:'5px 8px',fontSize:14,border:'none',outline:'none',width:80}} />
                  </div>
                  {lfTotal > 0 && (
                    <span style={{fontSize:13,fontWeight:700,color:'#4caf50'}}>
                      = ${lfTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </span>
                  )}
                </div>
              </div>
              {rTotal > 0 && (
                <div style={{marginLeft:24,paddingTop:8,borderTop:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#555'}}>Room Total</span>
                  <span style={{fontSize:15,fontWeight:800,color:'#4caf50'}}>${rTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>
              )}
              <button onClick={()=>setPricingRoomId(null)}
                style={{width:'100%',padding:11,background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                ✓ Done Pricing This Room
              </button>
            </div>
          )
        })}

        {/* Misc Items — flat-dollar line items not tied to sq ft */}
        <div style={{fontSize:13,fontWeight:700,color:'#222',margin:'12px 0 8px'}}>Misc Items</div>
        {miscItems.map(item => (
          <div key={item.id} style={{background:'#fff',border:'1px solid #eee',borderRadius:8,padding:'10px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
            <input type="text" placeholder="Description (e.g. Trip charge)" value={item.label}
              onChange={e=>setMiscItems(p=>p.map(i=>i.id===item.id?{...i,label:e.target.value}:i))}
              style={{flex:1,minWidth:0,padding:'6px 9px',fontSize:12,border:'1px solid #ddd',borderRadius:6,outline:'none',boxSizing:'border-box'}} />
            <div style={{display:'flex',alignItems:'center',border:'1px solid #ddd',borderRadius:6,overflow:'hidden',flexShrink:0}}>
              <span style={{padding:'6px 7px',background:'#f5f5f5',color:'#666',fontSize:12,borderRight:'1px solid #ddd'}}>$</span>
              <input type="text" inputMode="decimal" placeholder="0.00" value={item.amount}
                onChange={e=>setMiscItems(p=>p.map(i=>i.id===item.id?{...i,amount:e.target.value}:i))}
                onBlur={e=>setMiscItems(p=>p.map(i=>i.id===item.id?{...i,amount:formatCurrencyOnBlur(e.target.value)}:i))}
                style={{width:80,padding:'6px 7px',fontSize:12,border:'none',outline:'none'}} />
            </div>
            <button onClick={()=>setMiscItems(p=>p.filter(i=>i.id!==item.id))} title="Delete item"
              style={{width:26,height:26,borderRadius:6,background:'#fdecea',border:'1px solid #f5c6c6',color:'#c62828',fontSize:13,cursor:'pointer',flexShrink:0}}>🗑️</button>
          </div>
        ))}
        <button onClick={()=>setMiscItems(p=>[...p, { id: Date.now()+Math.random(), label:'', amount:'' }])}
          style={{width:'100%',padding:9,background:'transparent',border:`1.5px dashed ${ORANGE}`,color:ORANGE,borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:16}}>
          + Add Item
        </button>

        {/* Totals */}
        <div style={{background:DARK,borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
          <div>
            <div style={{color:'#aaa',fontSize:16,fontWeight:700}}>Total coating area</div>
            <div style={{color:'#888',fontSize:13,marginTop:2}}>Perimeter: {totalPerim} ft{miscItems.length>0 ? ` · +${miscItems.length} misc item${miscItems.length!==1?'s':''}` : ''}</div>
            {hasAnyPrice && (
              <div style={{color:'#4caf50',fontSize:18,fontWeight:800,marginTop:4}}>
                Job Total: ${grandTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
            )}
          </div>
          <div style={{color:ORANGE,fontSize:36,fontWeight:800,lineHeight:1}}>{totalSqft.toLocaleString()} <span style={{fontSize:16,color:'#aaa',fontWeight:400}}>sq ft</span></div>
        </div>
      </div>

      <div style={{background:'#fff8e1',border:'1px solid #ffe082',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#5d4037',marginBottom:16,lineHeight:1.5}}>
        ⚠️ <strong>Verify on site before ordering materials.</strong> Accuracy depends on calibration precision.
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        style={{width:'100%',padding:'15px',background:reportSaved?'#2e7d32':saving?'#888':ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:saving?'not-allowed':'pointer',marginBottom:10}}>
        {reportSaved ? '✓ Report Saved!' : saving ? 'Building Report…' : '📸 Save Report'}
      </button>
      <button onClick={onEdit} style={{width:'100%',padding:'12px',background:'transparent',color:ORANGE,border:`2px solid ${ORANGE}`,borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:10}}>← Edit Rooms</button>
      <button onClick={onReset} style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>↺ New Job</button>
    </div>
  )
})

// ── Main App ──────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(err) { return { error: err.message } }
  render() {
    if (this.state.error) return (
      <div style={{padding:20,background:'#fdecea',color:'#c62828',fontFamily:'monospace',fontSize:13,wordBreak:'break-all'}}>
        <strong>Crash:</strong> {this.state.error}
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  const [screen,      setScreen]      = useState('upload')
  const [image,       setImage]       = useState(null)
  const [fracPerFt,   setFracPerFt]   = useState(null)
  const [aspectRatio, setAspectRatio] = useState(1.4)
  const [labelSizeInches, setLabelSizeInches] = useState(DEFAULT_LABEL_SIZE_INCHES) // user-adjustable wall-label size; name/sqft scale proportionally
  const [miscItems, setMiscItems] = useState([]) // flat-dollar line items not tied to sq ft — [{id, label, amount}]
  const [rooms,       setRooms]       = useState([])
  const [jobName,     setJobName]     = useState('')
  const [error,       setError]       = useState('')
  const [converting,  setConverting]  = useState(false)
  const [convertProgress, setConvertProgress] = useState(null) // {current,total} while generating PDF page previews
  const [pdfPicker,   setPdfPicker]   = useState(null) // {thumbnails, buffer, name, size} for multi-page PDFs
  const drawScreenRef = useRef() // lets handleBack/reset check for & safely cancel a mid-edit room
  // Persists roughly "where you were zoomed/looking" across Straighten ->
  // Calibrate -> Draw, so zooming in on the room you're about to trace
  // doesn't get thrown away just for moving between screens. Stored as a
  // fraction of the image (not raw pixels) since Straighten's rotate+crop
  // step genuinely changes the image's pixel dimensions between screens.
  const [blueprintView, setBlueprintView] = useState(null)
  const resultsScreenRef = useRef() // lets New Job trigger a save remotely if the user chooses to
  const [reportSaved, setReportSaved] = useState(false) // true once the CURRENT state of the job has been saved
  const [hasSavedOnce, setHasSavedOnce] = useState(false) // true once ANY save has happened this job — picks which warning copy to show
  const [unsavedWarning, setUnsavedWarning] = useState(null) // null | 'unsaved' — controls the New Job warning modal
  const firstRoomsRender = useRef(true)
  useEffect(() => {
    // Any change to the rooms, job name, or label size after a save means
    // that save no longer reflects what's on screen — re-arm the warning
    // rather than silently letting it go stale. This lives at the App
    // level (not inside ResultsScreen) specifically because labelSizeInches
    // can change while ResultsScreen is unmounted (e.g. changed back on
    // Draw, then returning to Results) — a component-local "skip first
    // render" guard would miss that case entirely, since from that
    // component's perspective the new value was already there on mount.
    if (firstRoomsRender.current) { firstRoomsRender.current = false; return }
    setReportSaved(false)
  }, [rooms, jobName, miscItems, labelSizeInches])

  const handleFile = useCallback((payload) => {
    if (payload.loading) { setConverting(true); setError(''); setConvertProgress(payload.progress || null); return }
    setConverting(false); setConvertProgress(null)
    if (payload.error) { setError(payload.error); return }
    if (payload.needsPageSelect) {
      setError('')
      setPdfPicker({ thumbnails: payload.thumbnails, buffer: payload.buffer, name: payload.name, size: payload.size })
      setScreen('pdfPages')
      return
    }
    setError(''); setImage(payload); setScreen('crop'); setBlueprintView(null)
  }, [])

  function handlePdfPageImported(payload) {
    setImage(payload)
    setScreen('crop')
    setBlueprintView(null)
  }

  function handleCropDone(result) {
    setImage(prev => ({ ...prev, ...result }))
    setScreen('straighten')
  }

  async function handleRotateImage() {
    if (!image?.src) return
    const rotatedSrc = await rotateImage90(image.src)
    setImage(prev => ({ ...prev, src: rotatedSrc, base64: rotatedSrc.split(',')[1] }))
  }

  function handleStraightenDone(result) {
    setImage(prev => ({ ...prev, ...result }))
    setScreen('calibrate')
  }

  function handleCalibrateDone(fpf, ar) {
    setFracPerFt(fpf)
    setAspectRatio(ar)
    // Re-entering Draw through Calibrate (e.g. after backing out
    // accidentally) should never discard already-traced rooms. If the
    // scale genuinely changed, recalculate each room's sqft/perim against
    // the new numbers instead — the traced shapes themselves don't need
    // to change, just what they measure out to.
    setRooms(prev => prev.map(r => ({
      ...r,
      sqft: Math.round(polygonAreaFt(r.points, fpf, ar)),
      perim: Math.round(polygonPerimeterFt(r.points, fpf, ar))
    })))
    setScreen('draw')
  }

  function handleBack() {
    if (screen === 'draw' && drawScreenRef.current?.hasLocalUndo()) {
      drawScreenRef.current.undoOneStep()
      return
    }
    if (screen === 'draw' && drawScreenRef.current?.hasActiveRoomEdit()) {
      if (!window.confirm("You're mid-edit on a room. Leave without finishing? Any un-saved changes will be discarded.")) return
      drawScreenRef.current.cancelActiveRoomEdit()
    }
    if (screen === 'pdfPages') { setPdfPicker(null); setImage(null); setScreen('upload') }
    else if (screen === 'crop') {
      if (pdfPicker) setScreen('pdfPages')
      else { setScreen('upload'); setImage(null) }
    }
    else if (screen === 'straighten') setScreen('crop')
    else if (screen === 'calibrate') setScreen('straighten')
    else if (screen === 'draw') setScreen('calibrate')
    else if (screen === 'results') setScreen('draw')
  }

  function performReset() {
    setScreen('upload'); setImage(null); setFracPerFt(null); setRooms([]); setError(''); setConverting(false)
    setJobName(''); setPdfPicker(null); setLabelSizeInches(DEFAULT_LABEL_SIZE_INCHES); setMiscItems([])
    setReportSaved(false); setHasSavedOnce(false); setUnsavedWarning(null); setBlueprintView(null)
  }

  function reset() {
    if (screen === 'draw' && drawScreenRef.current?.hasActiveRoomEdit()) {
      if (!window.confirm("You're mid-edit on a room. Start a new job anyway? Any un-saved changes will be discarded.")) return
      drawScreenRef.current.cancelActiveRoomEdit()
    }
    if (rooms.length > 0 && !reportSaved) { setUnsavedWarning('unsaved'); return }
    // Covers the earlier stages (Straighten/Calibrate) — no rooms traced
    // yet, so the checks above don't apply, but there's still a real
    // uploaded blueprint (and maybe calibration) that would be lost.
    if (rooms.length === 0 && image) {
      if (!window.confirm("You'll lose your uploaded blueprint. Start a new job anyway?")) return
    }
    performReset()
  }

  return (
    <ErrorBoundary>
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .fade-in{animation:fadeIn 0.3s ease forwards} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Header screen={screen} onBack={handleBack} onReset={reset} />
      {screen==='upload'    && <UploadScreen    onFile={handleFile} error={error} converting={converting} convertProgress={convertProgress} jobName={jobName} setJobName={setJobName} />}
      {screen==='crop'      && <CropScreen      image={image} onDone={handleCropDone} onSkip={()=>setScreen('straighten')} />}
      {screen==='pdfPages'  && pdfPicker && <PdfPageScreen thumbnails={pdfPicker.thumbnails} buffer={pdfPicker.buffer} pdfName={pdfPicker.name} pdfSize={pdfPicker.size} jobName={jobName} onImported={handlePdfPageImported} />}
      {screen==='straighten' && <StraightenScreen image={image} onDone={handleStraightenDone} onSkip={()=>setScreen('calibrate')} onRotate={handleRotateImage} blueprintView={blueprintView} setBlueprintView={setBlueprintView} />}
      {screen==='calibrate' && <CalibrateScreen image={image} jobName={jobName} onDone={handleCalibrateDone} blueprintView={blueprintView} setBlueprintView={setBlueprintView} />}
      {screen==='draw'      && <DrawScreen      ref={drawScreenRef} image={image} fracPerFt={fracPerFt} aspectRatio={aspectRatio} rooms={rooms} jobName={jobName} onAddRoom={r=>setRooms(p=>[...p,r])} onRemoveRoom={id=>setRooms(p=>p.filter(r=>r.id!==id))} onUpdateRoom={(id,patch)=>setRooms(p=>p.map(r=>r.id===id?{...r,...patch}:r))} onFinish={()=>setScreen('results')} labelSizeInches={labelSizeInches} setLabelSizeInches={setLabelSizeInches} blueprintView={blueprintView} setBlueprintView={setBlueprintView} />}
      {screen==='results'   && <ResultsScreen   ref={resultsScreenRef} image={image} rooms={rooms} jobName={jobName} setJobName={setJobName} fracPerFt={fracPerFt} aspectRatio={aspectRatio} labelSizeInches={labelSizeInches} miscItems={miscItems} setMiscItems={setMiscItems} reportSaved={reportSaved} onDirty={()=>setReportSaved(false)} onReset={reset} onEdit={()=>setScreen('draw')} onSaved={()=>{ setReportSaved(true); setHasSavedOnce(true) }} />}
      {unsavedWarning && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}
          onClick={()=>setUnsavedWarning(null)}>
          <div style={{background:'#fff',borderRadius:14,padding:20,width:'100%',maxWidth:320}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'#fff3e0',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:12,fontSize:18}}>⚠️</div>
            <div style={{fontSize:15,fontWeight:700,color:'#222',marginBottom:6}}>Unsaved report</div>
            <div style={{fontSize:13,color:'#888',marginBottom:18,lineHeight:1.5}}>
              {hasSavedOnce
                ? "You've made changes since you last saved this report. Starting a new job will discard those changes."
                : "This job's report hasn't been saved yet. Starting a new job will discard it."}
            </div>
            <button onClick={()=>{ setUnsavedWarning(null); if (screen==='results') { resultsScreenRef.current?.triggerSave() } else { setScreen('results') } }}
              style={{width:'100%',padding:11,background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:8}}>
              Save Report First
            </button>
            <button onClick={performReset}
              style={{width:'100%',padding:11,background:'transparent',border:'1.5px solid #f5c6c6',color:'#c62828',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:8}}>
              Discard and Start New Job
            </button>
            <button onClick={()=>setUnsavedWarning(null)} style={{width:'100%',padding:11,background:'transparent',border:'none',color:'#888',fontSize:14,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div style={{textAlign:'center',padding:'12px',color:'#bbb',fontSize:11}}>TopCoat Tech · Estimator</div>
    </div>
    </ErrorBoundary>
  )
}
