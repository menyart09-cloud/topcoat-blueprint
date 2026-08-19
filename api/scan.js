export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { base64, mime, customPrompt, mode } = req.body
  if (!base64 || !mime) return res.status(400).json({ error: 'Missing image data' })
  if (base64.length > 6_000_000) return res.status(413).json({ error: 'Image too large.' })

  // Mode: roomlist — scan blueprint and return room names + optional
  // estimate of the print's own dimension-text height (as a fraction of
  // image height), used to size our added measurement labels to match.
  if (mode === 'roomlist') {
    const prompt = customPrompt || `Look at this blueprint floor plan. List every room name and space label printed on it. Respond ONLY with a JSON array: ["Room 1", "Room 2"]`
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 600,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      })
      const data = await response.json()
      if (!response.ok) return res.status(200).json({ names: [] })
      const raw = (data.content || []).map(b => b.text || '').join('').trim()
      // Names: accept either a bare array (legacy) or an object with a
      // "names" array plus an optional dimension-text-height estimate.
      let names = []
      let dimTextHeightFrac = null
      const objMatch = raw.match(/\{[\s\S]*\}/)
      if (objMatch) {
        try {
          const obj = JSON.parse(objMatch[0])
          if (Array.isArray(obj.names)) names = obj.names
          if (typeof obj.dimTextHeightFrac === 'number' && obj.dimTextHeightFrac > 0 && obj.dimTextHeightFrac < 0.05) {
            dimTextHeightFrac = obj.dimTextHeightFrac
          }
        } catch (e) {}
      }
      if (names.length === 0) {
        const arrMatch = raw.match(/\[[\s\S]*?\]/)
        if (arrMatch) {
          try { const arr = JSON.parse(arrMatch[0]); if (Array.isArray(arr)) names = arr } catch (e) {}
        }
      }
      names = [...new Set(names.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim()))]
      return res.status(200).json({ names, dimTextHeightFrac })
    } catch { return res.status(200).json({ names: [] }) }
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
