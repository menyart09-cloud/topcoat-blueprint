// Proxies requests to the Google Apps Script backend. Google Apps Script
// web apps don't reliably send CORS headers, so a browser calling
// script.google.com directly gets blocked — this endpoint calls Google
// server-to-server instead, which isn't subject to that browser
// restriction, and just passes the result back to the client.
const SHEETS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwaUsAc83sErNlyngkX1XvKv0M81kpSq0CammlP7irHfL2Z2hc5kjAbCl13X2qjTWFK/exec'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const response = await fetch(SHEETS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(req.body),
      redirect: 'follow' // Apps Script's /exec URL responds with a redirect to the real content
    })
    const rawText = await response.text()
    try {
      const data = JSON.parse(rawText)
      return res.status(200).json(data)
    } catch (parseErr) {
      // Google didn't return JSON — surface exactly what it did return
      // (truncated) so we can see the real cause instead of guessing.
      return res.status(500).json({
        error: 'Google returned non-JSON. HTTP status: ' + response.status,
        rawResponsePreview: rawText.slice(0, 1500)
      })
    }
  } catch (err) {
    return res.status(500).json({ error: 'Sheets proxy failed: ' + (err.message || 'Unknown error') })
  }
}
