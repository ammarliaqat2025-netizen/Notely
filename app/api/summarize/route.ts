// File: /pages/api/summarize.ts
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { title, body } = await request.json()

    if (!body?.trim()) {
      return NextResponse.json({ error: 'No content' }, { status: 400 })
    }

    // Make request to Groq LLM
    const response = await fetch('https://api.groq.com/v1/llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // free Groq model
        input: `Summarize this note in 2-3 clear sentences. Capture key points only. No preamble.\n\nTitle: ${title}\n\nContent:\n${body}`,
        max_output_tokens: 200
      })
    })

    const data = await response.json()
    console.log('Groq response:', data) // helpful for debugging

    if (!response.ok) {
      console.error('Groq API error:', data)
      return NextResponse.json({ error: 'Groq API failed' }, { status: 500 })
    }

    // Groq free endpoint usually returns `output_text` field
    const summary = data.output_text || 'Could not generate summary.'
    return NextResponse.json({ summary })

  } catch (err: any) {
    console.error('Server error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
