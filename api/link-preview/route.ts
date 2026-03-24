import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fetch from 'node-fetch';

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    const html = await res.text();

    // Simple regex parsing for <title> and meta description
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const descMatch = html.match(
      /<meta\s+name=["']description["']\s+content=["'](.*?)["']/
    );
    
    const title = titleMatch ? titleMatch[1] : '';
    const description = descMatch ? descMatch[1] : '';

    return NextResponse.json({ title, description });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 500 });
  }
}
