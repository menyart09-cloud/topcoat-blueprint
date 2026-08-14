import { useState, useRef, useCallback, useEffect } from 'react'

const ORANGE = '#e85d04'
const DARK   = '#1c1c2e'

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

// ── PDF to high-res image ─────────────────────────────────────
async function pdfToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read PDF'))
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result)
        if (!window.pdfjsLib) {
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
        const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise
        const page = await pdf.getPage(1)
        const scale = 3.0
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
        resolve({ src: dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg', name: file.name, size: file.size, fromPdf: true })
      } catch (err) { reject(new Error('PDF rendering failed: ' + err.message)) }
    }
    reader.readAsArrayBuffer(file)
  })
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

// ── Save blueprint image to photo album ───────────────────────
async function saveToPhotos(canvasEl, jobName) {
  const filename = `${(jobName||'TopCoat').replace(/[^a-zA-Z0-9]/g,'-')}-blueprint.jpg`

  // Build blob from canvas using toDataURL (more iOS-compatible than toBlob)
  const dataUrl = canvasEl.toDataURL('image/jpeg', 0.92)
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  const u8arr = new Uint8Array(bstr.length)
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
  const blob = new Blob([u8arr], { type: mime })
  const file = new File([blob], filename, { type: mime })

  // Web Share API with file — works on iOS Safari and shows native share sheet
  // User picks "Save Image" to Photos
  if (navigator.share) {
    await navigator.share({ files: [file], title: jobName || 'TopCoat Blueprint' })
    return
  }

  // Desktop fallback — trigger download
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
      <div style={{ width: 28, height: 28, background: ORANGE, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9M15 21V9"/>
        </svg>
      </div>
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
      try { onFile(await pdfToImage(file)) }
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

      <button onClick={() => cameraRef.current?.click()} style={{ width:'100%', padding:'16px', background:ORANGE, color:'#fff', border:'none', borderRadius:14, fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:12, boxShadow:'0 4px 16px rgba(232,93,4,0.35)' }}>
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
        style={{ border:`2px dashed ${drag?ORANGE:'#ccc'}`, borderRadius:14, padding:'24px 20px', textAlign:'center', cursor:converting?'wait':'pointer', background:drag?'#fff8f5':'#fff' }}>
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,.pdf,application/pdf" style={{ display:'none' }} onChange={e=>handleFiles(e.target.files)} />
        {converting ? (
          <><div style={{fontSize:28,marginBottom:8}}>⏳</div><div style={{fontWeight:600,fontSize:14,color:'#222'}}>Converting PDF…</div></>
        ) : (
          <><div style={{fontSize:32,marginBottom:8}}>📄</div><div style={{fontWeight:600,fontSize:14,color:'#222',marginBottom:4}}>Upload Blueprint</div><div style={{fontSize:13,color:'#999'}}>PDF · JPG · PNG · WEBP</div><div style={{marginTop:8,display:'inline-block',background:'#fff3e0',color:'#e65100',borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:600}}>✓ PDF supported</div></>
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
// Handles pinch-to-zoom + pan on mobile, click/tap for point placement
function ZoomableBlueprint({ onTap, children, style }) {
  const containerRef = useRef()
  const lastTouchRef = useRef(null)
  const pinchRef     = useRef(null)
  const [zoom, setZoom]     = useState(1)
  const [pan,  setPan]      = useState({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const panRef  = useRef({ x: 0, y: 0 })

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
      const newZoom = Math.min(Math.max(zoomRef.current * delta, 1), 5)
      zoomRef.current = newZoom
      setZoom(newZoom)
      pinchRef.current = newDist
      lastTouchRef.current = null // cancel tap during pinch
    }
  }

  function onTouchEnd(e) {
    if (pinchRef.current !== null) { pinchRef.current = null; return }
    if (!lastTouchRef.current) return
    const t = e.changedTouches[0]
    const dx = Math.abs(t.clientX - lastTouchRef.current.x)
    const dy = Math.abs(t.clientY - lastTouchRef.current.y)
    const dt = Date.now() - lastTouchRef.current.time
    // Only fire tap if finger barely moved and was quick
    if (dx < 12 && dy < 12 && dt < 400) {
      onTap && onTap({ clientX: t.clientX, clientY: t.clientY })
    }
    lastTouchRef.current = null
  }

  return (
    <div ref={containerRef}
      style={{ overflow: 'auto', background: '#111', position: 'relative', cursor: 'crosshair', WebkitOverflowScrolling: 'touch', height: '100%', ...style }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={e => { if (!('ontouchstart' in window)) onTap && onTap(e) }}
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
}

// ── Calibration Screen ────────────────────────────────────────
function CalibrateScreen({ image, jobName, onDone }) {
  const [points, setPoints]   = useState([])
  const [knownFt, setKnownFt] = useState('')
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
    const ft = parseFeetInches(knownFt)
    if (!ft) return null
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    return Math.sqrt(dx*dx + dy*dy) / ft
  }

  const fracPerFt = calcScale()
  const parsedFt  = parseFeetInches(knownFt)
  const scaleOk   = fracPerFt && fracPerFt > 0.001 && fracPerFt < 0.08
  const canGo     = points.length === 2 && scaleOk

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background:'#1a2744',padding:'7px 16px',display:'flex',alignItems:'center',gap:8}}>
        {jobName && <span style={{color:ORANGE,fontSize:11,fontWeight:700,flexShrink:0}}>{jobName}</span>}
        <span style={{color:'#fff',fontWeight:600,fontSize:12}}>Tap A then B on a known dimension line · Pinch to zoom</span>
      </div>

      {/* Zoomable blueprint - max height */}
      <ZoomableBlueprint onTap={handleTap} style={{maxHeight:'72vh'}}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {points.length===2 && (
              <line x1={`${points[0].x*100}%`} y1={`${points[0].y*100}%`}
                    x2={`${points[1].x*100}%`} y2={`${points[1].y*100}%`}
                    stroke="#fff" strokeWidth="2" strokeDasharray="6,3" opacity="0.9"/>
            )}
            {points.map((pt,i) => (
              <g key={i}>
                <circle cx={`${pt.x*100}%`} cy={`${pt.y*100}%`} r="0.6%" fill={i===0?'#e53935':'#1565c0'} stroke="#fff" strokeWidth="0.2%" opacity="0.95"/>
                <circle cx={`${pt.x*100}%`} cy={`${pt.y*100}%`} r="0.2%" fill="#fff" opacity="0.9"/>
                <text x={`${pt.x*100}%`} y={`${pt.y*100}%`} dy="-1.5%" textAnchor="middle" fill="#fff" fontSize="1.5%" fontWeight="bold" style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>{i===0?'A':'B'}</text>
              </g>
            ))}
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
        {/* Distance input row */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <input type="text" placeholder="e.g. 64ft, 28ft 2in, or 144in" value={knownFt}
            onChange={e=>setKnownFt(e.target.value)}
            style={{flex:1,padding:'8px 12px',fontSize:14,border:'2px solid #ddd',borderRadius:8,outline:'none'}} />
          <span style={{fontSize:13,color:'#666',fontWeight:500,flexShrink:0}}>ft</span>
        </div>
        {fracPerFt && (
          <div style={{fontSize:11,color:scaleOk?'#2e7d32':'#c62828',fontWeight:600,marginBottom:6}}>
            {scaleOk ? `✓ Scale OK — ${parsedFt?.toFixed(1)} ft calibrated` : '⚠️ Scale off — use a longer line'}
          </div>
        )}
        <button onClick={()=>canGo&&onDone(fracPerFt, image.naturalWidth/image.naturalHeight || 1.4)} disabled={!canGo}
          style={{width:'100%',padding:'11px',background:canGo?ORANGE:'#ccc',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:canGo?'pointer':'not-allowed'}}>
          Continue — Draw Overlays →
        </button>
      </div>
    </div>
  )
}

// ── Drawing Screen ────────────────────────────────────────────
function DrawScreen({ image, fracPerFt, aspectRatio, rooms, jobName, onAddRoom, onUndo, onFinish }) {
  const [points,      setPoints]      = useState([])
  const [naming,      setNaming]      = useState(null)
  const [customName,  setCustomName]  = useState('')
  const [identifying, setIdentifying] = useState(false)
  const imgRef = useRef()
  const containerRef = useRef()

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

  async function handleTap(e) {
    if (naming || identifying) return
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
    const sqft   = Math.round(polygonAreaFt(points, fracPerFt, aspectRatio))
    const perim  = Math.round(polygonPerimeterFt(points, fracPerFt, aspectRatio))
    const c      = centroid(points)
    setIdentifying(true)
    const aiName = await identifyRoom(image.base64, image.mime, points)
    setIdentifying(false)
    setNaming({ sqft, perim, centroid: c, aiName, color })
    setCustomName(aiName)
  }

  function confirmRoom() {
    const name = customName.trim() || naming.aiName
    onAddRoom({ id: Date.now(), name, sqft: naming.sqft, perim: naming.perim, points: [...points], color, colorIdx })
    setPoints([]); setNaming(null); setCustomName('')
  }

  function cancelRoom() { setPoints([]); setNaming(null); setCustomName('') }

  const [imgSize, setImgSize] = useState({ w: 300, h: 400 })
  useEffect(() => {
    const update = () => { if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight }) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)' }}>
      <div style={{background: identifying ? '#ff8f00' : color.solid, padding:'7px 16px', color:'#fff', display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
        {jobName && <span style={{fontSize:11,opacity:0.8,flexShrink:0}}>{jobName} ·</span>}
        <span style={{fontWeight:700,fontSize:12}}>
          {identifying ? '🤖 AI identifying…' : naming ? `✓ ${naming.sqft.toLocaleString()} sf · ${naming.perim}ft — name it below` : points.length===0 ? `Room ${rooms.length+1} — tap corners to trace` : points.length>=3 ? `${points.length} pts · tap near ⭕ to close` : `${points.length} pts · keep tapping corners`}
        </span>
      </div>

      {/* Zoomable pinch-to-zoom drawing area - fills all available space */}
      <ZoomableBlueprint onTap={e=>{if(!naming&&!identifying)handleTap(e)}} style={{flex:1,maxHeight:'none',minHeight:0}}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',userSelect:'none'}} draggable={false}
            onLoad={()=>setImgSize({w:imgRef.current.clientWidth,h:imgRef.current.clientHeight})} />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {rooms.map(room => (
              <g key={room.id}>
                <polygon points={toSvgPoints(room.points, imgSize.w, imgSize.h)} fill={room.color.fill} stroke={room.color.border} strokeWidth="2"/>
                <text x={`${centroid(room.points).x*100}%`} y={`${centroid(room.points).y*100}%`}
                  textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="10" fontWeight="800"
                  style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}>
                  {room.name}
                </text>
                <text x={`${centroid(room.points).x*100}%`} y={`${centroid(room.points).y*100}%`} dy="13"
                  textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize="9" fontWeight="600"
                  style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}>
                  {room.sqft.toLocaleString()} sf
                </text>
              </g>
            ))}
            {points.length>=2 && (
              <polyline points={toSvgPoints(points, imgSize.w, imgSize.h)} fill="none" stroke={color.border} strokeWidth="2.5" strokeDasharray="6,3"/>
            )}
            {naming && (
              <polygon points={toSvgPoints(points, imgSize.w, imgSize.h)} fill={color.fill} stroke={color.border} strokeWidth="2.5"/>
            )}
            {!naming && points.map((pt,i) => (
              <circle key={i} cx={`${pt.x*100}%`} cy={`${pt.y*100}%`} r="0.6%"
                fill={i===0?color.border:'#fff'} stroke={i===0?'#fff':color.border} strokeWidth="0.2%" opacity="0.9"/>
            ))}
          </svg>
        </div>
      </ZoomableBlueprint>

      {/* Naming panel */}
      {naming && (
        <div style={{padding:'14px 16px',background:'#fff',borderTop:'2px solid #e8e8e8'}}>
          <div style={{fontWeight:700,fontSize:14,color:'#222',marginBottom:4}}>Name this room</div>
          <div style={{fontSize:12,color:'#888',marginBottom:10}}>AI: <strong>{naming.aiName}</strong> · {naming.sqft.toLocaleString()} sq ft · {naming.perim} ft perimeter</div>
          <input type="text" value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Room name"
            style={{width:'100%',padding:'10px 14px',fontSize:16,border:'2px solid #ddd',borderRadius:8,outline:'none',marginBottom:10,boxSizing:'border-box'}} autoFocus />
          <div style={{display:'flex',gap:8}}>
            <button onClick={confirmRoom} style={{flex:2,padding:'12px',background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:'pointer'}}>✓ Add Room</button>
            <button onClick={cancelRoom} style={{flex:1,padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:14,color:'#888',cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Controls */}
      {!naming && (
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
          {rooms.length>0 && points.length===0 && (
            <>
              <button onClick={onUndo} style={{width:'100%',padding:'8px',background:'transparent',border:'1px solid #ddd',borderRadius:7,fontSize:12,color:'#888',cursor:'pointer',marginBottom:6}}>✕ Remove Last Room</button>
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
    </div>
  )
}

// ── Results Screen ────────────────────────────────────────────
function ResultsScreen({ image, rooms, jobName, onReset, onEdit }) {
  const totalSqft  = Math.round(rooms.reduce((s,r)=>s+(r.sqft||0),0))
  const totalPerim = Math.round(rooms.reduce((s,r)=>s+(r.perim||0),0))
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [pricePerSqft, setPricePerSqft] = useState('')
  const totalPrice = pricePerSqft && !isNaN(parseFloat(pricePerSqft))
    ? (totalSqft * parseFloat(pricePerSqft)).toFixed(2)
    : null
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

      // Legend sizing — each room gets a row
      // Legend sized to ~35% of image height, rows fit within that
      // Cap to iOS canvas limits while preserving aspect ratio
      const maxW = 3800
      const aspectRatio = imgH / imgW
      const cappedImgW = Math.min(imgW, maxW)
      const cappedImgH = Math.round(cappedImgW * aspectRatio)
      const legendH = Math.round(cappedImgH * 0.75)
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

      // Blueprint — draw at correct aspect ratio
      ctx.drawImage(img, 0, 0, cappedImgW, cappedImgH)

      // Room polygons
      rooms.forEach(room => {
        if (!room.points || room.points.length < 3) return
        ctx.beginPath()
        room.points.forEach((pt, i) => {
          const x = pt.x * cappedImgW
          const y = pt.y * cappedImgH
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.fillStyle = room.color?.fill || 'rgba(255,100,100,0.3)'
        ctx.fill()
        ctx.strokeStyle = room.color?.border || '#e53935'
        ctx.lineWidth = 3
        ctx.stroke()
        const c = centroid(room.points)
        ctx.fillStyle = room.color?.border || '#e53935'
        ctx.font = 'bold 16px Arial'
        ctx.textAlign = 'center'
ctx.fillText(room.name || 'Room', c.x * cappedImgW, c.y * cappedImgH - 4)
        ctx.font = '13px Arial'
        ctx.fillStyle = '#fff'
ctx.fillText(`${(room.sqft||0).toLocaleString()} sf`, c.x * cappedImgW, c.y * cappedImgH + 14)
      })

      // ── Legend section ────────────────────────────────────────
      const ly = cappedImgH
      const pad = 20
      const fSize = Math.round(legendH / (rooms.length * 3.5 + 5)) // fits text within legend area

      // ── Legend with cursor-based exact positioning ──────────
      const F = fSize
      let cur = ly

      // Orange divider
      ctx.fillStyle = ORANGE
      ctx.fillRect(0, cur, cappedImgW, 4)
      cur += 4

      // Job name
      cur += F * 1.4
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${F * 1.6}px Arial`
      ctx.fillText(jobName || 'TopCoat Tech Blueprint', pad, cur)
      cur += F * 0.6

      // Totals
      cur += F * 1.2
      ctx.font = `${F * 1.1}px Arial`
      ctx.fillStyle = '#e85d04'
      ctx.fillText(`Total: ${totalSqft.toLocaleString()} sq ft  |  ${totalPerim} ft perimeter`, pad, cur)
      cur += F * 0.4

      // Price line
      if (totalPrice) {
        cur += F * 1.4
        ctx.font = `bold ${F * 1.3}px Arial`
        ctx.fillStyle = '#4caf50'
        const priceText = `Job Total: $${parseFloat(totalPrice).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}  @  $${parseFloat(pricePerSqft).toFixed(2)}/sf`
        // Auto-shrink font if text too wide
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

      // Room rows
      const swatchSize = F * 1.4
      const roomRowH = F * 2.4
      rooms.forEach((room, i) => {
        const ry = cur + i * roomRowH
        ctx.fillStyle = room.color?.border || '#e53935'
        ctx.fillRect(pad, ry, swatchSize, swatchSize)
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${F * 1.1}px Arial`
        ctx.fillText(room.name || 'Room', pad + swatchSize + 12, ry + swatchSize * 0.65)
        ctx.font = `${F * 0.9}px Arial`
        ctx.fillStyle = '#aaaaaa'
        ctx.fillText(`${(room.sqft||0).toLocaleString()} sq ft  ·  ${room.perim||0} ft perimeter`, pad + swatchSize + 12, ry + swatchSize * 1.35)
      })
      cur += rooms.length * roomRowH + F * 1.2

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
            {rooms.map(room => (
              <g key={room.id}>
                <polygon points={toSvgPoints(room.points,imgSize.w,imgSize.h)} fill={room.color.fill} stroke={room.color.border} strokeWidth="2"/>
                <text x={`${centroid(room.points).x*100}%`} y={`${centroid(room.points).y*100}%`}
                  textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="10" fontWeight="800"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>
                  {room.name}
                </text>
                <text x={`${centroid(room.points).x*100}%`} y={`${centroid(room.points).y*100}%`} dy="13"
                  textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize="9" fontWeight="600"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}>
                  {room.sqft.toLocaleString()} sf
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Room legend */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:'#333',marginBottom:12}}>Room Breakdown</div>
        {rooms.map(room => (
          <div key={room.id} style={{display:'flex',alignItems:'center',gap:10,paddingBottom:10,marginBottom:10,borderBottom:'1px solid #f0f0f0'}}>
            <div style={{width:14,height:14,borderRadius:3,background:room.color.fill,border:`2px solid ${room.color.border}`,flexShrink:0}} />
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:14,color:'#222'}}>{room.name}</div>
              <div style={{fontSize:12,color:'#888'}}>{room.sqft.toLocaleString()} sq ft · {room.perim} ft perimeter</div>
            </div>
          </div>
        ))}

        {/* Totals */}
        <div style={{background:DARK,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
          <div>
            <div style={{color:'#aaa',fontSize:12}}>Total coating area</div>
            <div style={{color:'#666',fontSize:11,marginTop:1}}>Total perimeter: {totalPerim} ft</div>
          </div>
          <div style={{color:ORANGE,fontSize:28,fontWeight:800,lineHeight:1}}>{totalSqft.toLocaleString()} <span style={{fontSize:13,color:'#aaa',fontWeight:400}}>sq ft</span></div>
        </div>
      </div>

      {/* Pricing calculator */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:'#222',marginBottom:10}}>💰 Job Pricing</div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <span style={{fontSize:13,color:'#666',flexShrink:0}}>Price per sq ft</span>
          <div style={{display:'flex',alignItems:'center',flex:1,border:'2px solid #ddd',borderRadius:8,overflow:'hidden'}}>
            <span style={{padding:'8px 10px',background:'#f5f5f5',color:'#666',fontSize:15,borderRight:'1px solid #ddd'}}>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={pricePerSqft}
              onChange={e=>setPricePerSqft(e.target.value)}
              style={{flex:1,padding:'8px 12px',fontSize:16,border:'none',outline:'none'}}
            />
          </div>
        </div>
        {totalPrice && (
          <div style={{background:DARK,borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{color:'#aaa',fontSize:12}}>Estimated job total</div>
              <div style={{color:'#666',fontSize:11,marginTop:1}}>{totalSqft.toLocaleString()} sq ft × ${parseFloat(pricePerSqft).toFixed(2)}/sf</div>
            </div>
            <div style={{color:'#4caf50',fontSize:28,fontWeight:800,lineHeight:1}}>
              ${parseFloat(totalPrice).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
          </div>
        )}
      </div>

      <div style={{background:'#fff8e1',border:'1px solid #ffe082',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#5d4037',marginBottom:16,lineHeight:1.5}}>
        ⚠️ <strong>Verify on site before ordering materials.</strong> Accuracy depends on calibration precision.
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        style={{width:'100%',padding:'15px',background:saved?'#2e7d32':saving?'#888':ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:saving?'not-allowed':'pointer',marginBottom:10}}>
        {saved ? '✓ Done — tap Save Image in share sheet' : saving ? 'Building image…' : '📸 Save Image'}
      </button>
      <button onClick={onEdit} style={{width:'100%',padding:'12px',background:'transparent',color:ORANGE,border:`2px solid ${ORANGE}`,borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:10}}>← Edit Rooms</button>
      <button onClick={onReset} style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>↺ New Job</button>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [screen,      setScreen]      = useState('upload')
  const [image,       setImage]       = useState(null)
  const [fracPerFt,   setFracPerFt]   = useState(null)
  const [aspectRatio, setAspectRatio] = useState(1.4)
  const [rooms,       setRooms]       = useState([])
  const [jobName,     setJobName]     = useState('')
  const [error,       setError]       = useState('')
  const [converting,  setConverting]  = useState(false)

  const handleFile = useCallback((payload) => {
    if (payload.loading) { setConverting(true); setError(''); return }
    setConverting(false)
    if (payload.error) { setError(payload.error); return }
    setError(''); setImage(payload); setScreen('calibrate')
  }, [])

  function handleCalibrateDone(fpf, ar) {
    setFracPerFt(fpf)
    setAspectRatio(ar)
    setRooms([])
    setScreen('draw')
  }

  function handleBack() {
    if (screen === 'calibrate') { setScreen('upload'); setImage(null) }
    else if (screen === 'draw') setScreen('calibrate')
    else if (screen === 'results') setScreen('draw')
  }

  function reset() {
    setScreen('upload'); setImage(null); setFracPerFt(null); setRooms([]); setError(''); setConverting(false)
    // Keep job name so they can reuse it
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .fade-in{animation:fadeIn 0.3s ease forwards} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Header screen={screen} onBack={handleBack} onReset={reset} />
      {screen==='upload'    && <UploadScreen    onFile={handleFile} error={error} converting={converting} jobName={jobName} setJobName={setJobName} />}
      {screen==='calibrate' && <CalibrateScreen image={image} jobName={jobName} onDone={handleCalibrateDone} />}
      {screen==='draw'      && <DrawScreen      image={image} fracPerFt={fracPerFt} aspectRatio={aspectRatio} rooms={rooms} jobName={jobName} onAddRoom={r=>setRooms(p=>[...p,r])} onUndo={()=>setRooms(p=>p.slice(0,-1))} onFinish={()=>setScreen('results')} />}
      {screen==='results'   && <ResultsScreen   image={image} rooms={rooms} jobName={jobName} onReset={reset} onEdit={()=>setScreen('draw')} />}
      <div style={{textAlign:'center',padding:'12px',color:'#bbb',fontSize:11}}>TopCoat Tech · Blueprint Analyzer</div>
    </div>
  )
}
