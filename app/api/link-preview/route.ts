import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

    const res = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const html = await res.text();

    // Check if we actually got blocked
    if (html.includes("Just a moment...") || html.includes("Enable JavaScript") || res.status === 403) {
      return NextResponse.json({ error: 'Site access challenged by security. Try again in a minute.' }, { status: 403 });
    }

    const getMeta = (p: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, 'i'));
      return m ? m[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Webpage';
    const domain = new URL(url).hostname.replace('www.', '');
    const image = getMeta('og:image') || '';

    // Better Content Extraction: Focus on paragraphs
    const bodyContent = html.match(/<p>(.*?)<\/p>/g) || [];
    const cleanBody = bodyContent
      .map(p => p.replace(/<[^>]+>/g, '').trim())
      .filter(p => p.length > 30) // Only keep actual paragraphs
      .join('\n\n')
      .slice(0, 8000);

    return NextResponse.json({ title, domain, url, fullContent: cleanBody, image });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
