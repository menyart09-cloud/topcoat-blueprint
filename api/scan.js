export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json([])
  const { base64, mime } = req.body
  if (!base64 || !mime) return res.status(400).json([])

  const prompt = `You are analyzing a blueprint floor plan image.

Your task: Find and list every room name, space name, and area label printed on this blueprint.

Look for text labels inside rooms like: "LOBBY", "OFFICE 114", "TRAINER 113", "GYMNASIUM", "BEDROOM", "KITCHEN", "GARAGE", "MASTER BEDROOM", "LOCKER ROOM", "MECHANICAL", "STORAGE", "CONCESSIONS", "VESTIBULE", "CORRIDOR", "BATHROOM", etc.

Include ALL labeled spaces you can see, exactly as printed (you may include room numbers like "Office 114").

Respond ONLY with a valid JSON array of strings. No explanation, no markdown:
["Lobby 101", "Office 114", "Trainer 113", "Gymnasium", "Storage 111"]`

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
        max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    })

    const data = await response.json()
    if (!response.ok) return res.status(200).json([])

    const raw = (data.content || []).map(b => b.text || '').join('').trim()
    
    // Extract JSON array
    const arrayMatch = raw.match(/\[[\s\S]*?\]/)
    if (arrayMatch) {
      try {
        const arr = JSON.parse(arrayMatch[0])
        if (Array.isArray(arr)) {
          const cleaned = [...new Set(
            arr.filter(n => typeof n === 'string' && n.trim().length > 0)
               .map(n => n.trim())
          )]
          return res.status(200).json(cleaned)
        }
      } catch(e) {}
    }
    return res.status(200).json([])
  } catch (err) {
    return res.status(200).json([])
  }
}
