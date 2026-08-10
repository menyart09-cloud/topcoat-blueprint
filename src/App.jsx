import { useState, useRef, useCallback } from 'react'

const ORANGE = '#e85d04'
const DARK   = '#1c1c2e'

// Distinct transparent colors for room overlays
const ROOM_COLORS = [
  { fill: 'rgba(255, 99,  99,  0.35)', border: 'rgba(255, 60,  60,  0.8)',  label: 'rgba(180,30,30,0.95)'   },
  { fill: 'rgba(99,  180, 255, 0.35)', border: 'rgba(30,  130, 255, 0.8)',  label: 'rgba(20,90,200,0.95)'   },
  { fill: 'rgba(99,  220, 130, 0.35)', border: 'rgba(30,  170, 80,  0.8)',  label: 'rgba(20,120,50,0.95)'   },
  { fill: 'rgba(255, 200, 60,  0.35)', border: 'rgba(220, 160, 0,   0.8)',  label: 'rgba(160,110,0,0.95)'   },
  { fill: 'rgba(200, 100, 255, 0.35)', border: 'rgba(150, 40,  230, 0.8)',  label: 'rgba(110,20,180,0.95)'  },
  { fill: 'rgba(255, 160, 60,  0.35)', border: 'rgba(220, 110, 0,   0.8)',  label: 'rgba(170,70,0,0.95)'    },
  { fill: 'rgba(60,  220, 220, 0.35)', border: 'rgba(0,   170, 170, 0.8)',  label: 'rgba(0,120,120,0.95)'   },
  { fill: 'rgba(255, 120, 180, 0.35)', border: 'rgba(220, 60,  130, 0.8)',  label: 'rgba(170,20,90,0.95)'   },
  { fill: 'rgba(150, 220, 80,  0.35)', border: 'rgba(100, 170, 20,  0.8)',  label: 'rgba(60,120,0,0.95)'    },
  { fill: 'rgba(80,  160, 255, 0.35)', border: 'rgba(20,  100, 220, 0.8)',  label: 'rgba(10,60,170,0.95)'   },
  { fill: 'rgba(255, 80,  150, 0.35)', border: 'rgba(210, 20,  100, 0.8)',  label: 'rgba(160,10,70,0.95)'   },
  { fill: 'rgba(100, 255, 200, 0.35)', border: 'rgba(20,  200, 140, 0.8)',  label: 'rgba(0,140,90,0.95)'    },
]

async function analyzeBlueprint(base64, mime, onStatus) {
  onStatus('Sending to AI…')
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mime })
  })
  onStatus('Reading results…')
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data
}

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

function UploadScreen({ onFile }) {
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
      return { error: "PDFs aren't supported. Take a screenshot of the blueprint and upload that instead." }
    if (mime === 'image/heic' || mime === 'image/heif') mime = 'image/jpeg'
    return { file, mime }
  }

  function handleFiles(files) {
    const result = processFile(files[0])
    if (!result) return
    if (result.error) { onFile({ error: result.error }); return }
    const reader = new FileReader()
    reader.onerror = () => onFile({ error: 'Could not read the file. Please try again.' })
    reader.onload = (e) => {
      const src = e.target.result
      const base64 = src.split(',')[1]
      if (!base64 || base64.length < 200) { onFile({ error: 'Image appears empty or corrupt. Try another photo.' }); return }
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

      <div style={{ marginTop:24, background:'#fff', borderRadius:12, padding:'14px 16px', border:'1px solid #e8e8e8' }}>
        <div style={{ fontWeight:600, fontSize:13, color:'#444', marginBottom:8 }}>📋 Tips for best results</div>
        <div style={{ fontSize:13, color:'#666', lineHeight:1.7 }}>
          • Lay the blueprint flat with good lighting<br/>
          • Capture the whole floor plan in the frame<br/>
          • Include any scale legend if visible<br/>
          • Avoid shadows across the drawing
        </div>
      </div>
    </div>
  )
}

