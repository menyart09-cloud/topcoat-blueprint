import { useState, useRef, useCallback } from 'react'

const ORANGE = '#e85d04'
const DARK   = '#1c1c2e'

const ROOM_COLORS = [
  { fill: 'rgba(255,80,80,0.28)',   border: '#e53935', text: '#fff' },
  { fill: 'rgba(33,150,243,0.28)',  border: '#1565c0', text: '#fff' },
  { fill: 'rgba(76,175,80,0.28)',   border: '#2e7d32', text: '#fff' },
  { fill: 'rgba(255,193,7,0.28)',   border: '#f57f17', text: '#fff' },
  { fill: 'rgba(156,39,176,0.28)', border: '#6a1b9a', text: '#fff' },
  { fill: 'rgba(255,138,0,0.28)',   border: '#e65100', text: '#fff' },
  { fill: 'rgba(0,188,212,0.28)',   border: '#006064', text: '#fff' },
  { fill: 'rgba(233,30,99,0.28)',   border: '#880e4f', text: '#fff' },
  { fill: 'rgba(139,195,74,0.28)',  border: '#33691e', text: '#fff' },
  { fill: 'rgba(63,81,181,0.28)',   border: '#1a237e', text: '#fff' },
  { fill: 'rgba(255,87,34,0.28)',   border: '#bf360c', text: '#fff' },
  { fill: 'rgba(0,150,136,0.28)',   border: '#004d40', text: '#fff' },
]

// ── API helpers ──────────────────────────────────────────────
async function callScan(base64, mime) {
  const res = await fetch('/api/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mime })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data
}

async function callOverlay(base64, mime, rooms) {
  const res = await fetch('/api/overlay', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mime, rooms })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data
}

