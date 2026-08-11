export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { base64, mime, rooms } = req.body
  if (!base64 || !mime || !rooms) return res.status(400).json({ error: 'Missing data' })
  if (base64.length > 6_000_000) return res.status(413).json({ error: 'Image too large.' })

  const roomList = rooms.map((r, i) => `${i + 1}. "${r.name}" (${r.dimensions_label || r.sqft + ' sqft'})`).join('\n')

  const prompt = `You are a precise blueprint overlay specialist. Study this floor plan image carefully.

I need you to locate the exact position of these specific rooms on the blueprint:

${roomList}

For each room, determine its bounding box as fractions of the TOTAL image dimensions (0.0 to 1.0):
- x: fraction from LEFT edge of image to LEFT WALL of room
- y: fraction from TOP edge of image to TOP WALL of room  
- w: fraction of image width that the room occupies (right wall minus left wall)
- h: fraction of image height that the room occupies (bottom wall minus top wall)

CRITICAL PRECISION RULES:
- Study the blueprint walls carefully before placing any box
- The box must sit INSIDE the room walls — not on them, not overlapping neighboring rooms
- Inset each box 1-2% from the actual walls so it clears the wall lines cleanly
- Account for the fact that the floor plan drawing rarely fills the entire image — there are margins, title blocks, north arrows, and white space around the plan
- Estimate where the floor plan drawing starts and ends within the image, then calculate room positions relative to the full image
- Cross-check: adjacent rooms should have touching but NOT overlapping boxes
- If a room has irregular shape, use the largest rectangle that fits inside it
- Double-check every coordinate before responding

Respond ONLY with valid JSON — no markdown, no backticks:

{
  "rooms": [
    {
      "id": 0,
      "name": "Master Bedroom",
      "box": { "x": 0.42, "y": 0.18, "w": 0.21, "h": 0.26 }
    }
  ]
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
        max_tokens: 1500,
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
