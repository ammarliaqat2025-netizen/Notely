import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36' }
    });

    const html = await res.text();

    // 1. Get Metadata for the card
    const getMeta = (prop: string) => {
      const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["']Base[^>]+content=["']([^"']+)["']`, 'i'));
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Webpage';
    const description = getMeta('og:description') || getMeta('description') || '';
    const image = getMeta('og:image') || '';
    const domain = new URL(url).hostname.replace('www.', '');

    // 2. Extract Full Content (Cleaning the HTML)
    let cleanText = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "") // Remove scripts
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")   // Remove styles
      .replace(/<[^>]+>/g, ' ')                             // Remove all HTML tags
      .replace(/\s+/g, ' ')                                  // Collapse whitespace
      .trim();

    // Limit to first 10,000 characters so it doesn't crash the browser
    const fullContent = cleanText.slice(0, 10000);

    return NextResponse.json({ title, description, image, domain, url, fullContent });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