// ── Header ───────────────────────────────────────────────────
function Header() {
  return (
    <div style={{ background: DARK, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ width: 38, height: 38, background: ORANGE, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9M15 21V9"/>
        </svg>
      </div>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>TopCoat Blueprint Analyzer</div>
        <div style={{ color: '#888', fontSize: 12 }}>AI-powered square footage calculator</div>
      </div>
    </div>
  )
}

// ── Upload Screen ────────────────────────────────────────────
function UploadScreen({ onFile, error }) {
  const [drag, setDrag] = useState(false)
  const uploadRef = useRef()
  const cameraRef = useRef()

  function processFile(file) {
    if (!file) return null
    let mime = file.type || ''
    if (!mime || mime === 'application/octet-stream') {
      const ext = (file.name || '').split('.').pop().toLowerCase()
      const map = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', heic:'image/heic', heif:'image/heif' }
      mime = map[ext] || 'image/jpeg'
    }
    if (file.name?.toLowerCase().endsWith('.pdf') || mime === 'application/pdf')
      return { error: "PDFs aren't supported. Screenshot the blueprint page and upload that instead." }
    if (mime === 'image/heic' || mime === 'image/heif') mime = 'image/jpeg'
    return { file, mime }
  }

  function handleFiles(files) {
    const result = processFile(files[0])
    if (!result) return
    if (result.error) { onFile({ error: result.error }); return }
    const reader = new FileReader()
    reader.onerror = () => onFile({ error: 'Could not read file. Please try again.' })
    reader.onload = (e) => {
      const src = e.target.result
      const base64 = src.split(',')[1]
      if (!base64 || base64.length < 200) { onFile({ error: 'Image appears empty. Try another photo.' }); return }
      onFile({ src, base64, mime: result.mime, name: result.file.name, size: result.file.size })
    }
    reader.readAsDataURL(result.file)
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
      <div onClick={() => uploadRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        style={{ border:`2px dashed ${drag ? ORANGE : '#ccc'}`, borderRadius:14, padding:'28px 20px', textAlign:'center', cursor:'pointer', background: drag ? '#fff8f5' : '#fff', transition:'all 0.15s' }}>
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic" style={{ display:'none' }} onChange={e => handleFiles(e.target.files)} />
        <div style={{ fontSize:36, marginBottom:10 }}>📁</div>
        <div style={{ fontWeight:600, fontSize:15, color:'#222', marginBottom:4 }}>Upload from Files</div>
        <div style={{ fontSize:13, color:'#999' }}>JPG · PNG · WEBP · HEIC</div>
      </div>
      {error && <div style={{ marginTop:12, background:'#fdecea', border:'1px solid #f5c6c6', borderRadius:8, padding:'12px 14px', color:'#c62828', fontSize:13 }}>⚠️ {error}</div>}
      <div style={{ marginTop:20, background:'#fff', borderRadius:12, padding:'14px 16px', border:'1px solid #e8e8e8' }}>
        <div style={{ fontWeight:600, fontSize:13, color:'#444', marginBottom:8 }}>📋 Tips for best results</div>
        <div style={{ fontSize:13, color:'#666', lineHeight:1.7 }}>
          • Lay blueprint flat with good lighting<br/>
          • Capture the entire floor plan in frame<br/>
          • Make sure dimension labels are readable<br/>
          • Include scale legend if visible<br/>
          • Avoid shadows across the drawing
        </div>
      </div>
    </div>
  )
}

// ── Preview Screen ───────────────────────────────────────────
function PreviewScreen({ image, onScan, onReset, loading, statusMsg, error }) {
  return (
    <div style={{ padding:'16px 16px 24px' }}>
      <div style={{ borderRadius:12, overflow:'hidden', background:'#111', marginBottom:12, position:'relative' }}>
        <img src={image.src} alt="Blueprint" style={{ width:'100%', maxHeight:400, objectFit:'contain' }} />
        <button onClick={onReset} style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.65)', color:'#fff', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' }}>↺ Retake</button>
      </div>
      <div style={{ fontSize:11, color:'#aaa', textAlign:'center', marginBottom:14 }}>{image.name} · {(image.size/1024).toFixed(0)} KB</div>
      {error && <div style={{ background:'#fdecea', border:'1px solid #f5c6c6', borderRadius:8, padding:'12px 14px', color:'#c62828', fontSize:13, marginBottom:12 }}>⚠️ {error}</div>}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', background:'#e8f4fd', border:'1px solid #b3d9f7', borderRadius:8, fontSize:14, color:'#1565c0' }}>
          <div style={{ width:18, height:18, border:'2.5px solid #b3d9f7', borderTopColor:'#1565c0', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
          {statusMsg}
        </div>
      ) : (
        <button onClick={onScan} style={{ width:'100%', padding:'15px', background:ORANGE, color:'#fff', border:'none', borderRadius:10, fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          🔍 Scan Blueprint
        </button>
      )}
    </div>
  )
}

// ── Room Selection Screen ─────────────────────────────────────
function SelectScreen({ image, scanData, onOverlay, onReset, loading, statusMsg, error }) {
  const [checked, setChecked] = useState(() => {
    const init = {}
    ;(scanData.rooms || []).forEach(r => { init[r.id] = false })
    return init
  })

  const rooms = scanData.rooms || []
  const selectedRooms = rooms.filter(r => checked[r.id])
  const selectedSqft = selectedRooms.reduce((s, r) => s + (r.sqft || 0), 0)

  function toggle(id) { setChecked(prev => ({ ...prev, [id]: !prev[id] })) }
  function selectAll() { const all = {}; rooms.forEach(r => { all[r.id] = true }); setChecked(all) }
  function clearAll() { const none = {}; rooms.forEach(r => { none[r.id] = false }); setChecked(none) }

  return (
    <div style={{ padding:'16px 16px 40px' }}>
      {/* Thumbnail */}
      <div style={{ borderRadius:10, overflow:'hidden', background:'#111', marginBottom:16, maxHeight:180, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <img src={image.src} alt="Blueprint" style={{ width:'100%', maxHeight:180, objectFit:'contain' }} />
      </div>

      {/* Scale */}
      {scanData.scale && (
        <div style={{ background:'#fff3e0', border:'1px solid #ffcc80', borderRadius:6, padding:'6px 12px', fontSize:12, color:'#bf360c', fontWeight:600, marginBottom:14, display:'inline-block' }}>
          Scale: {scanData.scale}
        </div>
      )}

      <div style={{ fontWeight:700, fontSize:16, color:'#222', marginBottom:4 }}>Select rooms to coat</div>
      <div style={{ fontSize:13, color:'#888', marginBottom:14 }}>Check only the rooms TopCoat will be installing flooring in.</div>

      {/* Select all / clear */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <button onClick={selectAll} style={{ flex:1, padding:'8px', background:'#fff', border:'1px solid #ddd', borderRadius:7, fontSize:13, cursor:'pointer', color:'#444' }}>Select All</button>
        <button onClick={clearAll} style={{ flex:1, padding:'8px', background:'#fff', border:'1px solid #ddd', borderRadius:7, fontSize:13, cursor:'pointer', color:'#444' }}>Clear All</button>
      </div>

      {/* Room checklist */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
        {rooms.map(room => (
          <div key={room.id} onClick={() => toggle(room.id)}
            style={{ display:'flex', alignItems:'center', gap:12, background:'#fff', border:`2px solid ${checked[room.id] ? ORANGE : '#e8e8e8'}`, borderRadius:10, padding:'12px 14px', cursor:'pointer', transition:'border-color 0.15s', userSelect:'none' }}>
            {/* Checkbox */}
            <div style={{ width:22, height:22, borderRadius:5, border:`2px solid ${checked[room.id] ? ORANGE : '#ccc'}`, background: checked[room.id] ? ORANGE : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
              {checked[room.id] && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#222' }}>{room.name}</div>
              <div style={{ fontSize:12, color:'#888', marginTop:1 }}>
                {room.dimensions_label || `~${Math.round(room.sqft || 0)} sq ft`}
                {room.dimensions_label && <span style={{ color:'#aaa' }}> · {Math.round(room.sqft || 0)} sq ft</span>}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              {room.measured !== false
                ? <span style={{ fontSize:10, background:'#e8f5e9', color:'#2e7d32', borderRadius:3, padding:'2px 6px', fontWeight:600 }}>MEASURED</span>
                : <span style={{ fontSize:10, background:'#fff8e1', color:'#f57f17', borderRadius:3, padding:'2px 6px', fontWeight:600 }}>ESTIMATED</span>
              }
            </div>
          </div>
        ))}
      </div>

      {/* Selected total */}
      {selectedRooms.length > 0 && (
        <div style={{ background:DARK, borderRadius:10, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ color:'#aaa', fontSize:12 }}>Selected area</div>
            <div style={{ color:'#666', fontSize:11, marginTop:1 }}>{selectedRooms.length} room{selectedRooms.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ color:ORANGE, fontSize:26, fontWeight:800 }}>
            {Math.round(selectedSqft).toLocaleString()} <span style={{ fontSize:13, color:'#aaa', fontWeight:400 }}>sq ft</span>
          </div>
        </div>
      )}

      {error && <div style={{ background:'#fdecea', border:'1px solid #f5c6c6', borderRadius:8, padding:'12px 14px', color:'#c62828', fontSize:13, marginBottom:12 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', background:'#e8f4fd', border:'1px solid #b3d9f7', borderRadius:8, fontSize:14, color:'#1565c0' }}>
          <div style={{ width:18, height:18, border:'2.5px solid #b3d9f7', borderTopColor:'#1565c0', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
          {statusMsg}
        </div>
      ) : (
        <button
          onClick={() => onOverlay(selectedRooms)}
          disabled={selectedRooms.length === 0}
          style={{ width:'100%', padding:'15px', background: selectedRooms.length === 0 ? '#ccc' : ORANGE, color:'#fff', border:'none', borderRadius:10, fontSize:16, fontWeight:700, cursor: selectedRooms.length === 0 ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          🗺️ Generate Overlay {selectedRooms.length > 0 ? `(${selectedRooms.length} rooms)` : ''}
        </button>
      )}

      <button onClick={onReset} style={{ width:'100%', marginTop:10, padding:'10px', background:'transparent', border:'1px solid #ddd', borderRadius:8, fontSize:13, color:'#888', cursor:'pointer' }}>
        ↺ Start Over
      </button>
    </div>
  )
}

// ── Blueprint Overlay ─────────────────────────────────────────
function BlueprintOverlay({ imageSrc, rooms }) {
  return (
    <div style={{ position:'relative', width:'100%', display:'inline-block' }}>
      <img src={imageSrc} alt="Blueprint" style={{ width:'100%', display:'block', borderRadius:8 }} />
      <div style={{ position:'absolute', inset:0, borderRadius:8, overflow:'hidden' }}>
        {rooms.map((room, i) => {
          const box = room.box
          if (!box || !box.w || !box.h) return null
          const color = ROOM_COLORS[i % ROOM_COLORS.length]
          const pad = 0.005
          return (
            <div key={i} style={{
              position:'absolute',
              left:`${(box.x + pad) * 100}%`,
              top:`${(box.y + pad) * 100}%`,
              width:`${Math.max((box.w - pad*2) * 100, 1)}%`,
              height:`${Math.max((box.h - pad*2) * 100, 1)}%`,
              background: color.fill,
              border: `2.5px solid ${color.border}`,
              borderRadius: 3,
              boxSizing:'border-box',
              display:'flex', alignItems:'center', justifyContent:'center',
              overflow:'hidden',
            }}>
              <div style={{ background: color.border, borderRadius:3, padding:'2px 6px', maxWidth:'92%', textAlign:'center' }}>
                <div style={{ fontSize:8, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.03em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.3 }}>{room.name}</div>
                <div style={{ fontSize:8, fontWeight:600, color:'rgba(255,255,255,0.9)', lineHeight:1.2 }}>{Math.round(room.sqft||0)} sf</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Results Screen ────────────────────────────────────────────
function ResultsScreen({ image, rooms, scanData, onReset, onReselect }) {
  const total = Math.round(rooms.reduce((s,r) => s+(r.sqft||0), 0))
  const measuredCount  = rooms.filter(r => r.measured !== false).length
  const estimatedCount = rooms.filter(r => r.measured === false).length

  return (
    <div className="fade-in" style={{ padding:'16px 16px 40px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ background:'#fff3e0', color:'#bf360c', border:'1px solid #ffcc80', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:600 }}>
          Scale: {scanData.scale || 'not detected'}
        </div>
        <button onClick={onReset} style={{ background:'transparent', border:'1px solid #ddd', borderRadius:6, padding:'4px 12px', fontSize:12, color:'#666', cursor:'pointer' }}>New Blueprint</button>
      </div>

      {/* Total */}
      <div style={{ background:DARK, borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ color:'#aaa', fontSize:13 }}>Total coating area</div>
          <div style={{ color:'#666', fontSize:11, marginTop:2 }}>
            {rooms.length} room{rooms.length!==1?'s':''} · {measuredCount} measured{estimatedCount>0?` · ${estimatedCount} estimated`:''}
          </div>
        </div>
        <div style={{ color:ORANGE, fontSize:30, fontWeight:800, lineHeight:1 }}>
          {total.toLocaleString()} <span style={{ fontSize:14, color:'#aaa', fontWeight:400 }}>sq ft</span>
        </div>
      </div>

      {/* Blueprint with overlays */}
      <div style={{ background:'#111', borderRadius:12, padding:8, marginBottom:14 }}>
        <BlueprintOverlay imageSrc={image.src} rooms={rooms} />
      </div>

      {/* Verify notice */}
      <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#5d4037', marginBottom:16, lineHeight:1.5 }}>
        ⚠️ <strong>Verify on site before ordering materials.</strong> AI reads dimensions from blueprint labels. Estimated rooms (~) should be measured manually.
      </div>

      {/* Legend */}
      <div style={{ fontWeight:700, fontSize:14, color:'#333', marginBottom:10 }}>Room breakdown</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(145px,1fr))', gap:8, marginBottom:16 }}>
        {rooms.map((room, i) => {
          const color = ROOM_COLORS[i % ROOM_COLORS.length]
          return (
            <div key={i} style={{ background:'#fff', border:`2px solid ${color.border}`, borderRadius:10, padding:'10px 13px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:color.fill, border:`2px solid ${color.border}`, flexShrink:0 }} />
                <div style={{ fontSize:10, color:'#999', textTransform:'uppercase', letterSpacing:'0.04em', fontWeight:600 }}>{room.name}</div>
              </div>
              <div style={{ fontSize:20, fontWeight:700, color:'#111', lineHeight:1 }}>
                {Math.round(room.sqft||0).toLocaleString()} <span style={{ fontSize:11, fontWeight:400, color:'#bbb' }}>sq ft</span>
              </div>
              {room.dimensions_label && <div style={{ fontSize:10, color:'#aaa', marginTop:3 }}>{room.dimensions_label}</div>}
              <div style={{ marginTop:5 }}>
                {room.measured!==false
                  ? <span style={{ fontSize:9, background:'#e8f5e9', color:'#2e7d32', borderRadius:3, padding:'1px 5px', fontWeight:600 }}>✓ MEASURED</span>
                  : <span style={{ fontSize:9, background:'#fff8e1', color:'#f57f17', borderRadius:3, padding:'1px 5px', fontWeight:600 }}>~ ESTIMATED</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Notes */}
      {scanData.notes && (
        <div style={{ background:'#fff', border:'1px solid #ebebeb', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#555', lineHeight:1.65, marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#333', marginBottom:6 }}>📋 Installer notes</div>
          {scanData.notes}
        </div>
      )}

      <button onClick={onReselect} style={{ width:'100%', padding:'13px', background:'transparent', color:ORANGE, border:`2px solid ${ORANGE}`, borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
        ← Change Room Selection
      </button>
      <button onClick={onReset} style={{ width:'100%', padding:'12px', background:'transparent', border:'1px solid #ddd', borderRadius:8, fontSize:13, color:'#888', cursor:'pointer' }}>
        ↺ New Blueprint
      </button>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [screen,   setScreen]   = useState('upload')   // upload | preview | select | results
  const [image,    setImage]    = useState(null)
  const [scanData, setScanData] = useState(null)
  const [results,  setResults]  = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState('')
  const [error,    setError]    = useState('')

  const handleFile = useCallback((payload) => {
    if (payload.error) { setError(payload.error); return }
    setError(''); setImage(payload); setScreen('preview')
  }, [])

  async function handleScan() {
    setError(''); setLoading(true); setStatus('Scanning blueprint…')
    try {
      const data = await callScan(image.base64, image.mime)
      // assign sequential ids if missing
      ;(data.rooms || []).forEach((r, i) => { if (r.id === undefined) r.id = i })
      setScanData(data)
      setScreen('select')
    } catch (err) {
      setError('Scan failed: ' + (err.message || 'Please try again.'))
    } finally { setLoading(false); setStatus('') }
  }

  async function handleOverlay(selectedRooms) {
    if (!selectedRooms.length) return
    setError(''); setLoading(true); setStatus('AI placing room overlays…')
    try {
      const data = await callOverlay(image.base64, image.mime, selectedRooms)
      // Merge overlay boxes back into selected room data
      const boxMap = {}
      ;(data.rooms || []).forEach(r => { boxMap[r.name] = r.box })
      const merged = selectedRooms.map(r => ({ ...r, box: boxMap[r.name] || null }))
      setResults(merged)
      setScreen('results')
    } catch (err) {
      setError('Overlay failed: ' + (err.message || 'Please try again.'))
    } finally { setLoading(false); setStatus('') }
  }

  function reset() { setScreen('upload'); setImage(null); setScanData(null); setResults(null); setError('') }
  function reselect() { setScreen('select'); setResults(null); setError('') }

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .fade-in{animation:fadeIn 0.3s ease forwards} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <Header />
      {screen === 'upload'  && <UploadScreen onFile={handleFile} error={error} />}
      {screen === 'preview' && <PreviewScreen image={image} onScan={handleScan} onReset={reset} loading={loading} statusMsg={status} error={error} />}
      {screen === 'select'  && <SelectScreen image={image} scanData={scanData} onOverlay={handleOverlay} onReset={reset} loading={loading} statusMsg={status} error={error} />}
      {screen === 'results' && <ResultsScreen image={image} rooms={results} scanData={scanData} onReset={reset} onReselect={reselect} />}
      <div style={{ textAlign:'center', padding:'12px', color:'#bbb', fontSize:11 }}>TopCoat Tech · Blueprint Analyzer</div>
    </div>
  )
}
