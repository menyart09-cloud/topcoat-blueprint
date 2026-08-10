export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { base64, mime } = req.body

  if (!base64 || !mime) {
    return res.status(400).json({ error: 'Missing image data' })
  }

  // Basic size check — Anthropic max is ~5MB base64
  if (base64.length > 6_000_000) {
    return res.status(413).json({ error: 'Image is too large. Please use a photo under 4MB.' })
  }

  const prompt = `You are an expert blueprint and floor plan analyzer. Study this image carefully.

Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text. Just the raw JSON.

{
  "scale": "scale notation found e.g. 1/4 inch = 1 foot, or 'not detected'",
  "rooms": [
    {
      "name": "Room name as labeled on blueprint",
      "sqft": 150,
      "dimensions_label": "12' x 12.5' or 'estimated'"
    }
  ],
  "total_sqft": 1800,
  "notes": "Brief notes for a flooring contractor: scale confidence, estimated vs measured rooms, structure type, anything relevant."
}

Rules:
- Include every labeled space: rooms, hallways, closets, bathrooms, garage, utility rooms
- sqft must always be a number (never null or a string)
- If no scale is visible, estimate from typical residential room proportions
- Be thorough — a flooring contractor needs every space accounted for`

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
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'AI API error' })
    }

    const raw = (data.content || []).map(b => b.text || '').join('').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return res.status(500).json({ error: 'AI returned an unexpected format. Please try again.' })

    const result = JSON.parse(match[0])
    return res.status(200).json(result)

  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: err.message || 'Server error. Please try again.' })
  }
}
