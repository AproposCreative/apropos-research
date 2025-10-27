import { NextRequest, NextResponse } from 'next/server';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export async function GET(req: NextRequest) {
	try {
		let promptText = '';
		
		// Try Firebase Storage first
		try {
			const r = ref(storage, 'apropos-config/prompts/apropos_writer.prompt');
			const url = await getDownloadURL(r);
			const res = await fetch(url);
			if (res.ok) {
				promptText = await res.text();
			}
		} catch {}

		// Fallback to local file
		if (!promptText) {
			const fs = require('fs');
			const path = require('path');
			const p = path.join(process.cwd(), 'prompts', 'apropos_writer.prompt');
			if (fs.existsSync(p)) {
				promptText = fs.readFileSync(p, 'utf8');
			}
		}
		
		if (!promptText) {
			return NextResponse.json({ error: 'prompt not found' }, { status: 404 });
		}
		
		// Load structure file and replace placeholder
		const fs = require('fs');
		const path = require('path');
		const structurePath = path.join(process.cwd(), 'prompts', 'structure.apropos.md');
		
		if (fs.existsSync(structurePath)) {
			const structureContent = fs.readFileSync(structurePath, 'utf8');
			// Replace the placeholder with actual structure content
			promptText = promptText.replace(
				'STRUCTURE LAYER (v3)\n[This section will be dynamically loaded from prompts/structure.apropos.md]',
				`STRUCTURE LAYER (v3)\n${structureContent}`
			);
		}
		
		return new NextResponse(promptText, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	} catch (e) {
		return NextResponse.json({ error: 'failed to load prompt' }, { status: 500 });
	}
}


