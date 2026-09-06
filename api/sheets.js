// Proxies requests to the Google Apps Script backend. Google Apps Script
// web apps don't reliably send CORS headers, so a browser calling
// script.google.com directly gets blocked — this endpoint calls Google
// server-to-server instead, which isn't subject to that browser
// restriction, and just passes the result back to the client.
const SHEETS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwaUsAc83sErNlyngkX1XvKv0M81kpSq0CammlP7irHfL2Z2hc5kjAbCl13X2qjTWFK/exec'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Apps Script's /exec URL responds with a redirect to the real content.
    // Letting fetch auto-follow this (redirect:'follow') can, outside a
    // real browser session, end up landing on a Google Drive webpage
    // instead of the script's actual output. Handling the redirect
    // manually — following it ourselves as a plain GET-less second
    // request — avoids that.
    const first = await fetch(SHEETS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(req.body),
      redirect: 'manual'
    })

    let finalResponse = first
    const location = first.headers.get('location')
    if (location) {
      finalResponse = await fetch(location, { redirect: 'follow' })
    }

    const rawText = await finalResponse.text()
    try {
      const data = JSON.parse(rawText)
      return res.status(200).json(data)
    } catch (parseErr) {
      return res.status(500).json({
        error: 'Google returned non-JSON. HTTP status: ' + finalResponse.status,
        rawResponsePreview: rawText.slice(0, 1500)
      })
    }
  } catch (err) {
    return res.status(500).json({ error: 'Sheets proxy failed: ' + (err.message || 'Unknown error') })
  }
}
