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

// ── Polygon area in ft² using shoelace formula ────────────────
function polygonAreaFt(points, fracPerFt, imgW, imgH) {
  if (points.length < 3) return 0
  // Convert fraction coords to feet
  const pts = points.map(p => ({ x: p.x / fracPerFt, y: (p.y * (imgH/imgW)) / fracPerFt }))
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y
    area -= pts[j].x * pts[i].y
  }
  return Math.abs(area / 2)
}

// ── Polygon centroid ──────────────────────────────────────────
function centroid(points) {
  const x = points.reduce((s,p) => s+p.x, 0) / points.length
  const y = points.reduce((s,p) => s+p.y, 0) / points.length
  return { x, y }
}

// ── Points to SVG polygon string ─────────────────────────────
function toSvgPoints(points, w, h) {
  return points.map(p => `${p.x*w},${p.y*h}`).join(' ')
}

// ── AI room name lookup ───────────────────────────────────────
async function identifyRoom(base64, mime, polygon) {
  const pts = polygon.map(p => `(${(p.x*100).toFixed(1)}%, ${(p.y*100).toFixed(1)}%)`).join(', ')
  const prompt = `This is a blueprint floor plan. A polygon has been drawn over one room at these positions (as % of image): ${pts}. 
  
What room is inside or nearest to this polygon? Look at any room labels, text, or symbols inside the polygon area.

Respond ONLY with a JSON object:
{"name": "Room Name", "confidence": "high/medium/low"}`

  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64, mime,
      customPrompt: prompt,
      mode: 'identify'
    })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'AI error')
  return data
}

