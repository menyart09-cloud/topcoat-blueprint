import { useState, useRef, useCallback } from 'react'

const ORANGE = '#e85d04'
const DARK   = '#1c1c2e'

const ROOM_COLORS = [
  { fill: 'rgba(255,80,80,0.30)',   border: '#e53935' },
  { fill: 'rgba(33,150,243,0.30)',  border: '#1565c0' },
  { fill: 'rgba(76,175,80,0.30)',   border: '#2e7d32' },
  { fill: 'rgba(255,193,7,0.30)',   border: '#f57f17' },
  { fill: 'rgba(156,39,176,0.30)',  border: '#6a1b9a' },
  { fill: 'rgba(255,138,0,0.30)',   border: '#e65100' },
  { fill: 'rgba(0,188,212,0.30)',   border: '#006064' },
  { fill: 'rgba(233,30,99,0.30)',   border: '#880e4f' },
  { fill: 'rgba(139,195,74,0.30)',  border: '#33691e' },
  { fill: 'rgba(63,81,181,0.30)',   border: '#1a237e' },
  { fill: 'rgba(255,87,34,0.30)',   border: '#bf360c' },
  { fill: 'rgba(0,150,136,0.30)',   border: '#004d40' },
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

// ── API ───────────────────────────────────────────────────────
async function callScan(base64, mime) {
  const res = await fetch('/api/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mime })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
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
        <div style={{ color: '#888', fontSize: 11 }}>AI-powered square footage calculator</div>
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
        <div style={{fontWeight:600,fontSize:13,color:'#444',marginBottom:8}}>📋 Tips for best results</div>
        <div style={{fontSize:13,color:'#666',lineHeight:1.7}}>• Upload original PDF for sharpest results<br/>• Make sure dimension labels are readable<br/>• Include scale legend if visible</div>
      </div>
    </div>
  )
}

// ── Preview Screen ────────────────────────────────────────────
function PreviewScreen({ image, onScan, onReset, loading, statusMsg, error }) {
  return (
    <div style={{ padding:'16px 16px 24px' }}>
      {image.fromPdf && <div style={{background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:8,padding:'8px 14px',fontSize:12,color:'#2e7d32',fontWeight:600,marginBottom:10}}>✓ PDF converted to high-resolution image</div>}
      <div style={{borderRadius:12,overflow:'hidden',background:'#111',marginBottom:12,position:'relative'}}>
        <img src={image.src} alt="Blueprint" style={{width:'100%',maxHeight:420,objectFit:'contain'}} />
        <button onClick={onReset} style={{position:'absolute',top:10,right:10,background:'rgba(0,0,0,0.65)',color:'#fff',border:'none',borderRadius:6,padding:'5px 12px',fontSize:12,cursor:'pointer'}}>↺ Retake</button>
      </div>
      <div style={{fontSize:11,color:'#aaa',textAlign:'center',marginBottom:14}}>{image.name} · {(image.size/1024).toFixed(0)} KB</div>
      {error && <div style={{background:'#fdecea',border:'1px solid #f5c6c6',borderRadius:8,padding:'12px 14px',color:'#c62828',fontSize:13,marginBottom:12}}>⚠️ {error}</div>}
      {loading ? (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',background:'#e8f4fd',border:'1px solid #b3d9f7',borderRadius:8,fontSize:14,color:'#1565c0'}}>
          <div style={{width:18,height:18,border:'2.5px solid #b3d9f7',borderTopColor:'#1565c0',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}} />{statusMsg}
        </div>
      ) : (
        <button onClick={onScan} style={{width:'100%',padding:'15px',background:ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:'pointer'}}>🔍 Scan Blueprint</button>
      )}
    </div>
  )
}

// ── Room Selection Screen ─────────────────────────────────────
function SelectScreen({ image, scanData, onNext, onReset }) {
  const [checked, setChecked] = useState(() => {
    const init = {}
    ;(scanData.rooms||[]).forEach(r => { init[r.id] = false })
    return init
  })
  const [dims, setDims] = useState(() => {
    const init = {}
    ;(scanData.rooms||[]).forEach(r => {
      init[r.id] = {
        w: String(r.width_ft  || Math.round(Math.sqrt(r.sqft||100))),
        l: String(r.length_ft || Math.round(Math.sqrt(r.sqft||100)))
      }
    })
    return init
  })

  function updateDim(id, field, val) {
    setDims(p => ({ ...p, [id]: { ...p[id], [field]: val } }))
  }

  function getRoomWithDims(room) {
    const d = dims[room.id] || {}
    const w = parseFloat(d.w) || 0
    const l = parseFloat(d.l) || 0
    return { ...room, width_ft: w, length_ft: l, sqft: Math.round(w * l) }
  }

  const rooms = scanData.rooms || []
  const selectedRooms = rooms.filter(r => checked[r.id]).map(getRoomWithDims)
  const selectedSqft  = selectedRooms.reduce((s,r) => s+(r.sqft||0), 0)

  return (
    <div style={{ padding:'16px 16px 40px' }}>
      <div style={{borderRadius:10,overflow:'hidden',background:'#111',marginBottom:16,maxHeight:160,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <img src={image.src} alt="Blueprint" style={{width:'100%',maxHeight:160,objectFit:'contain'}} />
      </div>
      {scanData.scale && <div style={{background:'#fff3e0',border:'1px solid #ffcc80',borderRadius:6,padding:'6px 12px',fontSize:12,color:'#bf360c',fontWeight:600,marginBottom:14,display:'inline-block'}}>Scale: {scanData.scale}</div>}
      <div style={{fontWeight:700,fontSize:16,color:'#222',marginBottom:4}}>Select rooms to coat</div>
      <div style={{fontSize:13,color:'#888',marginBottom:14}}>Check rooms — then verify or correct the dimensions the AI read.</div>
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <button onClick={()=>{const a={};rooms.forEach(r=>{a[r.id]=true});setChecked(a)}} style={{flex:1,padding:'8px',background:'#fff',border:'1px solid #ddd',borderRadius:7,fontSize:13,cursor:'pointer',color:'#444'}}>Select All</button>
        <button onClick={()=>{const a={};rooms.forEach(r=>{a[r.id]=false});setChecked(a)}} style={{flex:1,padding:'8px',background:'#fff',border:'1px solid #ddd',borderRadius:7,fontSize:13,cursor:'pointer',color:'#444'}}>Clear All</button>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
        {rooms.map(room => {
          const d = dims[room.id] || {}
          const w = parseFloat(d.w)||0
          const l = parseFloat(d.l)||0
          const sqft = Math.round(w*l)
          return (
            <div key={room.id} style={{background:'#fff',border:`2px solid ${checked[room.id]?ORANGE:'#e8e8e8'}`,borderRadius:10,padding:'12px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:checked[room.id]?10:0,cursor:'pointer'}} onClick={()=>setChecked(p=>({...p,[room.id]:!p[room.id]}))}>
                <div style={{width:22,height:22,borderRadius:5,border:`2px solid ${checked[room.id]?ORANGE:'#ccc'}`,background:checked[room.id]?ORANGE:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {checked[room.id]&&<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:'#222'}}>{room.name}</div>
                  {!checked[room.id] && <div style={{fontSize:12,color:'#aaa'}}>{room.dimensions_label||`${Math.round(room.sqft||0)} sq ft`}</div>}
                </div>
                {room.measured!==false
                  ?<span style={{fontSize:10,background:'#e8f5e9',color:'#2e7d32',borderRadius:3,padding:'2px 6px',fontWeight:600}}>MEASURED</span>
                  :<span style={{fontSize:10,background:'#fff8e1',color:'#f57f17',borderRadius:3,padding:'2px 6px',fontWeight:600}}>ESTIMATED</span>}
              </div>
              {checked[room.id] && (
                <div style={{background:'#f9f9f9',borderRadius:8,padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                  <div style={{fontSize:11,color:'#888',fontWeight:600,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.04em'}}>Verify / correct dimensions</div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:12,color:'#666'}}>Width</span>
                      <input type="number" value={d.w} onChange={e=>updateDim(room.id,'w',e.target.value)}
                        style={{width:64,padding:'6px 8px',fontSize:14,border:'2px solid #ddd',borderRadius:6,outline:'none',textAlign:'center'}} />
                      <span style={{fontSize:12,color:'#999'}}>ft</span>
                    </div>
                    <span style={{color:'#ccc',fontSize:16}}>×</span>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:12,color:'#666'}}>Length</span>
                      <input type="number" value={d.l} onChange={e=>updateDim(room.id,'l',e.target.value)}
                        style={{width:64,padding:'6px 8px',fontSize:14,border:'2px solid #ddd',borderRadius:6,outline:'none',textAlign:'center'}} />
                      <span style={{fontSize:12,color:'#999'}}>ft</span>
                    </div>
                    <div style={{marginLeft:'auto',textAlign:'right'}}>
                      <div style={{fontSize:20,fontWeight:700,color:ORANGE,lineHeight:1}}>{sqft.toLocaleString()}</div>
                      <div style={{fontSize:11,color:'#aaa'}}>sq ft</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {selectedRooms.length>0&&(
        <div style={{background:DARK,borderRadius:10,padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div><div style={{color:'#aaa',fontSize:12}}>Selected area</div><div style={{color:'#666',fontSize:11,marginTop:1}}>{selectedRooms.length} room{selectedRooms.length!==1?'s':''}</div></div>
          <div style={{color:ORANGE,fontSize:26,fontWeight:800}}>{Math.round(selectedSqft).toLocaleString()} <span style={{fontSize:13,color:'#aaa',fontWeight:400}}>sq ft</span></div>
        </div>
      )}
      <button onClick={()=>onNext(selectedRooms)} disabled={selectedRooms.length===0}
        style={{width:'100%',padding:'15px',background:selectedRooms.length===0?'#ccc':ORANGE,color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:selectedRooms.length===0?'not-allowed':'pointer'}}>
        Next — Calibrate Scale →
      </button>
      <button onClick={onReset} style={{width:'100%',marginTop:10,padding:'10px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>↺ Start Over</button>
    </div>
  )
}


// ── Calibration Screen ────────────────────────────────────────
// User taps two ends of a known dimension line on the blueprint
function CalibrateScreen({ image, scanData, onDone, onBack }) {
  const [points, setPoints] = useState([])   // [{x,y}, {x,y}] in fractions
  const [knownFt, setKnownFt] = useState('')
  const imgRef = useRef()

  function handleTap(e) {
    if (points.length >= 2) return
    const rect = imgRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top)  / rect.height
    setPoints(p => [...p, { x, y }])
  }

  function reset() { setPoints([]) }

  function calcFracPerFt() {
    if (points.length < 2 || !knownFt || isNaN(parseFloat(knownFt))) return null
    const ft = parseFloat(knownFt)
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const distFraction = Math.sqrt(dx*dx + dy*dy)
    return distFraction / ft
  }

  function handleDone() {
    const fpf = calcFracPerFt()
    if (!fpf) return
    onDone(fpf)
  }

  const fracPerFtPreview = calcFracPerFt()
  const scaleWarning = fracPerFtPreview && (fracPerFtPreview < 0.002 || fracPerFtPreview > 0.05)
  const canProceed = points.length === 2 && knownFt && !isNaN(parseFloat(knownFt)) && parseFloat(knownFt) > 0

  return (
    <div style={{ padding:'16px 16px 40px' }}>
      {/* Instruction */}
      <div style={{background:DARK,borderRadius:10,padding:'14px 16px',marginBottom:14,color:'#fff'}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Step 1 — Set the scale</div>
        <div style={{fontSize:13,color:'#ccc',lineHeight:1.6}}>
          Find a dimension line on the blueprint with a known measurement (e.g. an outer wall labeled "64'-0""). 
          Tap each end of that line, then enter the measurement in feet below.
        </div>
      </div>

      {/* Known feet input */}
      <div style={{background:'#fff',border:'1px solid #e8e8e8',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
        <div style={{fontWeight:600,fontSize:13,color:'#444',marginBottom:8}}>Known measurement (in feet)</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <input
            type="number" placeholder="e.g. 64" value={knownFt}
            onChange={e=>setKnownFt(e.target.value)}
            style={{flex:1,padding:'10px 14px',fontSize:16,border:'2px solid #ddd',borderRadius:8,outline:'none'}}
          />
          <span style={{fontSize:14,color:'#888',fontWeight:500}}>feet</span>
        </div>
        {scanData.scale && scanData.scale !== 'not detected' && (
          <div style={{fontSize:12,color:'#888',marginTop:8}}>AI detected scale: <strong>{scanData.scale}</strong></div>
        )}
      </div>

      {/* Status */}
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <div style={{flex:1,padding:'10px',background:points.length>=1?'#e8f5e9':'#f5f5f5',border:`1px solid ${points.length>=1?'#a5d6a7':'#ddd'}`,borderRadius:8,textAlign:'center',fontSize:13,fontWeight:600,color:points.length>=1?'#2e7d32':'#999'}}>
          {points.length>=1?'✓ Point 1 set':'Tap Point 1'}
        </div>
        <div style={{flex:1,padding:'10px',background:points.length>=2?'#e8f5e9':'#f5f5f5',border:`1px solid ${points.length>=2?'#a5d6a7':'#ddd'}`,borderRadius:8,textAlign:'center',fontSize:13,fontWeight:600,color:points.length>=2?'#2e7d32':'#999'}}>
          {points.length>=2?'✓ Point 2 set':'Tap Point 2'}
        </div>
      </div>

      {/* Blueprint tap area */}
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',background:'#111',marginBottom:12,touchAction:'none'}}
        onClick={handleTap} onTouchEnd={e=>{e.preventDefault();handleTap(e)}}>
        <img ref={imgRef} src={image.src} alt="Blueprint" style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />

        {/* Draw calibration points and line */}
        <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
          {points.map((pt, i) => (
            <div key={i} style={{
              position:'absolute',
              left:`${pt.x*100}%`, top:`${pt.y*100}%`,
              width:16, height:16,
              marginLeft:-8, marginTop:-8,
              background: i===0?'#e53935':'#1565c0',
              border:'2px solid #fff',
              borderRadius:'50%',
              boxShadow:'0 0 0 2px rgba(0,0,0,0.3)'
            }} />
          ))}
          {points.length===2 && (
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
              <line
                x1={`${points[0].x*100}%`} y1={`${points[0].y*100}%`}
                x2={`${points[1].x*100}%`} y2={`${points[1].y*100}%`}
                stroke="#fff" strokeWidth="2" strokeDasharray="6,4" opacity="0.8"
              />
            </svg>
          )}
        </div>
      </div>

      <div style={{fontSize:12,color:'#888',textAlign:'center',marginBottom:14}}>
        {points.length===0 && 'Tap the START of a known dimension line on the blueprint'}
        {points.length===1 && 'Now tap the END of that same dimension line'}
        {points.length===2 && !knownFt && 'Great! Now enter the measurement in feet above'}
        {points.length===2 && knownFt && !scaleWarning && <span style={{color:'#2e7d32',fontWeight:600}}>✓ Scale looks good — 1 foot = {(fracPerFtPreview*100).toFixed(2)}% of image width</span>}
        {points.length===2 && knownFt && scaleWarning && <span style={{color:'#c62828',fontWeight:600}}>⚠️ Scale seems off — try tapping further apart on a longer dimension line</span>}
      </div>

      {points.length > 0 && (
        <button onClick={reset} style={{width:'100%',padding:'10px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer',marginBottom:10}}>
          ↺ Reset Points
        </button>
      )}

      <button onClick={handleDone} disabled={!canProceed}
        style={{width:'100%',padding:'15px',background:canProceed?ORANGE:'#ccc',color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:canProceed?'pointer':'not-allowed',marginBottom:10}}>
        Continue — Place Rooms →
      </button>
      <button onClick={onBack} style={{width:'100%',padding:'10px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>← Back</button>
    </div>
  )
}

// ── Tap-to-Place Screen ───────────────────────────────────────
function TapScreen({ image, rooms, fracPerFt, onDone, onBack }) {
  const [placements, setPlacements] = useState({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const imgRef = useRef()

  const currentRoom = rooms[currentIdx]
  const allPlaced   = rooms.every(r => placements[r.id])
  const placedCount = Object.keys(placements).length

  function handleTap(e) {
    if (!currentRoom) return
    const rect = imgRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top)  / rect.height

    // Use actual room dimensions scaled by fracPerFt
    const wFt = currentRoom.width_ft  || Math.sqrt(currentRoom.sqft || 100)
    const hFt = currentRoom.length_ft || Math.sqrt(currentRoom.sqft || 100)
    const boxW = Math.min(wFt * fracPerFt, 0.5)
    const boxH = Math.min(hFt * fracPerFt, 0.5)

    // Center box on tap, clamp to image bounds
    const bx = Math.max(0, Math.min(x - boxW/2, 1 - boxW))
    const by = Math.max(0, Math.min(y - boxH/2, 1 - boxH))

    setPlacements(p => ({ ...p, [currentRoom.id]: { x: bx, y: by, w: boxW, h: boxH } }))

    // Auto-advance to next unplaced room
    const nextUnplaced = rooms.findIndex((r,i) => i !== currentIdx && !placements[r.id] && r.id !== currentRoom.id)
    if (nextUnplaced !== -1) setCurrentIdx(nextUnplaced)
  }

  const color = currentRoom ? ROOM_COLORS[currentIdx % ROOM_COLORS.length] : null

  return (
    <div style={{ padding:'16px 16px 40px' }}>
      <div style={{background:currentRoom?color.border:'#2e7d32',borderRadius:10,padding:'12px 16px',marginBottom:12,color:'#fff'}}>
        {currentRoom ? (
          <>
            <div style={{fontWeight:700,fontSize:14}}>Tap center of: {currentRoom.name}</div>
            <div style={{fontSize:12,opacity:0.85,marginTop:2}}>
              {currentRoom.dimensions_label||''} · {Math.round(currentRoom.sqft||0)} sq ft · {placedCount}/{rooms.length} placed
            </div>
          </>
        ) : (
          <div style={{fontWeight:700,fontSize:14}}>✓ All rooms placed! Tap Done.</div>
        )}
      </div>

      {/* Room pills */}
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
        {rooms.map((room,i) => {
          const c = ROOM_COLORS[i%ROOM_COLORS.length]
          const placed = !!placements[room.id]
          return (
            <div key={room.id} onClick={()=>setCurrentIdx(i)}
              style={{padding:'4px 10px',borderRadius:20,border:`2px solid ${c.border}`,background:placed?c.border:'#fff',color:placed?'#fff':c.border,fontSize:11,fontWeight:700,cursor:'pointer',opacity:room.id===currentRoom?.id?1:0.7}}>
              {placed?'✓ ':''}{room.name}
            </div>
          )
        })}
      </div>

      {/* Blueprint */}
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',background:'#111',marginBottom:12,touchAction:'none'}}
        onClick={handleTap} onTouchEnd={e=>{e.preventDefault();handleTap(e)}}>
        <img ref={imgRef} src={image.src} alt="Blueprint" style={{width:'100%',display:'block',userSelect:'none'}} draggable={false} />
        <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
          {rooms.map((room,i) => {
            const box = placements[room.id]
            if (!box) return null
            const c = ROOM_COLORS[i%ROOM_COLORS.length]
            return (
              <div key={room.id} style={{
                position:'absolute',
                left:`${box.x*100}%`,top:`${box.y*100}%`,
                width:`${box.w*100}%`,height:`${box.h*100}%`,
                background:c.fill,border:`2.5px solid ${c.border}`,
                borderRadius:3,boxSizing:'border-box',
                display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'
              }}>
                <div style={{background:c.border,borderRadius:3,padding:'2px 5px',maxWidth:'90%',textAlign:'center'}}>
                  <div style={{fontSize:8,fontWeight:800,color:'#fff',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.3}}>{room.name}</div>
                  <div style={{fontSize:8,color:'rgba(255,255,255,0.9)',lineHeight:1.2}}>{Math.round(room.sqft||0)} sf</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{fontSize:12,color:'#888',textAlign:'center',marginBottom:14}}>
        Tap a room on the blueprint to place it · Tap a pill to re-place
      </div>

      <button onClick={()=>onDone(rooms.map(r=>({...r,box:placements[r.id]||null})))} disabled={placedCount===0}
        style={{width:'100%',padding:'15px',background:allPlaced?ORANGE:placedCount>0?'#ff8f00':'#ccc',color:'#fff',border:'none',borderRadius:10,fontSize:16,fontWeight:700,cursor:placedCount===0?'not-allowed':'pointer',marginBottom:10}}>
        {allPlaced?'✓ Done — Generate Results':`Done (${placedCount}/${rooms.length} placed)`}
      </button>
      <button onClick={onBack} style={{width:'100%',padding:'10px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>← Back</button>
    </div>
  )
}

// ── Results Screen ────────────────────────────────────────────
function ResultsScreen({ image, rooms, scanData, onReset, onReselect }) {
  const total = Math.round(rooms.reduce((s,r)=>s+(r.sqft||0),0))
  const measuredCount  = rooms.filter(r=>r.measured!==false).length
  const estimatedCount = rooms.filter(r=>r.measured===false).length

  return (
    <div className="fade-in" style={{ padding:'16px 16px 40px' }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{background:'#fff3e0',color:'#bf360c',border:'1px solid #ffcc80',borderRadius:6,padding:'4px 10px',fontSize:12,fontWeight:600}}>Scale: {scanData.scale||'not detected'}</div>
        <button onClick={onReset} style={{background:'transparent',border:'1px solid #ddd',borderRadius:6,padding:'4px 12px',fontSize:12,color:'#666',cursor:'pointer'}}>New Blueprint</button>
      </div>
      <div style={{background:DARK,borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <div style={{color:'#aaa',fontSize:13}}>Total coating area</div>
          <div style={{color:'#666',fontSize:11,marginTop:2}}>{rooms.length} room{rooms.length!==1?'s':''} · {measuredCount} measured{estimatedCount>0?` · ${estimatedCount} estimated`:''}</div>
        </div>
        <div style={{color:ORANGE,fontSize:30,fontWeight:800,lineHeight:1}}>{total.toLocaleString()} <span style={{fontSize:14,color:'#aaa',fontWeight:400}}>sq ft</span></div>
      </div>

      <div style={{background:'#111',borderRadius:12,padding:8,marginBottom:14,position:'relative'}}>
        <div style={{position:'relative',width:'100%'}}>
          <img src={image.src} alt="Blueprint" style={{width:'100%',display:'block',borderRadius:8}} />
          <div style={{position:'absolute',inset:0,borderRadius:8,overflow:'hidden'}}>
            {rooms.map((room,i) => {
              const box = room.box
              if (!box) return null
              const color = ROOM_COLORS[i%ROOM_COLORS.length]
              return (
                <div key={i} style={{
                  position:'absolute',
                  left:`${box.x*100}%`,top:`${box.y*100}%`,
                  width:`${box.w*100}%`,height:`${box.h*100}%`,
                  background:color.fill,border:`2.5px solid ${color.border}`,
                  borderRadius:3,boxSizing:'border-box',
                  display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'
                }}>
                  <div style={{background:color.border,borderRadius:3,padding:'2px 6px',maxWidth:'92%',textAlign:'center'}}>
                    <div style={{fontSize:8,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.03em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.3}}>{room.name}</div>
                    <div style={{fontSize:8,fontWeight:600,color:'rgba(255,255,255,0.9)',lineHeight:1.2}}>{Math.round(room.sqft||0)} sf</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{background:'#fff8e1',border:'1px solid #ffe082',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#5d4037',marginBottom:16,lineHeight:1.5}}>
        ⚠️ <strong>Verify on site before ordering materials.</strong> Estimated rooms (~) should be measured manually.
      </div>

      <div style={{fontWeight:700,fontSize:14,color:'#333',marginBottom:10}}>Room breakdown</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(145px,1fr))',gap:8,marginBottom:16}}>
        {rooms.map((room,i) => {
          const color = ROOM_COLORS[i%ROOM_COLORS.length]
          return (
            <div key={i} style={{background:'#fff',border:`2px solid ${color.border}`,borderRadius:10,padding:'10px 13px'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <div style={{width:10,height:10,borderRadius:2,background:color.fill,border:`2px solid ${color.border}`,flexShrink:0}} />
                <div style={{fontSize:10,color:'#999',textTransform:'uppercase',letterSpacing:'0.04em',fontWeight:600}}>{room.name}</div>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:'#111',lineHeight:1}}>{Math.round(room.sqft||0).toLocaleString()} <span style={{fontSize:11,fontWeight:400,color:'#bbb'}}>sq ft</span></div>
              {room.dimensions_label&&<div style={{fontSize:10,color:'#aaa',marginTop:3}}>{room.dimensions_label}</div>}
              <div style={{marginTop:5}}>
                {room.measured!==false
                  ?<span style={{fontSize:9,background:'#e8f5e9',color:'#2e7d32',borderRadius:3,padding:'1px 5px',fontWeight:600}}>✓ MEASURED</span>
                  :<span style={{fontSize:9,background:'#fff8e1',color:'#f57f17',borderRadius:3,padding:'1px 5px',fontWeight:600}}>~ ESTIMATED</span>}
              </div>
            </div>
          )
        })}
      </div>

      {scanData.notes&&(
        <div style={{background:'#fff',border:'1px solid #ebebeb',borderRadius:10,padding:'14px 16px',fontSize:13,color:'#555',lineHeight:1.65,marginBottom:16}}>
          <div style={{fontWeight:700,color:'#333',marginBottom:6}}>📋 Installer notes</div>{scanData.notes}
        </div>
      )}

      <button onClick={onReselect} style={{width:'100%',padding:'13px',background:'transparent',color:ORANGE,border:`2px solid ${ORANGE}`,borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:10}}>
        ← Change Room Selection
      </button>
      <button onClick={onReset} style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid #ddd',borderRadius:8,fontSize:13,color:'#888',cursor:'pointer'}}>↺ New Blueprint</button>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [screen,     setScreen]     = useState('upload')
  const [image,      setImage]      = useState(null)
  const [scanData,   setScanData]   = useState(null)
  const [selected,   setSelected]   = useState(null)
  const [fracPerFt,  setFracPerFt]  = useState(null)
  const [results,    setResults]    = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [status,     setStatus]     = useState('')
  const [error,      setError]      = useState('')
  const [converting, setConverting] = useState(false)

  const handleFile = useCallback((payload) => {
    if (payload.loading) { setConverting(true); setError(''); return }
    setConverting(false)
    if (payload.error) { setError(payload.error); return }
    setError(''); setImage(payload); setScreen('preview')
  }, [])

  async function handleScan() {
    setError(''); setLoading(true); setStatus('Scanning blueprint…')
    try {
      const data = await callScan(image.base64, image.mime)
      ;(data.rooms||[]).forEach((r,i) => { if(r.id===undefined) r.id=i })
      setScanData(data); setScreen('select')
    } catch(err) { setError('Scan failed: '+(err.message||'Please try again.')) }
    finally { setLoading(false); setStatus('') }
  }

  function handleSelectNext(selectedRooms) {
    if (!selectedRooms.length) return
    setSelected(selectedRooms)
    setScreen('calibrate')
  }

  function handleCalibrateDone(fpf) {
    setFracPerFt(fpf)
    setScreen('tap')
  }

  function handleTapDone(roomsWithBoxes) {
    setResults(roomsWithBoxes)
    setScreen('results')
  }

  function reset() { setScreen('upload'); setImage(null); setScanData(null); setSelected(null); setFracPerFt(null); setResults(null); setError(''); setConverting(false) }
  function reselect() { setScreen('select'); setResults(null); setError('') }

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .fade-in{animation:fadeIn 0.3s ease forwards} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Header />
      {screen==='upload'    && <UploadScreen    onFile={handleFile} error={error} converting={converting} />}
      {screen==='preview'   && <PreviewScreen   image={image} onScan={handleScan} onReset={reset} loading={loading} statusMsg={status} error={error} />}
      {screen==='select'    && <SelectScreen    image={image} scanData={scanData} onNext={handleSelectNext} onReset={reset} />}
      {screen==='calibrate' && <CalibrateScreen image={image} scanData={scanData} onDone={handleCalibrateDone} onBack={()=>setScreen('select')} />}
      {screen==='tap'       && <TapScreen       image={image} rooms={selected} fracPerFt={fracPerFt} onDone={handleTapDone} onBack={()=>setScreen('calibrate')} />}
      {screen==='results'   && <ResultsScreen   image={image} rooms={results} scanData={scanData} onReset={reset} onReselect={reselect} />}
      <div style={{textAlign:'center',padding:'12px',color:'#bbb',fontSize:11}}>TopCoat Tech · Blueprint Analyzer</div>
    </div>
  )
}
