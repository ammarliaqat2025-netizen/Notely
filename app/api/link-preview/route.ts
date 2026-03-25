import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

    const res = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    // If the site blocks us (Status 403 or 401), stop immediately
    if (res.status === 403 || res.status === 401) {
      return NextResponse.json({ error: 'This website blocks automated clipping (Paywalled/Protected)' }, { status: 403 });
    }

    const html = await res.text();

    // If the text contains common "Access Denied" keywords, stop
    if (html.includes("Access Error") || html.includes("Access Denied") || html.includes("Cloudflare")) {
        return NextResponse.json({ error: 'Access denied by website security.' }, { status: 403 });
    }

    const getMeta = (prop: string) => {
      const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Webpage';
    const domain = new URL(url).hostname.replace('www.', '');

    let cleanText = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
      .replace(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gim, "") // Remove navigation menus
      .replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gim, "") // Remove footers
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return NextResponse.json({ 
        title, 
        domain, 
        url, 
        fullContent: cleanText.slice(0, 10000),
        image: getMeta('og:image') || ''
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
