import { NextRequest, NextResponse } from 'next/server';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export async function GET(req: NextRequest) {
	try {
		// Try Firebase Storage first
		try {
			const r = ref(storage, 'apropos-config/prompts/apropos_writer.prompt');
			const url = await getDownloadURL(r);
			const res = await fetch(url);
			if (res.ok) {
				const txt = await res.text();
				return new NextResponse(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
			}
		} catch {}

		// Fallback to local file
		const fs = require('fs');
		const path = require('path');
		const p = path.join(process.cwd(), 'prompts', 'apropos_writer.prompt');
		if (fs.existsSync(p)) {
			const txt = fs.readFileSync(p, 'utf8');
			return new NextResponse(txt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
		}
		return NextResponse.json({ error: 'prompt not found' }, { status: 404 });
	} catch (e) {
		return NextResponse.json({ error: 'failed to load prompt' }, { status: 500 });
	}
}


