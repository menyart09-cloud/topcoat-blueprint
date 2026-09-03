export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { base64, mime, customPrompt, mode } = req.body
  if (!base64 || !mime) return res.status(400).json({ error: 'Missing image data' })
  if (base64.length > 6_000_000) return res.status(413).json({ error: 'Image too large.' })

  // Mode: roomlist — scan blueprint and return room names WITH their
  // approximate position on the image, so the client can locally re-rank
  // by proximity for every room traced, not just the first one — without
  // needing a fresh API call each time.
  if (mode === 'roomlist') {
    const prompt = customPrompt || `Look at this blueprint floor plan. Find every room name and space label printed on it. Commercial prints typically also print a room NUMBER near each room name (often boxed or underlined, e.g. "108" under "VISITOR LOCKER ROOM") — include it whenever you see one, exactly as printed (numbers can include letters, e.g. "108A"). Estimate each room's position as a fraction of the image (0 to 1, top-left is 0,0). Respond ONLY with JSON: {"rooms":[{"name":"Room 1","number":"108","x":0.3,"y":0.5}]} — omit "number" entirely for rooms with no visible number.`
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 800,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      })
      const data = await response.json()
      if (!response.ok) return res.status(200).json({ rooms: [] })
      const raw = (data.content || []).map(b => b.text || '').join('').trim()
      let rooms = []
      const objMatch = raw.match(/\{[\s\S]*\}/)
      if (objMatch) {
        try {
          const obj = JSON.parse(objMatch[0])
          if (Array.isArray(obj.rooms)) rooms = obj.rooms
        } catch (e) {}
      }
      if (rooms.length === 0) {
        // Legacy fallback — a bare array of name strings, no position data
        const arrMatch = raw.match(/\[[\s\S]*?\]/)
        if (arrMatch) {
          try {
            const arr = JSON.parse(arrMatch[0])
            if (Array.isArray(arr)) rooms = arr.map(n => (typeof n === 'string' ? { name: n } : n))
          } catch (e) {}
        }
      }
      const cleaned = rooms
        .filter(r => r && ((typeof r.name === 'string' && r.name.trim()) || (typeof r.number === 'string' && r.number.trim()) || (typeof r.number === 'number')))
        .map(r => ({
          name: (typeof r.name === 'string' && r.name.trim()) ? r.name.trim() : '',
          number: (typeof r.number === 'string' && r.number.trim() && r.number.trim().length <= 12) ? r.number.trim()
                : (typeof r.number === 'number') ? String(r.number)
                : null,
          x: (typeof r.x === 'number' && r.x >= 0 && r.x <= 1) ? r.x : null,
          y: (typeof r.y === 'number' && r.y >= 0 && r.y <= 1) ? r.y : null
        }))
      // De-dupe using the room number when present (a far more reliable
      // key than name — a print can have several rooms legitimately named
      // "Storage" with different numbers, and those must stay distinct).
      // Falls back to name when no number was found for that entry.
      const seen = new Set()
      const deduped = cleaned.filter(r => {
        const k = r.number ? `num:${r.number.toLowerCase()}` : `name:${r.name.toLowerCase()}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      return res.status(200).json({ rooms: deduped })
    } catch { return res.status(200).json({ rooms: [] }) }
  }

  // Mode: identify — name a single room
  if (mode === 'identify' && customPrompt) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 200,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: customPrompt }
          ]}]
        })
      })
      const data = await response.json()
      if (!response.ok) return res.status(200).json({ name: 'Room' })
      const raw = (data.content || []).map(b => b.text || '').join('').trim()
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { const p = JSON.parse(jsonMatch[0]); if (p.name) return res.status(200).json(p) } catch(e) {}
      }
      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/)
      if (nameMatch) return res.status(200).json({ name: nameMatch[1] })
      const cleaned = raw.replace(/[{}"]/g,'').replace(/name\s*:/i,'').trim()
      if (cleaned.length > 0 && cleaned.length < 60) return res.status(200).json({ name: cleaned })
      return res.status(200).json({ name: 'Room' })
    } catch { return res.status(200).json({ name: 'Room' }) }
  }

  // Default: full blueprint scan
  const prompt = `You are a professional blueprint measurement expert. Carefully examine this floor plan image.
Identify every room/space and read their EXACT dimensions from printed labels.
INSTRUCTIONS:
1. Look for dimension labels (e.g. "12'-6" x 14'-0"", "15.5 x 12")
2. Convert feet+inches: 12'-6" = 12.5 ft
3. Calculate sqft = width x length
4. Mark measured: false if no labels visible
5. Read scale notation if present
6. List EVERY space visible

Respond ONLY with valid JSON — no markdown:
{
  "scale": "scale notation or 'dimensions read from labels'",
  "rooms": [{"id":0,"name":"Master Bedroom","width_ft":14.5,"length_ft":16.0,"sqft":232,"dimensions_label":"14'-6\\" x 16'-0\\"","measured":true}],
  "notes": "observations for flooring contractor"
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'AI API error' })
    const raw = (data.content || []).map(b => b.text || '').join('').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return res.status(500).json({ error: 'Unexpected AI response.' })
    return res.status(200).json(JSON.parse(match[0]))
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' })
  }
}
