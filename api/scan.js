export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { base64, mime, prompt } = req.body
  if (!base64 || !mime) return res.status(400).json({ error: 'Missing data' })

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
        max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    })

    const data = await response.json()
    if (!response.ok) return res.status(200).json([])

    const raw = (data.content || []).map(b => b.text || '').join('').trim()
    
    // Extract JSON array from response
    const arrayMatch = raw.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        const arr = JSON.parse(arrayMatch[0])
        if (Array.isArray(arr)) {
          // Clean up: remove empty strings and duplicates
          const cleaned = [...new Set(arr.filter(n => typeof n === 'string' && n.trim().length > 0))]
          return res.status(200).json(cleaned)
        }
      } catch(e) {}
    }

    // Fallback: try to parse line by line
    const lines = raw.split('\n')
      .map(l => l.replace(/^[-•*"\d.]+\s*/, '').replace(/[",]$/,'').trim())
      .filter(l => l.length > 1 && l.length < 60)
    if (lines.length > 0) return res.status(200).json([...new Set(lines)])

    return res.status(200).json([])
  } catch (err) {
    return res.status(200).json([])
  }
}
