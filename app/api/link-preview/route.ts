import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36' }
    });

    const html = await res.text();
    const getMeta = (p: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, 'i'));
      return m ? m[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Webpage';
    const description = getMeta('og:description') || getMeta('description') || '';
    const image = getMeta('og:image') || '';
    const domain = new URL(url).hostname.replace('www.', '');

    const fullContent = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    return NextResponse.json({ title, description, image, domain, url, fullContent });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
