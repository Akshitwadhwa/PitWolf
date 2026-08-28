/**
 * Audio transcription via Hugging Face Whisper inference API.
 * Accepts a Buffer of audio data and returns the transcribed text.
 */

const WHISPER_MODEL = 'openai/whisper-large-v3'

/**
 * Transcribe audio using Hugging Face Inference API.
 * @param {Buffer} audioBuffer - raw audio data
 * @param {string} [mimeType='audio/webm'] - MIME type of the audio
 * @returns {Promise<{text: string, model: string}>}
 */
export async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  const token = process.env.HF_API_TOKEN
  if (!token) {
    throw new Error('HF_API_TOKEN is not configured. Cannot transcribe audio.')
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${WHISPER_MODEL}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': mimeType,
        },
        body: audioBuffer,
      },
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      let parsed = {}
      try { parsed = JSON.parse(errorText) } catch {}
      
      if (response.status === 503 && parsed.error?.includes('loading') && attempt < 2) {
        const waitTime = (parsed.estimated_time || 2) * 1000
        await new Promise((r) => setTimeout(r, Math.min(waitTime, 6000))) // Wait up to 6s
        continue
      }
      throw new Error(`Whisper API error ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    // HF Whisper returns { text: "..." }
    const text = result?.text || result?.[0]?.text || ''
    if (!text) {
      throw new Error('Whisper returned an empty transcription.')
    }

    return { text: text.trim(), model: WHISPER_MODEL }
  }
  throw new Error('Whisper API failed to load.')
}
