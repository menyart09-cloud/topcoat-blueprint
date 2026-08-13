export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { base64, mime, customPrompt, mode } = req.body
  if (!base64 || !mime) return res.status(400).json({ error: 'Missing image data' })
  if (base64.length > 6_000_000) return res.status(413).json({ error: 'Image too large. Use a photo under 4MB.' })

  // Mode: identify — just name the room at a given location
  if (mode === 'identify' && customPrompt) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 200,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: customPrompt }
          ]}]
        })
      })
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'AI API error' })
      const raw = (data.content || []).map(b => b.text || '').join('').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return res.status(200).json({ name: 'Room', confidence: 'low' })
      return res.status(200).json(JSON.parse(match[0]))
    } catch (err) {
      return res.status(200).json({ name: 'Room', confidence: 'low' })
    }
  }

  // Default mode: full scan
  const prompt = `You are a professional blueprint measurement expert. Carefully examine this floor plan image.

Your job: identify every room/space and read their EXACT dimensions from the printed labels on the blueprint.

INSTRUCTIONS:
1. Look for dimension labels printed inside or beside each room (e.g. "12'-6" x 14'-0"", "15.5 x 12", "10x12")
2. Convert feet and inches precisely: 12'-6" = 12.5 ft, 9'-4" = 9.33 ft
3. Calculate sqft = width x length using the printed dimensions
4. If a room has NO printed dimension labels, mark measured: false and estimate from scale or proportions
5. Read the scale notation if present anywhere on the blueprint
6. List EVERY space: bedrooms, bathrooms, kitchen, living areas, hallways, closets, garage, utility, foyer, etc.

Respond ONLY with valid JSON — no markdown, no backticks:

{
  "scale": "scale notation found or 'dimensions read from labels'",
  "rooms": [
    {
      "id": 0,
      "name": "Master Bedroom",
      "width_ft": 14.5,
      "length_ft": 16.0,
      "sqft": 232,
      "dimensions_label": "14'-6\\" x 16'-0\\"",
      "measured": true
    }
  ],
  "notes": "Any important observations about this blueprint for a flooring contractor."
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
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
    if (!match) return res.status(500).json({ error: 'Unexpected AI response. Please try again.' })
    return res.status(200).json(JSON.parse(match[0]))
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' })
  }
}