function PreviewScreen({ image, onAnalyze, onReset, loading, statusMsg, error }) {
  return (
    <div style={{ padding:'16px 16px 24px' }}>
      <div style={{ borderRadius:12, overflow:'hidden', background:'#111', marginBottom:12, position:'relative' }}>
        <img src={image.src} alt="Blueprint" style={{ width:'100%', maxHeight:360, objectFit:'contain' }} />
        <button onClick={onReset} style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.65)', color:'#fff', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' }}>↺ Retake</button>
      </div>
      <div style={{ fontSize:11, color:'#aaa', textAlign:'center', marginBottom:14 }}>{image.name} · {(image.size/1024).toFixed(0)} KB</div>
      {error && <div style={{ background:'#fdecea', border:'1px solid #f5c6c6', borderRadius:8, padding:'12px 14px', color:'#c62828', fontSize:13, marginBottom:12, lineHeight:1.5 }}>⚠️ {error}</div>}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', background:'#e8f4fd', border:'1px solid #b3d9f7', borderRadius:8, fontSize:14, color:'#1565c0' }}>
          <div style={{ width:18, height:18, border:'2.5px solid #b3d9f7', borderTopColor:'#1565c0', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
          {statusMsg}
        </div>
      ) : (
        <button onClick={onAnalyze} style={{ width:'100%', padding:'15px', background:ORANGE, color:'#fff', border:'none', borderRadius:10, fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          🔍 Analyze Blueprint
        </button>
      )}
    </div>
  )
}

// Blueprint with colored room overlays drawn on top
function BlueprintOverlay({ imageSrc, rooms }) {
  return (
    <div style={{ position:'relative', display:'inline-block', width:'100%' }}>
      <img src={imageSrc} alt="Blueprint" style={{ width:'100%', display:'block', borderRadius:10 }} />
      {/* Overlay container — absolutely positioned over the image */}
      <div style={{ position:'absolute', inset:0, borderRadius:10, overflow:'hidden' }}>
        {rooms.map((room, i) => {
          const box = room.box
          if (!box) return null
          const color = ROOM_COLORS[i % ROOM_COLORS.length]
          return (
            <div key={i} style={{
              position: 'absolute',
              left:   `${box.x * 100}%`,
              top:    `${box.y * 100}%`,
              width:  `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              background: color.fill,
              border: `2px solid ${color.border}`,
              borderRadius: 4,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 4px',
              overflow: 'hidden',
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.82)',
                borderRadius: 4,
                padding: '2px 5px',
                textAlign: 'center',
                maxWidth: '100%',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: color.label, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                  {room.name}
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: color.label, lineHeight: 1.2 }}>
                  {Math.round(room.sqft)} sq ft
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Color legend strip
function ColorLegend({ rooms }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:6, marginBottom:16 }}>
      {rooms.map((room, i) => {
        const color = ROOM_COLORS[i % ROOM_COLORS.length]
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:7, background:'#fff', border:'1px solid #ebebeb', borderRadius:8, padding:'7px 10px' }}>
            <div style={{ width:14, height:14, borderRadius:3, background:color.fill, border:`2px solid ${color.border}`, flexShrink:0 }} />
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#222', lineHeight:1.2 }}>{room.name}</div>
              <div style={{ fontSize:10, color:'#888' }}>{Math.round(room.sqft)} sq ft</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResultsScreen({ results, image, onReset, onQuote }) {
  const rooms = results.rooms || []
  const total = Math.round(results.total_sqft || rooms.reduce((s, r) => s + (r.sqft || 0), 0))

  return (
    <div className="fade-in" style={{ padding:'16px 16px 40px' }}>

      {/* Scale + reset row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ background:'#fff3e0', color:'#bf360c', border:'1px solid #ffcc80', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:600 }}>
          Scale: {results.scale || 'not detected'}
        </div>
        <button onClick={onReset} style={{ background:'transparent', border:'1px solid #ddd', borderRadius:6, padding:'4px 12px', fontSize:12, color:'#666', cursor:'pointer' }}>
          New Blueprint
        </button>
      </div>

      {/* Total bar */}
      <div style={{ background:DARK, borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ color:'#aaa', fontSize:13 }}>Total floor area</div>
          <div style={{ color:'#666', fontSize:11, marginTop:2 }}>{rooms.length} space{rooms.length !== 1 ? 's' : ''} identified</div>
        </div>
        <div style={{ color:ORANGE, fontSize:30, fontWeight:800, lineHeight:1 }}>
          {total.toLocaleString()} <span style={{ fontSize:14, color:'#aaa', fontWeight:400 }}>sq ft</span>
        </div>
      </div>

      {/* Blueprint with overlays */}
      <div style={{ background:'#111', borderRadius:12, padding:8, marginBottom:14 }}>
        <BlueprintOverlay imageSrc={image.src} rooms={rooms} />
      </div>

      {/* Color legend */}
      <ColorLegend rooms={rooms} />

      {/* Notes */}
      {results.notes && (
        <div style={{ background:'#fff', border:'1px solid #ebebeb', borderRadius:10, padding:'14px 16px', fontSize:13, color:'#555', lineHeight:1.65, marginBottom:16 }}>
          <div style={{ fontWeight:700, color:'#333', marginBottom:6, fontSize:13 }}>📋 AI notes</div>
          {results.notes}
        </div>
      )}

      {/* Quote button */}
      <button onClick={onQuote} style={{ width:'100%', padding:'15px', background:'transparent', color:ORANGE, border:`2px solid ${ORANGE}`, borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        💰 Get TopCoat Pricing Estimate
      </button>
    </div>
  )
}

export default function App() {
  const [image,   setImage]   = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status,  setStatus]  = useState('')
  const [error,   setError]   = useState('')

  const handleFile = useCallback((payload) => {
    if (payload.error) { setError(payload.error); return }
    setError('')
    setResults(null)
    setImage(payload)
  }, [])

  async function analyze() {
    if (!image) return
    setError('')
    setLoading(true)
    try {
      const data = await analyzeBlueprint(image.base64, image.mime, setStatus)
      setResults(data)
    } catch (err) {
      setError('Analysis failed: ' + (err.message || 'Unknown error. Please try again.'))
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  function reset() { setImage(null); setResults(null); setError('') }

  function getQuote() {
    if (!results) return
    const rooms = (results.rooms || []).map(r => `${r.name}: ${Math.round(r.sqft)} sq ft`).join(', ')
    const total = Math.round(results.total_sqft || 0)
    alert(`Blueprint summary ready!\n\nTotal: ${total} sq ft\nRooms: ${rooms}\n\nSend this to your TopCoat Tech estimator to get a full pricing breakdown.`)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f2' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .fade-in { animation: fadeIn 0.3s ease forwards; } @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <Header />
      {!image && !results && (
        <>
          <UploadScreen onFile={handleFile} />
          {error && <div style={{ margin:'0 16px', background:'#fdecea', border:'1px solid #f5c6c6', borderRadius:8, padding:'12px 14px', color:'#c62828', fontSize:13, lineHeight:1.5 }}>⚠️ {error}</div>}
        </>
      )}
      {image && !results && (
        <PreviewScreen image={image} onAnalyze={analyze} onReset={reset} loading={loading} statusMsg={status} error={error} />
      )}
      {results && (
        <ResultsScreen results={results} image={image} onReset={reset} onQuote={getQuote} />
      )}
      <div style={{ textAlign:'center', padding:'12px', color:'#bbb', fontSize:11 }}>TopCoat Tech · Blueprint Analyzer</div>
    </div>
  )
}
