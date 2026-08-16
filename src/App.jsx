import React, { useState, useRef, useCallback, useEffect } from 'react'

const ORANGE = '#0077B6'
const DARK   = '#1c1c2e'

// Quick-pick coating types for the Results screen — anything else can be typed in
const COATING_TYPES = ['Epoxy', 'Concrete Overlay', 'Granite Overlay', 'Rubber', 'Rock Carpet']

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

// ── Centroid ─────────────────────────────────────────────────
function centroid(points) {
  return {
    x: points.reduce((s,p)=>s+p.x,0) / points.length,
    y: points.reduce((s,p)=>s+p.y,0) / points.length
  }
}

// ── SVG points string ─────────────────────────────────────────
function toSvgPoints(points, w, h) {
  return points.map(p => `${p.x*w},${p.y*h}`).join(' ')
}

// ── Clamp a fractional image coordinate to [0,1] ────────────────
function clamp01(v) { return Math.min(1, Math.max(0, v)) }

// ── Room label font size, proportional to how big the room renders ──
// Bigger room on screen = bigger label, small room = small label,
// clamped so neither a huge room's text nor a tiny closet's text
// gets absurd. Returns { name, sqft } font sizes in px.
function roomLabelFontSizes(room, imgWpx, imgHpx) {
  let minX=1, minY=1, maxX=0, maxY=0
  room.points.forEach(p => {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  })
  const boxW = (maxX - minX) * imgWpx
  const boxH = (maxY - minY) * imgHpx
  const metric = Math.sqrt(Math.max(boxW * boxH, 1))
  // Cap scales with the image itself — a flat pixel cap looks tiny on a big
  // desktop export or when a single room dominates most of the frame.
  const maxCap = Math.max(imgWpx * 0.07, 24)
  const name = Math.min(Math.max(metric * 0.06, 12), maxCap)
  return { name, sqft: name * 0.65 }
}

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

// ── Render one page of a loaded pdf.js document to a data URL ──
async function renderPdfPageToDataUrl(pdfDoc, pageNum, scale, quality = 0.95) {
  const page = await pdfDoc.getPage(pageNum)
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
async function pdfFileToPageInfo(file) {
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
    const dataUrl = await renderPdfPageToDataUrl(pdfDoc, 1, 3.0, 0.95)
    return { single: true, src: dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg', name: file.name, size: file.size, fromPdf: true }
  }

  const thumbnails = []
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const thumb = await renderPdfPageToDataUrl(pdfDoc, p, 0.35, 0.7)
    thumbnails.push({ pageNum: p, thumb })
  }
  return { single: false, thumbnails, buffer: arrayBuffer, name: file.name, size: file.size }
}

// ── Re-render one specific page of an already-loaded PDF buffer,
// at full import quality (used once the user confirms their pick) ─
async function renderFullPdfPage(arrayBuffer, pageNum) {
  await ensurePdfJs()
  const pdfDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise
  const dataUrl = await renderPdfPageToDataUrl(pdfDoc, pageNum, 3.0, 0.95)
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
async function scanRoomNames(base64, mime, polygonCenter) {
  const centerHint = polygonCenter
    ? `\n\nIMPORTANT: A room was just traced at image position (${(polygonCenter.x*100).toFixed(1)}%, ${(polygonCenter.y*100).toFixed(1)}%). Put the room name at that location FIRST in the array.`
    : ''

  const prompt = `Look carefully at this blueprint floor plan image.
Find and list ALL room names, space labels, and area names printed on it.
Include every labeled space you can see.${centerHint}

Respond ONLY with a JSON array of strings — room names only:
["Most Likely Room", "Other Room", "Another Room"]`

  try {
    const smallBase64 = await compressImage(base64, mime, 0.5)
    const res = await fetch('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: smallBase64, mime: 'image/jpeg', customPrompt: prompt, mode: 'roomlist' })
    })
    const data = await res.json()
    if (!res.ok) return null
    if (Array.isArray(data)) return data
    return null
  } catch { return null }
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

  // Mobile: use Web Share API so iOS can save to Photos
  if (isMobile && navigator.share) {
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
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>TopCoat Tech Blueprint Analyzer</div>
        <div style={{ color: '#888', fontSize: 10 }}>Draw room overlays · AI calculates sq footage</div>
      </div>
      {showReset && (
        <button onClick={onReset} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>↺</button>
      )}
    </div>
  )
}