// ── Header ────────────────────────────────────────────────────
function Header() {
  return (
    <div style={{ background: DARK, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ width: 36, height: 36, background: ORANGE, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9M15 21V9"/>
        </svg>
      </div>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>TopCoat Blueprint Analyzer</div>
        <div style={{ color: '#888', fontSize: 11 }}>Draw room overlays · AI calculates sq footage</div>
      </div>
    </div>
  )
}

// ── Upload Screen ─────────────────────────────────────────────
function UploadScreen({ onFile, error, converting }) {
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
    <div style={{ padding: '24px 16px' }}>
      <button onClick={() => cameraRef.current?.click()} style={{ width:'100%', padding:'18px', background:ORANGE, color:'#fff', border:'none', borderRadius:14, fontSize:17, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:12, boxShadow:'0 4px 16px rgba(232,93,4,0.35)' }}>
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
        style={{ border:`2px dashed ${drag?ORANGE:'#ccc'}`, borderRadius:14, padding:'28px 20px', textAlign:'center', cursor:converting?'wait':'pointer', background:drag?'#fff8f5':'#fff' }}>
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,.pdf,application/pdf" style={{ display:'none' }} onChange={e=>handleFiles(e.target.files)} />
        {converting ? (
          <><div style={{fontSize:32,marginBottom:10}}>⏳</div><div style={{fontWeight:600,fontSize:15,color:'#222'}}>Converting PDF…</div><div style={{fontSize:13,color:'#999'}}>Rendering high-resolution image</div></>
        ) : (
          <><div style={{fontSize:36,marginBottom:10}}>📄</div><div style={{fontWeight:600,fontSize:15,color:'#222',marginBottom:4}}>Upload Blueprint</div><div style={{fontSize:13,color:'#999'}}>PDF · JPG · PNG · WEBP</div><div style={{marginTop:8,display:'inline-block',background:'#fff3e0',color:'#e65100',borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:600}}>✓ PDF supported</div></>
        )}
      </div>
      {error && <div style={{marginTop:12,background:'#fdecea',border:'1px solid #f5c6c6',borderRadius:8,padding:'12px 14px',color:'#c62828',fontSize:13}}>⚠️ {error}</div>}
      <div style={{marginTop:20,background:'#fff',borderRadius:12,padding:'14px 16px',border:'1px solid #e8e8e8'}}>
        <div style={{fontWeight:600,fontSize:13,color:'#444',marginBottom:8}}>How it works</div>
        <div style={{fontSize:13,color:'#666',lineHeight:1.8}}>
          1️⃣ Upload your blueprint (PDF or photo)<br/>
          2️⃣ Set the scale by tapping a known dimension<br/>
          3️⃣ Trace each room by tapping its corners<br/>
          4️⃣ AI names each room · Sq footage auto-calculates
        </div>
      </div>
    </div>
  )
}

// ── Calibration Screen ────────────────────────────────────────
function CalibrateScreen({ image, onDone }) {
  const [points, setPoints] = useState([])
  const [knownFt, setKnownFt] = useState('')
  const imgRef = useRef()

  function handleTap(e) {
    if (points.length >= 2) { setPoints([]); return }
    const rect = imgRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    setPoints(p => [...p, {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top)  / rect.height
    }])
  }

  function calcScale() {
    if (points.length < 2 || !knownFt || isNaN(parseFloat(knownFt))) return null
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    return Math.sqrt(dx*dx + dy*dy) / parseFloat(knownFt)
  }

  const fracPerFt = calcScale()
  const scaleOk   = fracPerFt && fracPerFt > 0.001 && fracPerFt < 0.08
  const canGo     = points.length === 2 && fracPerFt && scaleOk

  return (
    <div style={{ padding:'0 0 40px' }}>
      <div style={{background:'#1a2744',padding:'14px 16px',marginBottom:0}}>
        <div style={{color:'#fff',fontWeight:700,fontSize:14,marginBottom:4}}>Step 1 — Set the Scale</div>
        <div style={{color:'#aaa',fontSize:13,lineHeight:1.5}}>Find a dimension line on the blueprint with a known length. Tap each end of it.</div>
      </div>

      {/* Blueprint tap area */}
      <div style={{position:'relative',background:'#111',touchAction:'none',cursor:'crosshair'}}
        onClick={handleTap} onTouchEnd={e=>{e.preventDefault();handleTap(e)}}>
        <img ref={imgRef} src={image.src} alt="Blueprint" style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
        <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
          {points.length===2 && (
            <line x1={`${points[0].x*100}%`} y1={`${points[0].y*100}%`}
                  x2={`${points[1].x*100}%`} y2={`${points[1].y*100}%`}
                  stroke="#fff" strokeWidth="2" strokeDasharray="6,3" opacity="0.9"/>
          )}
          {points.map((pt,i) => (
            <g key={i}>
              <circle cx={`${pt.x*100}%`} cy={`${pt.y*100}%`} r="8" fill={i===0?'#e53935':'#1565c0'} stroke="#fff" strokeWidth="2"/>
              <text x={`${pt.x*100}%`} y={`${pt.y*100}%`} dy="-12" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">{i===0?'A':'B'}</text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{padding:'16px 16px 0'}}>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <div style={{flex:1,padding:'10px',background:points.length>=1?'#e8f5e9':'#f5f5f5',border:`1px solid ${points.length>=1?'#a5d6a7':'#ddd'}`,borderRadius:8,textAlign:'center',fontSize:13,fontWeight:600,color:points.length>=1?'#2e7d32':'#999'}}>
            {points.length>=1?'✓ Point A':'Tap Point A'}
          </div>
          <div style={{flex:1,padding:'10px',background:points.length>=2?'#e8f5e9':'#f5f5f5',border:`1px solid ${points.length>=2?'#a5d6a7':'#ddd'}`,borderRadius:8,textAlign:'center',fontSize:13,fontWeight:600,color:points.length>=2?'#2e7d32':'#999'}}>
            {points.length>=2?'✓ Point B':'Tap Point B'}
          </div>
        </div>

        <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:10,padding:'14px',marginBottom:12}}>
          <div style={{fontWeight:600,fontSize:13,color:'#444',marginBottom:8}}>Distance between A and B</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="number" placeholder="e.g. 64" value={knownFt} onChange={e=>setKnownFt(e.target.value)}
              style={{flex:1,padding:'10px 14px',fontSize:18,border:'2px solid #ddd',borderRadius:8,outline:'none'}} />
            <span style={{fontSize:15,color:'#666',fontWeight:500}}>feet</span>
          </div>
          {fracPerFt && (
            <div style={{marginTop:8,fontSize:12,color:scaleOk?'#2e7d32':'#c62828',fontWeight:600}}>
              {scaleOk ? `✓ Scale set — 1 ft = ${(fracPerFt*100).toFixed(2)}% of image width` : '⚠️ Scale looks off — try tapping a longer dimension line'}
            </div>
          )}
        </div>

        {points.length>0 && <button onClick={()=>setPoints([])} style={{width:'100%',padding:'10px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer',marginBottom:10}}>↺ Reset Points</button>}

        <button onClick={()=>canGo&&onDone(fracPerFt)} disabled={!canGo}
          style={{width:'100%',padding:'15px',background:canGo?ORANGE:'#ccc',color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:canGo?'pointer':'not-allowed'}}>
          Continue — Draw Room Overlays →
        </button>
        <div style={{fontSize:12,color:'#999',textAlign:'center',marginTop:10}}>Tap the blueprint again to reset the points</div>
      </div>
    </div>
  )
}

// ── Drawing Screen ────────────────────────────────────────────
function DrawScreen({ image, fracPerFt, rooms, onAddRoom, onUndo, onFinish }) {
  const [points, setPoints] = useState([])
  const [naming, setNaming] = useState(null)   // { sqft, centroid, aiName, color }
  const [customName, setCustomName] = useState('')
  const [identifying, setIdentifying] = useState(false)
  const imgRef = useRef()
  const svgRef = useRef()

  const colorIdx = rooms.length % ROOM_COLORS.length
  const color = ROOM_COLORS[colorIdx]

  // Get actual image dimensions for area calc
  const imgW = imgRef.current?.naturalWidth  || 1000
  const imgH = imgRef.current?.naturalHeight || 800

  function getPoint(e) {
    const rect = imgRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top)  / rect.height
    }
  }

  async function handleTap(e) {
    if (naming || identifying) return
    e.preventDefault()
    const pt = getPoint(e)

    // Check if tapping near first point to close polygon
    if (points.length >= 3) {
      const first = points[0]
      const rect = imgRef.current.getBoundingClientRect()
      const closeThresh = 30 / rect.width // 30px close threshold
      const dx = pt.x - first.x
      const dy = pt.y - first.y
      if (Math.sqrt(dx*dx + dy*dy) < closeThresh) {
        await closePolygon()
        return
      }
    }
    setPoints(p => [...p, pt])
  }

  async function closePolygon() {
    if (points.length < 3) return
    const sqft = Math.round(polygonAreaFt(points, fracPerFt, imgW, imgH))
    const c = centroid(points)
    setIdentifying(true)

    let aiName = 'Room'
    try {
      const result = await identifyRoom(image.base64, image.mime, points)
      aiName = result?.name || 'Room'
    } catch(e) { aiName = 'Room' }

    setIdentifying(false)
    setNaming({ sqft, centroid: c, aiName, color })
    setCustomName(aiName)
  }

  function confirmRoom() {
    const name = customName.trim() || naming.aiName
    onAddRoom({
      id: Date.now(),
      name,
      sqft: naming.sqft,
      points: [...points],
      color: naming.color,
      colorIdx
    })
    setPoints([])
    setNaming(null)
    setCustomName('')
  }

  function cancelRoom() {
    setPoints([])
    setNaming(null)
    setCustomName('')
  }

  const svgW = imgRef.current?.getBoundingClientRect().width  || 300
  const svgH = imgRef.current?.getBoundingClientRect().height || 400

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* Top instruction bar */}
      <div style={{background: identifying ? '#ff8f00' : color.solid, padding:'12px 16px', color:'#fff'}}>
        {identifying ? (
          <div style={{fontWeight:700,fontSize:14}}>🤖 AI is identifying the room…</div>
        ) : naming ? (
          <div style={{fontWeight:700,fontSize:14}}>✓ Room traced — {naming.sqft.toLocaleString()} sq ft · Confirm name below</div>
        ) : (
          <>
            <div style={{fontWeight:700,fontSize:14}}>
              {points.length === 0 ? `Room ${rooms.length+1} — Tap to start tracing` : `${points.length} point${points.length!==1?'s':''} placed · ${points.length>=3?'Tap near ⭕ start point to close':'Keep tapping corners'}`}
            </div>
            <div style={{fontSize:12,opacity:0.85,marginTop:2}}>Trace the room walls · Works for L-shapes and any shape</div>
          </>
        )}
      </div>

      {/* Blueprint drawing area */}
      <div style={{position:'relative',background:'#111',touchAction:'none',cursor:'crosshair'}}
        onClick={handleTap} onTouchEnd={handleTap}>
        <img ref={imgRef} src={image.src} alt="Blueprint" style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />

        <svg ref={svgRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
          {/* Completed rooms */}
          {rooms.map((room,i) => (
            <g key={room.id}>
              <polygon
                points={toSvgPoints(room.points, svgW, svgH)}
                fill={room.color.fill} stroke={room.color.border} strokeWidth="2"
              />
              <text
                x={`${centroid(room.points).x*100}%`}
                y={`${centroid(room.points).y*100}%`}
                textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize="10" fontWeight="800"
                style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}
              >
                {room.name}
              </text>
              <text
                x={`${centroid(room.points).x*100}%`}
                y={`${centroid(room.points).y*100}%`}
                dy="13"
                textAnchor="middle" dominantBaseline="middle"
                fill="rgba(255,255,255,0.85)" fontSize="9" fontWeight="600"
                style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'}}
              >
                {room.sqft.toLocaleString()} sf
              </text>
            </g>
          ))}

          {/* Current polygon being drawn */}
          {points.length >= 2 && (
            <polyline
              points={toSvgPoints(points, svgW, svgH)}
              fill="none" stroke={color.border} strokeWidth="2.5" strokeDasharray="6,3"
            />
          )}
          {naming && (
            <polygon
              points={toSvgPoints(points, svgW, svgH)}
              fill={color.fill} stroke={color.border} strokeWidth="2.5"
            />
          )}

          {/* Current points */}
          {!naming && points.map((pt,i) => (
            <g key={i}>
              <circle
                cx={`${pt.x*100}%`} cy={`${pt.y*100}%`}
                r={i===0?10:6}
                fill={i===0?color.border:'#fff'}
                stroke={i===0?'#fff':color.border}
                strokeWidth="2"
                opacity="0.9"
              />
              {i===0 && <text x={`${pt.x*100}%`} cy={`${pt.y*100}%`} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="10" fontWeight="800">⭕</text>}
            </g>
          ))}
        </svg>
      </div>

      {/* Room naming panel */}
      {naming && (
        <div style={{padding:'16px',background:'#fff',borderTop:'2px solid #e8e8e8'}}>
          <div style={{fontWeight:700,fontSize:14,color:'#222',marginBottom:4}}>Name this room</div>
          <div style={{fontSize:12,color:'#888',marginBottom:10}}>AI identified: <strong>{naming.aiName}</strong> · {naming.sqft.toLocaleString()} sq ft</div>
          <input
            type="text" value={customName} onChange={e=>setCustomName(e.target.value)}
            placeholder="Room name"
            style={{width:'100%',padding:'10px 14px',fontSize:16,border:'2px solid #ddd',borderRadius:8,outline:'none',marginBottom:10,boxSizing:'border-box'}}
            autoFocus
          />
          <div style={{display:'flex',gap:8}}>
            <button onClick={confirmRoom} style={{flex:2,padding:'12px',background:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:'pointer'}}>
              ✓ Add Room
            </button>
            <button onClick={cancelRoom} style={{flex:1,padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:14,color:'#888',cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      {!naming && (
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            {points.length >= 3 && (
              <button onClick={closePolygon} style={{flex:2,padding:'12px',background:color.solid,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>
                ⬡ Close & Identify Room
              </button>
            )}
            {points.length > 0 && (
              <button onClick={()=>setPoints(p=>p.slice(0,-1))} style={{flex:1,padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>
                ↩ Undo
              </button>
            )}
          </div>

          {rooms.length > 0 && points.length === 0 && (
            <>
              <button onClick={onUndo} style={{width:'100%',padding:'10px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer',marginBottom:8}}>
                ✕ Remove Last Room
              </button>
              <button onClick={onFinish} style={{width:'100%',padding:'15px',background:ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:'pointer'}}>
                ✓ Done — View Results ({rooms.length} room{rooms.length!==1?'s':''})
              </button>
            </>
          )}

          {rooms.length === 0 && points.length === 0 && (
            <div style={{background:'#fff3e0',border:'1px solid #ffcc80',borderRadius:8,padding:'12px 14px',fontSize:13,color:'#bf360c',lineHeight:1.5}}>
              💡 Tap each corner of the first room to trace it. For L-shaped rooms, just keep tapping — any shape works!
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Results Screen ────────────────────────────────────────────
function ResultsScreen({ image, rooms, onReset, onEdit }) {
  const total = Math.round(rooms.reduce((s,r)=>s+(r.sqft||0),0))
  const imgRef = useRef()

  // We need actual rendered size for SVG overlay
  const [imgSize, setImgSize] = useState({ w: 300, h: 400 })
  useEffect(() => {
    const update = () => {
      if (imgRef.current) {
        setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div className="fade-in" style={{ padding:'16px 16px 40px' }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:16,color:'#222'}}>Results</div>
        <button onClick={onReset} style={{background:'transparent',border:'1px solid #ddd',borderRadius:6,padding:'4px 12px',fontSize:12,color:'#666',cursor:'pointer'}}>New Blueprint</button>
      </div>

      {/* Total */}
      <div style={{background:DARK,borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <div style={{color:'#aaa',fontSize:13}}>Total coating area</div>
          <div style={{color:'#666',fontSize:11,marginTop:2}}>{rooms.length} room{rooms.length!==1?'s':''}</div>
        </div>
        <div style={{color:ORANGE,fontSize:32,fontWeight:800,lineHeight:1}}>{total.toLocaleString()} <span style={{fontSize:14,color:'#aaa',fontWeight:400}}>sq ft</span></div>
      </div>

      {/* Blueprint with overlays */}
      <div style={{background:'#111',borderRadius:12,padding:8,marginBottom:16,position:'relative'}}>
        <div style={{position:'relative'}}>
          <img ref={imgRef} src={image.src} alt="Blueprint"
            style={{width:'100%',display:'block',borderRadius:8}}
            onLoad={()=>setImgSize({w:imgRef.current.clientWidth,h:imgRef.current.clientHeight})}
          />
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
            {rooms.map(room => (
              <g key={room.id}>
                <polygon
                  points={toSvgPoints(room.points, imgSize.w, imgSize.h)}
                  fill={room.color.fill} stroke={room.color.border} strokeWidth="2"
                />
                <text
                  x={`${centroid(room.points).x*100}%`}
                  y={`${centroid(room.points).y*100}%`}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#fff" fontSize="10" fontWeight="800"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}
                >
                  {room.name}
                </text>
                <text
                  x={`${centroid(room.points).x*100}%`}
                  y={`${centroid(room.points).y*100}%`}
                  dy="13"
                  textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.9)" fontSize="9" fontWeight="600"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,0.9))'}}
                >
                  {room.sqft.toLocaleString()} sf
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Room breakdown */}
      <div style={{fontWeight:700,fontSize:14,color:'#333',marginBottom:10}}>Room breakdown</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(145px,1fr))',gap:8,marginBottom:16}}>
        {rooms.map(room => (
          <div key={room.id} style={{background:'#fff',border:`2px solid ${room.color.border}`,borderRadius:10,padding:'10px 13px'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:2,background:room.color.fill,border:`2px solid ${room.color.border}`,flexShrink:0}} />
              <div style={{fontSize:10,color:'#999',textTransform:'uppercase',letterSpacing:'0.04em',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{room.name}</div>
            </div>
            <div style={{fontSize:22,fontWeight:700,color:'#111',lineHeight:1}}>{room.sqft.toLocaleString()} <span style={{fontSize:11,fontWeight:400,color:'#bbb'}}>sq ft</span></div>
          </div>
        ))}
      </div>

      <div style={{background:'#fff8e1',border:'1px solid #ffe082',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#5d4037',marginBottom:16,lineHeight:1.5}}>
        ⚠️ <strong>Verify on site before ordering materials.</strong> Accuracy depends on calibration scale and tracing precision.
      </div>

      <button onClick={onEdit} style={{width:'100%',padding:'13px',background:'transparent',color:ORANGE,border:`2px solid ${ORANGE}`,borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:10}}>
        ← Edit Rooms
      </button>
      <button onClick={onReset} style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>↺ New Blueprint</button>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [screen,     setScreen]     = useState('upload')
  const [image,      setImage]      = useState(null)
  const [fracPerFt,  setFracPerFt]  = useState(null)
  const [rooms,      setRooms]      = useState([])
  const [error,      setError]      = useState('')
  const [converting, setConverting] = useState(false)

  const handleFile = useCallback((payload) => {
    if (payload.loading) { setConverting(true); setError(''); return }
    setConverting(false)
    if (payload.error) { setError(payload.error); return }
    setError(''); setImage(payload); setScreen('calibrate')
  }, [])

  function handleCalibrateDone(fpf) {
    setFracPerFt(fpf)
    setRooms([])
    setScreen('draw')
  }

  function handleAddRoom(room) {
    setRooms(p => [...p, room])
  }

  function handleUndo() {
    setRooms(p => p.slice(0, -1))
  }

  function reset() {
    setScreen('upload'); setImage(null); setFracPerFt(null); setRooms([]); setError(''); setConverting(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .fade-in{animation:fadeIn 0.3s ease forwards} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Header />
      {screen==='upload'    && <UploadScreen    onFile={handleFile} error={error} converting={converting} />}
      {screen==='calibrate' && <CalibrateScreen image={image} onDone={handleCalibrateDone} />}
      {screen==='draw'      && <DrawScreen      image={image} fracPerFt={fracPerFt} rooms={rooms} onAddRoom={handleAddRoom} onUndo={handleUndo} onFinish={()=>setScreen('results')} />}
      {screen==='results'   && <ResultsScreen   image={image} rooms={rooms} onReset={reset} onEdit={()=>setScreen('draw')} />}
      <div style={{textAlign:'center',padding:'12px',color:'#bbb',fontSize:11}}>TopCoat Tech · Blueprint Analyzer</div>
    </div>
  )
}
