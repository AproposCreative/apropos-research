#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { createSign, createPrivateKey } from 'crypto';

function base64url(input: Buffer | string): string {
	const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
	return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(sa: {
	client_email: string;
	private_key: string;
	token_uri: string;
}): Promise<string> {
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + 3600;
	const scope = 'https://www.googleapis.com/auth/devstorage.read_write';
	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = {
		iss: sa.client_email,
		scope,
		aud: sa.token_uri,
		exp,
		iat,
	};
	const toSign = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
	const signer = createSign('RSA-SHA256');
	signer.update(toSign);
    const keyObj = createPrivateKey({ key: sa.private_key, format: 'pem' });
    const sig = signer.sign(keyObj);
	const assertion = `${toSign}.${base64url(sig)}`;
	const body = new URLSearchParams({
		grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
		assertion,
	});
	const res = await fetch(sa.token_uri, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});
	if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
	const json: any = await res.json();
	return json.access_token;
}

async function uploadObject(bucket: string, name: string, content: Buffer, contentType = 'application/octet-stream') {
	const tokenUri = process.env.FIREBASE_ADMIN_TOKEN_URI || 'https://oauth2.googleapis.com/token';
	const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
	const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
	if (!clientEmail || !privateKey) throw new Error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY');
	const accessToken = await getAccessToken({ client_email: clientEmail, private_key: privateKey, token_uri: tokenUri });
	const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(name)}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': contentType,
		},
		body: content,
	});
	if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
	return await res.json();
}

async function main() {
	const [, , localPath, remoteName] = process.argv;
	if (!localPath || !remoteName) {
		console.error('Usage: tsx scripts/upload-to-storage.ts <localFile> <remoteObjectName>');
		process.exit(1);
	}

	// Load .env.local if present (simple parser)
	try {
		const envPath = path.join(process.cwd(), '.env.local');
		if (fs.existsSync(envPath)) {
			const text = fs.readFileSync(envPath, 'utf8');
			for (const line of text.split(/\r?\n/)) {
				const t = line.trim();
				if (!t || t.startsWith('#')) continue;
				const eq = t.indexOf('=');
				if (eq === -1) continue;
				const key = t.slice(0, eq).trim();
				let val = t.slice(eq + 1).trim();
				val = val.replace(/^['"]|['"]$/g, '');
				if (!process.env[key]) process.env[key] = val;
			}
		}
	} catch {}
	const proj = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
	if (!proj) throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID');

	// Determine candidate buckets (Firebase can be appspot.com or firebasestorage.app depending on setup)
	const explicitBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
	const candidates = [
		explicitBucket,
		`${proj}.appspot.com`,
		`${proj}.firebasestorage.app`,
	].filter(Boolean) as string[];
	const abs = path.isAbsolute(localPath) ? localPath : path.join(process.cwd(), localPath);
	if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
	const buf = fs.readFileSync(abs);
	const ct = remoteName.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';

	let lastErr: any = null;
	for (const b of candidates) {
		try {
			const out = await uploadObject(b, remoteName, buf, ct);
			console.log('Uploaded to bucket:', b, 'object:', out?.name || remoteName);
			return;
		} catch (e:any) {
			lastErr = e;
			console.warn('Upload attempt failed for bucket', b, String(e?.message || e));
		}
	}
	throw lastErr || new Error('Upload failed to all candidate buckets');
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});