// ── Upload Screen ─────────────────────────────────────────────
function UploadScreen({ onFile, error, converting, jobName, setJobName }) {
  const [drag, setDrag] = useState(false)
  const uploadRef = useRef()
  const cameraRef = useRef()

  async function handleFiles(files) {
    const file = files[0]
    if (!file) return
    if (file.name?.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      onFile({ loading: true })
      try {
        const info = await pdfFileToPageInfo(file)
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
    reader.onload = e => {
      const src = e.target.result
      const base64 = src.split(',')[1]
      if (!base64 || base64.length < 200) { onFile({ error: 'Image appears empty.' }); return }
      onFile({ src, base64, mime, name: file.name, size: file.size })
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
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => handleFiles(e.target.files)} />

      <div onClick={() => !converting && uploadRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files)}}
        style={{ border:`2px dashed ${drag?ORANGE:'#ccc'}`, borderRadius:14, padding:'24px 20px', textAlign:'center', cursor:converting?'wait':'pointer', background:drag?'#f0faff':'#fff' }}>
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,.pdf,application/pdf" style={{ display:'none' }} onChange={e=>handleFiles(e.target.files)} />
        {converting ? (
          <><div style={{fontSize:28,marginBottom:8}}>⏳</div><div style={{fontWeight:600,fontSize:14,color:'#222'}}>Converting PDF…</div></>
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
const ZoomableBlueprint = React.forwardRef(function ZoomableBlueprint({ onTap, children, style, onZoomChange }, ref) {
  const containerRef = useRef()
  const lastTouchRef = useRef(null)
  const pinchRef     = useRef(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const pendingCenterRef = useRef(null)

  React.useImperativeHandle(ref, () => ({
    centerOn(xAtZoom1, yAtZoom1, targetZoom) {
      const z = Math.min(Math.max(targetZoom, 1), 12)
      const apply = () => {
        const container = containerRef.current
        if (!container) return
        container.scrollLeft = xAtZoom1 * z - container.clientWidth / 2
        container.scrollTop  = yAtZoom1 * z - container.clientHeight / 2
      }
      if (z === zoomRef.current) {
        // Zoom isn't changing, so no re-render will happen — scroll right away
        // rather than waiting on a state change that will never come.
        requestAnimationFrame(apply)
      } else {
        pendingCenterRef.current = apply
        zoomRef.current = z
        setZoom(z)
        onZoomChange && onZoomChange(z)
      }
    }
  }))

  // Apply the pending scroll position once the DOM has re-rendered at the new zoom
  useEffect(() => {
    if (!pendingCenterRef.current) return
    pendingCenterRef.current()
    pendingCenterRef.current = null
  }, [zoom])

  // Desktop drag-to-pan state
  const isDragging = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      // Start pinch
      pinchRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastTouchRef.current = null // cancel any pending tap
    } else if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() }
      pinchRef.current = null
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current !== null) {
      e.preventDefault()
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const delta = newDist / pinchRef.current
      const oldZoom = zoomRef.current
      const newZoom = Math.min(Math.max(oldZoom * delta, 1), 12)

      // Zoom toward pinch midpoint so view stays centered on fingers
      const container = containerRef.current
      if (container && newZoom !== oldZoom) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        const rect = container.getBoundingClientRect()
        const relX = midX - rect.left + container.scrollLeft
        const relY = midY - rect.top  + container.scrollTop
        const ratio = newZoom / oldZoom
        container.scrollLeft = relX * ratio - (midX - rect.left)
        container.scrollTop  = relY * ratio - (midY - rect.top)
      }

      zoomRef.current = newZoom
      setZoom(newZoom)
      onZoomChange && onZoomChange(newZoom)
      pinchRef.current = newDist
      lastTouchRef.current = null
    }
  }

  function onTouchEnd(e) {
    if (pinchRef.current !== null) { pinchRef.current = null; return }
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
  // Regular wheel / trackpad scroll = pan (browser default)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onWheel(e) {
      // Only zoom when Ctrl is held (trackpad pinch also sets ctrlKey)
      if (!e.ctrlKey) return          // ← let browser handle normal scroll = pan

      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left + container.scrollLeft
      const mouseY = e.clientY - rect.top  + container.scrollTop
      const delta = e.deltaY > 0 ? 0.85 : 1.18
      const oldZoom = zoomRef.current
      const newZoom = Math.min(Math.max(oldZoom * delta, 1), 12)
      if (newZoom === oldZoom) return
      const ratio = newZoom / oldZoom
      container.scrollLeft = mouseX * ratio - (e.clientX - rect.left)
      container.scrollTop  = mouseY * ratio - (e.clientY - rect.top)
      zoomRef.current = newZoom
      setZoom(newZoom)
      onZoomChange && onZoomChange(newZoom)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // Desktop drag-to-pan (left mouse button)
  const dragMoved = useRef(false)

  function onMouseDown(e) {
    // Only left button, and only when zoomed (otherwise normal click = tap)
    if (e.button !== 0 || zoomRef.current <= 1.01) return
    isDragging.current = true
    dragMoved.current = false
    lastMouse.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  function onMouseMove(e) {
    if (!isDragging.current) return
    const container = containerRef.current
    if (!container) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true
    container.scrollLeft -= dx
    container.scrollTop  -= dy
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  function onMouseUp() {
    isDragging.current = false
  }

  return (
    <div ref={containerRef}
      style={{
        overflow: 'auto',
        background: '#111',
        position: 'relative',
        cursor: zoom > 1.01 ? 'grab' : 'crosshair',
        WebkitOverflowScrolling: 'touch',
        height: '100%',
        ...style
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
      {/* Outer div expands to hold scaled content so container can scroll */}
      <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minHeight: '100%' }}>
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'none',
          position: 'relative',
          width: `${100 / zoom}%`,
          imageRendering: 'high-quality',
          WebkitImageRendering: 'high-quality',
        }}>
          {children}
        </div>
      </div>
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
function StraightenScreen({ image, jobName, onDone, onSkip }) {
  const [points, setPoints]   = useState([])
  const [zoomLevel, setZoomLevel] = useState(1)
  const [working, setWorking] = useState(false)
  const [straightenErr, setStraightenErr] = useState('')
  const imgRef = useRef()

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
      <div style={{background:'#3d2b56',padding:'9px 16px',display:'flex',alignItems:'center',gap:8}}>
        {jobName && <span style={{color:'#c9a4ff',fontSize:11,fontWeight:700,flexShrink:0}}>{jobName}</span>}
        <span style={{color:'#fff',fontWeight:600,fontSize:14}}>🔄 STRAIGHTEN — tap 2 points on a line that should be level · Pinch to zoom</span>
      </div>

      <ZoomableBlueprint onTap={handleTap} style={{flex:1,minHeight:0,maxHeight:'60vh'}} onZoomChange={setZoomLevel}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {points.map((pt,i) => {
              const w = imgRef.current?.clientWidth || 400
              const h = imgRef.current?.clientHeight || 300
              const arm = 18 / zoomLevel
              const sw  = 2.8 / zoomLevel
              const col = i===0 ? '#8e24aa' : '#00897b'
              const cx  = pt.x * w
              const cy  = pt.y * h
              return (
                <g key={i}>
                  <line x1={cx-arm} y1={cy} x2={cx+arm} y2={cy} stroke="#fff" strokeWidth={sw*2.5}/>
                  <line x1={cx} y1={cy-arm} x2={cx} y2={cy+arm} stroke="#fff" strokeWidth={sw*2.5}/>
                  <line x1={cx-arm} y1={cy} x2={cx+arm} y2={cy} stroke={col} strokeWidth={sw}/>
                  <line x1={cx} y1={cy-arm} x2={cx} y2={cy+arm} stroke={col} strokeWidth={sw}/>
                  <text x={cx} y={cy} dy={-arm*1.6} textAnchor="middle" fill={col}
                    fontSize={Math.max(13/zoomLevel, 9)} fontWeight="bold"
                    style={{filter:'drop-shadow(0 1px 2px rgba(255,255,255,0.9))'}}>{i===0?'1':'2'}</text>
                </g>
              )
            })}
            {points.length===2 && (() => {
              const w = imgRef.current?.clientWidth || 400
              const h = imgRef.current?.clientHeight || 300
              return (
                <line x1={points[0].x*w} y1={points[0].y*h} x2={points[1].x*w} y2={points[1].y*h}
                  stroke="#00897b" strokeWidth={2/zoomLevel} strokeDasharray={`${6/zoomLevel},${4/zoomLevel}`} opacity="0.85"/>
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
            <button onClick={()=>setPoints([])} style={{padding:'6px 10px',background:'transparent',border:'1px solid #ddd',borderRadius:6,fontSize:12,color:'#888',cursor:'pointer',flexShrink:0}}>↺</button>
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
function CalibrateScreen({ image, jobName, onDone }) {
  const [points, setPoints]   = useState([])
  const [knownFt, setKnownFt] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1)
  const imgRef = useRef()

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
    const dy = points[1].y - points[0].y
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
      <ZoomableBlueprint onTap={handleTap} style={{flex:1,minHeight:0,maxHeight:'60vh'}} onZoomChange={setZoomLevel}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
{/* dots only, no line */}
            {points.map((pt,i) => {
              const w = imgRef.current?.clientWidth || 400
              const h = imgRef.current?.clientHeight || 300
              // Absolute pixel coords — same system as the image
              const arm = 18 / zoomLevel
              const sw  = 2.8 / zoomLevel
              const col = i===0 ? '#e53935' : '#1565c0'
              const cx  = pt.x * w
              const cy  = pt.y * h
              return (
                <g key={i}>
                  <line x1={cx-arm} y1={cy} x2={cx+arm} y2={cy} stroke="#fff" strokeWidth={sw*2.5}/>
                  <line x1={cx} y1={cy-arm} x2={cx} y2={cy+arm} stroke="#fff" strokeWidth={sw*2.5}/>
                  <line x1={cx-arm} y1={cy} x2={cx+arm} y2={cy} stroke={col} strokeWidth={sw}/>
                  <line x1={cx} y1={cy-arm} x2={cx} y2={cy+arm} stroke={col} strokeWidth={sw}/>
                  <text x={cx} y={cy} dy={-arm*1.6} textAnchor="middle" fill={col}
                    fontSize={Math.max(13/zoomLevel, 9)} fontWeight="bold"
                    style={{filter:'drop-shadow(0 1px 2px rgba(255,255,255,0.9))'}}>{i===0?'A':'B'}</text>
                </g>
              )
            })}
          </svg>
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
            <button onClick={()=>setPoints([])} style={{padding:'6px 10px',background:'transparent',border:'1px solid #ddd',borderRadius:6,fontSize:12,color:'#888',cursor:'pointer',flexShrink:0}}>↺</button>
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
        <button onClick={()=>canGo&&onDone(fracPerFt, (imgRef.current?.naturalWidth/imgRef.current?.naturalHeight) || 1.4)} disabled={!canGo}
          style={{width:'100%',padding:'11px',background:canGo?ORANGE:'#ccc',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:canGo?'pointer':'not-allowed',boxShadow:canGo?'0 4px 14px rgba(0,119,182,0.35)':'none'}}>
          Continue — Draw Overlays →
        </button>
      </div>
    </div>
  )
}

// ── Drawing Screen ────────────────────────────────────────────
function DrawScreen({ image, fracPerFt, aspectRatio, rooms, jobName, onAddRoom, onRemoveRoom, onUpdateRoom, onFinish }) {
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
  // Move Corner: nudging a single corner of an already-closed room
  const [movingRoomId,     setMovingRoomId]     = useState(null)
  const [movingRoomPoints, setMovingRoomPoints] = useState(null)
  const [selectedCornerIdx, setSelectedCornerIdx] = useState(null)
  const imgRef = useRef()
  const containerRef = useRef()
  const blueprintCtrlRef = useRef()

  // Room names are scanned on-demand when user closes a polygon

  const colorIdx = rooms.length % ROOM_COLORS.length
  const color    = ROOM_COLORS[colorIdx]

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

  // ── Move Corner: hit-test a tap against the room's corners ─────
  function centerOnCorner(pts, idx) {
    if (!imgRef.current || !blueprintCtrlRef.current) return
    const p = pts[idx]
    const baseW = imgRef.current.clientWidth
    const baseH = imgRef.current.clientHeight
    const targetZoom = Math.max(zoomLevel, 5)
    blueprintCtrlRef.current.centerOn(p.x * baseW, p.y * baseH, targetZoom)
  }

  function handleMoveTap(e) {
    const pt = getPoint(e)
    if (!pt || !imgRef.current || !movingRoomPoints) return
    const rect = imgRef.current.getBoundingClientRect()
    const thresh = 30 / rect.width
    let bestIdx = -1, bestDist = Infinity
    movingRoomPoints.forEach((p, idx) => {
      const dx = pt.x - p.x, dy = pt.y - p.y
      const d = Math.sqrt(dx*dx + dy*dy)
      if (d < thresh && d < bestDist) { bestDist = d; bestIdx = idx }
    })
    if (bestIdx >= 0) {
      setSelectedCornerIdx(bestIdx)
      centerOnCorner(movingRoomPoints, bestIdx)
    }
  }

  const NUDGE_INCHES = 1
  function nudgeCorner(dxIn, dyIn) {
    if (selectedCornerIdx == null) return
    setMovingRoomPoints(prev => {
      const next = [...prev]
      const p = next[selectedCornerIdx]
      const fracDx = (dxIn / 12) * fracPerFt
      const fracDy = (dyIn / 12) * fracPerFt * aspectRatio
      next[selectedCornerIdx] = { x: clamp01(p.x + fracDx), y: clamp01(p.y + fracDy) }
      centerOnCorner(next, selectedCornerIdx)
      return next
    })
  }

  function startMoveRoom(room) {
    if (naming || identifying || points.length > 0 || movingRoomId) return
    setMovingRoomId(room.id)
    setMovingRoomPoints([...room.points])
    setSelectedCornerIdx(null)
  }

  function finishMoveRoom() {
    if (!movingRoomId || !movingRoomPoints) return
    const sqft  = Math.round(polygonAreaFt(movingRoomPoints, fracPerFt, aspectRatio))
    const perim = Math.round(polygonPerimeterFt(movingRoomPoints, fracPerFt, aspectRatio))
    onUpdateRoom(movingRoomId, { points: [...movingRoomPoints], sqft, perim })
    setMovingRoomId(null); setMovingRoomPoints(null); setSelectedCornerIdx(null)
  }

  function cancelMoveRoom() {
    setMovingRoomId(null); setMovingRoomPoints(null); setSelectedCornerIdx(null)
  }

  async function handleTap(e) {
    if (naming || identifying) return
    if (movingRoomId) { handleMoveTap(e); return }
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
    // Scan for room names if we haven't yet
    if (scannedNames === null && !scanningNames) {
      setScanningNames(true)
      const polyCenter = centroid(points)
      const names = await scanRoomNames(image.base64, image.mime, polyCenter)
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
        color: roomColor,
        colorIdx: colorIdx || 0
      })
      setPoints([]); setNaming(null); setCustomName('')
      setEditingRoomId(null); setEditingColor(null); setEditingName(''); setEditingOriginalRoom(null)
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

  const [imgSize, setImgSize] = useState({ w: 300, h: 400 })
  useEffect(() => {
    const update = () => { if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background: identifying ? '#ff8f00' : movingRoomId ? '#00695c' : color.solid, padding:'9px 16px', color:'#fff', display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
        {jobName && <span style={{fontSize:11,opacity:0.8,flexShrink:0}}>{jobName} ·</span>}
        <span style={{fontWeight:700,fontSize:14}}>
          {movingRoomId
            ? (selectedCornerIdx==null ? '🎯 MOVE CORNER — tap the corner to nudge' : '🎯 MOVE CORNER — use the arrows to nudge it')
            : naming
              ? `✓ ${naming.sqft.toLocaleString()} sf · ${naming.perim}ft — pick a name below`
              : points.length===0
                ? `✏️ TRACE — Room ${rooms.length+1}, tap corners`
                : `✏️ TRACE — ${editingRoomId ? `Editing "${editingName}" · ` : ''}${points.length} pts · ${points.length>=3 ? 'tap near ⭕ to close' : 'keep tapping corners'}`}
        </span>
      </div>

      {/* Zoomable pinch-to-zoom drawing area - fills all available space */}
      <ZoomableBlueprint ref={blueprintCtrlRef} onTap={e=>{if(!naming&&!identifying)handleTap(e)}} style={{flex:1,maxHeight:'none',minHeight:0}} onZoomChange={setZoomLevel}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false}
            onLoad={()=>setImgSize({w:imgRef.current.clientWidth,h:imgRef.current.clientHeight})} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {rooms.filter(r => r.id !== movingRoomId).map(room => {
              const c = centroid(room.points)
              const w = imgSize.w || 400
              const { name: baseName, sqft: baseSqft } = roomLabelFontSizes(room, imgSize.w||400, imgSize.h||300)
              const fs1 = Math.max(baseName/zoomLevel, 3)   // name font px
              const fs2 = Math.max(baseSqft/zoomLevel, 2.5)   // sqft font px
              const dy2 = Math.max(fs1*0.85, 4)  // offset in px
              const sw  = Math.max(1.5/zoomLevel, 0.4)
              return (
                <g key={room.id}>
                  <polygon points={toSvgPoints(room.points, imgSize.w, imgSize.h)} fill={(room.color||ROOM_COLORS[0]).fill} stroke={(room.color||ROOM_COLORS[0]).border} strokeWidth={`${(2/zoomLevel/((imgSize.w||400)))*100}%`}/>
                  <text x={`${c.x*100}%`} y={`${c.y*100}%`}
                    textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={fs1} fontWeight="800"
                    style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}>
                    {room.name}
                  </text>
                  <text x={`${c.x*100}%`} y={`${c.y*100}%`} dy={dy2}
                    textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={fs2} fontWeight="600"
                    style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}>
                    {room.sqft.toLocaleString()} sf
                  </text>
                </g>
              )
            })}
            {points.length>=2 && (
              <polyline points={toSvgPoints(points, imgSize.w, imgSize.h)} fill="none" stroke={color.border} strokeWidth={`${0.15/zoomLevel}%`} strokeDasharray={`${Math.max(6/zoomLevel,2)},${Math.max(3/zoomLevel,1)}`}/>
            )}
            {naming && (
              <polygon points={toSvgPoints(points, imgSize.w, imgSize.h)} fill={color.fill} stroke={color.border} strokeWidth={`${(2/zoomLevel/((imgSize.w||400)))*100}%`}/>
            )}
            {!naming && points.map((pt,i) => {
              const w = imgSize.w > 0 ? imgSize.w : 400
              const h = imgSize.h > 0 ? imgSize.h : 300
              const arm = 15 / zoomLevel
              const sw  = 2.3 / zoomLevel
              const col = color.border
              const cx  = pt.x * w
              const cy  = pt.y * h
              const isFirst = i === 0
              return (
                <g key={i}>
                  <line x1={cx-arm} y1={cy} x2={cx+arm} y2={cy} stroke="#fff" strokeWidth={sw*2.5}/>
                  <line x1={cx} y1={cy-arm} x2={cx} y2={cy+arm} stroke="#fff" strokeWidth={sw*2.5}/>
                  <line x1={cx-arm} y1={cy} x2={cx+arm} y2={cy} stroke={col} strokeWidth={sw}/>
                  <line x1={cx} y1={cy-arm} x2={cx} y2={cy+arm} stroke={col} strokeWidth={sw}/>
                  <circle cx={cx} cy={cy} r={Math.max(2.2/zoomLevel, 1.2)} fill={col} stroke="#fff" strokeWidth={sw*0.6}/>
                  {isFirst && (
                    <circle cx={cx} cy={cy} r={arm*1.4} fill="none" stroke={col}
                      strokeWidth={sw*0.7} strokeDasharray={`${arm},${arm*0.5}`}/>
                  )}
                </g>
              )
            })}
            {movingRoomPoints && (() => {
              const w = imgSize.w > 0 ? imgSize.w : 400
              const h = imgSize.h > 0 ? imgSize.h : 300
              return (
                <g>
                  <polygon points={toSvgPoints(movingRoomPoints, w, h)} fill="rgba(0,150,136,0.18)" stroke="#00695c" strokeWidth={`${(2/zoomLevel/((imgSize.w||400)))*100}%`} strokeDasharray={`${Math.max(6/zoomLevel,2)},${Math.max(3/zoomLevel,1)}`}/>
                  {movingRoomPoints.map((pt, i) => {
                    const isSel = i === selectedCornerIdx
                    const cx = pt.x * w
                    const cy = pt.y * h
                    const r  = (isSel ? 10 : 6.5) / zoomLevel
                    return (
                      <g key={i}>
                        {isSel && (
                          <circle cx={cx} cy={cy} r={(20/zoomLevel)} fill="none" stroke="#ff6d00"
                            strokeWidth={2.5/zoomLevel} strokeDasharray={`${5/zoomLevel},${4/zoomLevel}`}/>
                        )}
                        <circle cx={cx} cy={cy} r={r} fill={isSel ? '#ff6d00' : '#00695c'} stroke="#fff" strokeWidth={2.5/zoomLevel}/>
                      </g>
                    )
                  })}
                </g>
              )
            })()}
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
              {(scannedNames && scannedNames.length > 0
                ? scannedNames
                : ['Garage','Living Room','Kitchen','Master Bedroom','Bedroom','Bathroom','Dining Room','Foyer','Hallway','Laundry','Office','Porch','Court','Utility','Pantry']
              ).map((n,idx)=>(
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
      {!naming && !movingRoomId && (
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
              <div style={{maxHeight:160,overflowY:'auto',marginBottom:8,WebkitOverflowScrolling:'touch'}}>
                {rooms.map(room => (
                  <div key={room.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:'#fff',border:'1px solid #e8e8e8',borderRadius:7,marginBottom:5}}>
                    <div style={{width:12,height:12,borderRadius:3,background:(room.color||ROOM_COLORS[0]).fill,border:`2px solid ${(room.color||ROOM_COLORS[0]).border}`,flexShrink:0}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#222',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{room.name}</div>
                      <div style={{fontSize:11,color:'#888'}}>{room.sqft.toLocaleString()} sf</div>
                    </div>
                    <button onClick={()=>startEditRoom(room)} title="Add more corners"
                      style={{padding:'6px 9px',background:'#f0f0f0',border:'1px solid #ddd',borderRadius:6,fontSize:13,cursor:'pointer',flexShrink:0}}>✏️</button>
                    <button onClick={()=>startMoveRoom(room)} title="Nudge a corner"
                      style={{padding:'6px 9px',background:'#e0f2f1',border:'1px solid #80cbc4',borderRadius:6,fontSize:13,cursor:'pointer',flexShrink:0}}>🎯</button>
                    <button onClick={()=>onRemoveRoom(room.id)} title="Delete room"
                      style={{padding:'6px 9px',background:'#fdecea',border:'1px solid #f5c6c6',color:'#c62828',borderRadius:6,fontSize:13,cursor:'pointer',flexShrink:0}}>✕</button>
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

      {/* Move Corner panel */}
      {movingRoomId && (
        <div style={{padding:'10px 12px', flexShrink:0, background:'#f4f4f2', borderTop:'2px solid #e0e0e0'}}>
          {selectedCornerIdx == null ? (
            <div style={{background:'#e0f2f1',border:'1px solid #80cbc4',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#00695c',fontWeight:600,marginBottom:10,textAlign:'center'}}>
              🎯 Tap the corner you want to nudge
            </div>
          ) : (
            <>
              <div style={{fontSize:12,color:'#666',textAlign:'center',marginBottom:8}}>
                {NUDGE_INCHES}" per tap
              </div>
              <div style={{display:'grid',gridTemplateColumns:'56px 56px 56px',gridTemplateRows:'44px 44px',justifyContent:'center',gap:6,marginBottom:10}}>
                <div />
                <button onClick={()=>nudgeCorner(0,-NUDGE_INCHES)} style={{background:'#fff',border:'2px solid #00695c',borderRadius:8,fontSize:18,color:'#00695c',cursor:'pointer'}}>▲</button>
                <div />
                <button onClick={()=>nudgeCorner(-NUDGE_INCHES,0)} style={{background:'#fff',border:'2px solid #00695c',borderRadius:8,fontSize:18,color:'#00695c',cursor:'pointer'}}>◀</button>
                <button onClick={()=>nudgeCorner(0,NUDGE_INCHES)} style={{background:'#fff',border:'2px solid #00695c',borderRadius:8,fontSize:18,color:'#00695c',cursor:'pointer'}}>▼</button>
                <button onClick={()=>nudgeCorner(NUDGE_INCHES,0)} style={{background:'#fff',border:'2px solid #00695c',borderRadius:8,fontSize:18,color:'#00695c',cursor:'pointer'}}>▶</button>
              </div>
            </>
          )}
          <div style={{display:'flex',gap:8}}>
            <button onClick={cancelMoveRoom} style={{flex:1,padding:'11px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:14,color:'#888',cursor:'pointer'}}>
              Cancel
            </button>
            <button onClick={finishMoveRoom} style={{flex:2,padding:'11px',background:'#00695c',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>
              ✓ Done Moving Corner
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Results Screen ────────────────────────────────────────────
function ResultsScreen({ image, rooms, jobName, onReset, onEdit }) {
  const totalSqft  = Math.round(rooms.reduce((s,r)=>s+(r.sqft||0),0))
  const totalPerim = Math.round(rooms.reduce((s,r)=>s+(r.perim||0),0))
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [roomPrices, setRoomPrices] = useState({})  // { room.id: pricePerSqft string }
  const [roomCoatings, setRoomCoatings] = useState({}) // { room.id: coating name string }
  const getRoomTotal = (room) => {
    const p = parseFloat(roomPrices[room.id] || '')
    return (!isNaN(p) && p > 0) ? p * (room.sqft || 0) : 0
  }
  const grandTotal = rooms.reduce((s, r) => s + getRoomTotal(r), 0)
  const hasAnyPrice = rooms.some(r => parseFloat(roomPrices[r.id] || '') > 0)
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
      // Calculate exact legend height — generous padding so nothing gets cut off
      const F_est = Math.min(Math.max(Math.round(cappedImgW / 30), 16), 40)
      const legendH = Math.round(
        F_est * 2.0 +                                                    // top pad
        F_est * 2.0 +                                                    // job name
        F_est * 2.0 +                                                    // totals
        (hasAnyPrice ? F_est * 2.5 : 0) +                                 // price line
        F_est * 1.5 +                                                    // divider
        Math.ceil(rooms.length / 2) * F_est * 5.6 +                      // room rows 2-col (name + sqft/perim + coating + price)
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
        // Compute the room's box size in the CROPPED image's own pixel space —
        // room.points are fractions of the full uncropped blueprint, so they must
        // go through the same crop-aware transform used to draw the polygon itself,
        // not be multiplied directly by cappedImgW (which is just the crop's size).
        let rMinX=1, rMinY=1, rMaxX=0, rMaxY=0
        room.points.forEach(p => {
          if (p.x < rMinX) rMinX = p.x
          if (p.y < rMinY) rMinY = p.y
          if (p.x > rMaxX) rMaxX = p.x
          if (p.y > rMaxY) rMaxY = p.y
        })
        const roomBoxWpx = toCanvasX(rMaxX) - toCanvasX(rMinX)
        const roomBoxHpx = toCanvasY(rMaxY) - toCanvasY(rMinY)
        const labelMetric = Math.sqrt(Math.max(roomBoxWpx * roomBoxHpx, 1))
        const labelMaxCap = Math.max(cappedImgW * 0.07, 24)
        const nameFS = Math.min(Math.max(labelMetric * 0.06, 12), labelMaxCap)
        const sqftFS = nameFS * 0.65
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
      // Font size proportional to image width — readable on any size blueprint
      const fSize = Math.min(Math.max(Math.round(cappedImgW / 28), 20), 60)

      // ── Legend with cursor-based exact positioning ──────────
      const F = fSize
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
      const jText = jobName || 'TopCoat Tech Blueprint'
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

      // Price line
      if (hasAnyPrice && grandTotal > 0) {
        cur += F * 1.4
        ctx.font = `bold ${F * 1.3}px Arial`
        ctx.fillStyle = '#4caf50'
        const priceText = `Job Total: $${grandTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
        let pFont = F * 1.3
        ctx.font = `bold ${pFont}px Arial`
        while (ctx.measureText(priceText).width > cappedImgW - pad * 2 && pFont > F * 0.7) {
          pFont -= 2
          ctx.font = `bold ${pFont}px Arial`
        }
        ctx.fillText(priceText, pad, cur)
        cur += F * 0.4
      }

      // Divider
      cur += F * 0.8
      ctx.fillStyle = '#333'
      ctx.fillRect(pad, cur, cappedImgW - pad * 2, 1)
      cur += F * 0.6

      // Room rows — 2 columns to save vertical space
      const swatchSize = F * 1.4
      const roomRowH   = F * 4.3   // room for up to 4 lines: name, sqft/perim, coating, price
      const colW       = (cappedImgW - pad * 2) / 2
      const numRows    = Math.ceil(rooms.length / 2)
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
        const col   = i % 2          // 0 = left, 1 = right
        const row   = Math.floor(i / 2)
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

        const rp = parseFloat(roomPrices[room.id] || '')
        const rt = (!isNaN(rp) && rp > 0) ? rp * (room.sqft||0) : 0
        if (rt > 0) {
          const priceFont = `bold ${F * 0.9}px Arial`
          ctx.fillStyle = '#4caf50'
          ctx.font = priceFont
          const priceText = `$${rt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
          ctx.fillText(fitText(priceText, priceFont, avail), rx + swatchSize + 10, ry + swatchSize * 2.75)
        }
      })
      cur += numRows * roomRowH + F * 1.2

      // Footer — always at bottom of canvas
      ctx.font = `${F * 0.75}px Arial`
      ctx.fillStyle = '#555'
      ctx.textAlign = 'center'
      ctx.fillText('TopCoat Tech · Blueprint Analyzer', cappedImgW / 2, totalH - F * 0.5)

      await saveToPhotos(canvas, jobName || 'TopCoat-Blueprint')
      setSaved(true)
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
        <div>
          <div style={{fontWeight:700,fontSize:16,color:'#222'}}>{jobName || 'Results'}</div>
          <div style={{fontSize:12,color:'#888'}}>{rooms.length} room{rooms.length!==1?'s':''} traced</div>
        </div>
        <button onClick={onReset} style={{background:'transparent',border:'1px solid #ddd',borderRadius:6,padding:'4px 12px',fontSize:12,color:'#666',cursor:'pointer'}}>New Job</button>
      </div>

      {/* Blueprint with overlays */}
      <div style={{background:'#111',borderRadius:12,padding:8,marginBottom:16,position:'relative'}}>
        <div style={{position:'relative'}}>
          <img ref={blueprintRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',borderRadius:8}}
            onLoad={()=>setImgSize({w:blueprintRef.current.clientWidth,h:blueprintRef.current.clientHeight})} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {rooms.map(room => {
              const { name: nameFS, sqft: sqftFS } = roomLabelFontSizes(room, imgSize.w||400, imgSize.h||300)
              return (
              <g key={room.id}>
                <polygon points={toSvgPoints(room.points,imgSize.w,imgSize.h)} fill={(room.color||ROOM_COLORS[0]).fill} stroke={(room.color||ROOM_COLORS[0]).border} strokeWidth="2"/>
                <text x={`${centroid(room.points).x*100}%`} y={`${centroid(room.points).y*100}%`}
                  textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={nameFS} fontWeight="800"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>
                  {room.name}
                </text>
                <text x={`${centroid(room.points).x*100}%`} y={`${centroid(room.points).y*100}%`} dy={nameFS*0.9}
                  textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={sqftFS} fontWeight="600"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>
                  {room.sqft.toLocaleString()} sf
                </text>
              </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Room legend */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:'#333',marginBottom:12}}>Room Breakdown</div>
        {rooms.map(room => {
          const rPrice = roomPrices[room.id] || ''
          const rTotal = getRoomTotal(room)
          const rCoating = roomCoatings[room.id] || ''
          const isCustomCoating = rCoating && !COATING_TYPES.includes(rCoating)
          return (
            <div key={room.id} style={{paddingBottom:12,marginBottom:12,borderBottom:'1px solid #f0f0f0'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                <div style={{width:14,height:14,borderRadius:3,background:(room.color||ROOM_COLORS[0]).fill,border:`2px solid ${(room.color||ROOM_COLORS[0]).border}`,flexShrink:0}} />
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:'#222'}}>{room.name}</div>
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
              {/* Per-room price input */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:24}}>
                <span style={{fontSize:12,color:'#666',flexShrink:0}}>$/sf</span>
                <div style={{display:'flex',alignItems:'center',border:'1px solid #ddd',borderRadius:6,overflow:'hidden',flex:1,maxWidth:140}}>
                  <span style={{padding:'5px 8px',background:'#f5f5f5',color:'#666',fontSize:13,borderRight:'1px solid #ddd'}}>$</span>
                  <input type="text" inputMode="decimal" placeholder="0.00"
                    value={rPrice}
                    onChange={e=>setRoomPrices(p=>({...p,[room.id]:e.target.value}))}
                    style={{flex:1,padding:'5px 8px',fontSize:14,border:'none',outline:'none',width:80}} />
                </div>
                {rTotal > 0 && (
                  <span style={{fontSize:13,fontWeight:700,color:'#4caf50'}}>
                    = ${rTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Totals */}
        <div style={{background:DARK,borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
          <div>
            <div style={{color:'#aaa',fontSize:16,fontWeight:700}}>Total coating area</div>
            <div style={{color:'#888',fontSize:13,marginTop:2}}>Perimeter: {totalPerim} ft</div>
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
        style={{width:'100%',padding:'15px',background:saved?'#2e7d32':saving?'#888':ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:saving?'not-allowed':'pointer',marginBottom:10}}>
        {saved ? '✓ Report Saved!' : saving ? 'Building Report…' : '📸 Save Report'}
      </button>
      <button onClick={onEdit} style={{width:'100%',padding:'12px',background:'transparent',color:ORANGE,border:`2px solid ${ORANGE}`,borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:10}}>← Edit Rooms</button>
      <button onClick={onReset} style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>↺ New Job</button>
    </div>
  )
}

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
  const [rooms,       setRooms]       = useState([])
  const [jobName,     setJobName]     = useState('')
  const [error,       setError]       = useState('')
  const [converting,  setConverting]  = useState(false)
  const [pdfPicker,   setPdfPicker]   = useState(null) // {thumbnails, buffer, name, size} for multi-page PDFs

  const handleFile = useCallback((payload) => {
    if (payload.loading) { setConverting(true); setError(''); return }
    setConverting(false)
    if (payload.error) { setError(payload.error); return }
    if (payload.needsPageSelect) {
      setError('')
      setPdfPicker({ thumbnails: payload.thumbnails, buffer: payload.buffer, name: payload.name, size: payload.size })
      setScreen('pdfPages')
      return
    }
    setError(''); setImage(payload); setScreen('straighten')
  }, [])

  function handlePdfPageImported(payload) {
    setImage(payload)
    setScreen('straighten')
  }

  function handleStraightenDone(result) {
    setImage(prev => ({ ...prev, ...result }))
    setScreen('calibrate')
  }

  function handleCalibrateDone(fpf, ar) {
    setFracPerFt(fpf)
    setAspectRatio(ar)
    setRooms([])
    setScreen('draw')
  }

  function handleBack() {
    if (screen === 'pdfPages') { setPdfPicker(null); setImage(null); setScreen('upload') }
    else if (screen === 'straighten') {
      if (pdfPicker) setScreen('pdfPages')
      else { setScreen('upload'); setImage(null) }
    }
    else if (screen === 'calibrate') setScreen('straighten')
    else if (screen === 'draw') setScreen('calibrate')
    else if (screen === 'results') setScreen('draw')
  }

  function reset() {
    setScreen('upload'); setImage(null); setFracPerFt(null); setRooms([]); setError(''); setConverting(false)
    setJobName(''); setPdfPicker(null)
  }

  return (
    <ErrorBoundary>
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .fade-in{animation:fadeIn 0.3s ease forwards} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Header screen={screen} onBack={handleBack} onReset={reset} />
      {screen==='upload'    && <UploadScreen    onFile={handleFile} error={error} converting={converting} jobName={jobName} setJobName={setJobName} />}
      {screen==='pdfPages'  && pdfPicker && <PdfPageScreen thumbnails={pdfPicker.thumbnails} buffer={pdfPicker.buffer} pdfName={pdfPicker.name} pdfSize={pdfPicker.size} jobName={jobName} onImported={handlePdfPageImported} />}
      {screen==='straighten' && <StraightenScreen image={image} jobName={jobName} onDone={handleStraightenDone} onSkip={()=>setScreen('calibrate')} />}
      {screen==='calibrate' && <CalibrateScreen image={image} jobName={jobName} onDone={handleCalibrateDone} />}
      {screen==='draw'      && <DrawScreen      image={image} fracPerFt={fracPerFt} aspectRatio={aspectRatio} rooms={rooms} jobName={jobName} onAddRoom={r=>setRooms(p=>[...p,r])} onRemoveRoom={id=>setRooms(p=>p.filter(r=>r.id!==id))} onUpdateRoom={(id,patch)=>setRooms(p=>p.map(r=>r.id===id?{...r,...patch}:r))} onFinish={()=>setScreen('results')} />}
      {screen==='results'   && <ResultsScreen   image={image} rooms={rooms} jobName={jobName} onReset={reset} onEdit={()=>setScreen('draw')} />}
      <div style={{textAlign:'center',padding:'12px',color:'#bbb',fontSize:11}}>TopCoat Tech · Blueprint Analyzer</div>
    </div>
    </ErrorBoundary>
  )
}
