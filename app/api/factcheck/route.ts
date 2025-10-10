import { NextRequest, NextResponse } from 'next/server';

// Placeholder fact-check endpoint. In production, enrich with trusted APIs (News API, Wikipedia, Google Fact Check Tools)
export async function POST(request: NextRequest) {
	try {
		const { claims } = await request.json();
		if (!Array.isArray(claims)) return NextResponse.json({ error: 'claims[] required' }, { status: 400 });
		// For now, echo structure with "unknown" status.
		const results = claims.map((c) => ({ claim: String(c || ''), status: 'unknown', evidence: [] }));
		return NextResponse.json({ ok: true, results });
	} catch (e) {
		return NextResponse.json({ error: 'factcheck failed' }, { status: 500 });
	}
}


