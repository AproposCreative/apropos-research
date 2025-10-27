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
	
	// Clean up private key - remove quotes and normalize line breaks
	let cleanKey = sa.private_key.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n');
	if (!cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
		cleanKey = `-----BEGIN PRIVATE KEY-----\n${cleanKey}\n-----END PRIVATE KEY-----`;
	}
	
	const keyObj = createPrivateKey({ key: cleanKey, format: 'pem' });
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
    // Node fetch type expects BodyInit; use Blob for compatibility
    const arrBuf = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
    const body = new Blob([arrBuf], { type: contentType });
    const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': contentType,
		},
        body: body as any,
	});
	if (!res.ok) {
		let bodyText = '';
		try { bodyText = await res.text(); } catch {}
		throw new Error(`Upload failed: ${res.status} ${bodyText}`);
	}
	return await res.json();
}

async function main() {
	const [, , localPath, remoteName] = process.argv;
	if (!localPath || !remoteName) {
		console.error('Usage: tsx scripts/upload-to-storage.ts <localFile> <remoteObjectName>');
		process.exit(1);
	}

	// Load .env.local if present (simple parser with multiline support)
	try {
		const envPath = path.join(process.cwd(), '.env.local');
		if (fs.existsSync(envPath)) {
			const text = fs.readFileSync(envPath, 'utf8');
			const lines = text.split(/\r?\n/);
			let i = 0;
			while (i < lines.length) {
				const line = lines[i].trim();
				if (!line || line.startsWith('#')) {
					i++;
					continue;
				}
				const eq = line.indexOf('=');
				if (eq === -1) {
					i++;
					continue;
				}
				const key = line.slice(0, eq).trim();
				let val = line.slice(eq + 1).trim();
				
				// Handle multiline values (like private keys)
				if (val.startsWith("'") && !val.endsWith("'")) {
					// Multiline value starting with single quote
					val = val.slice(1); // Remove opening quote
					i++;
					while (i < lines.length && !lines[i].trim().endsWith("'")) {
						val += '\n' + lines[i];
						i++;
					}
					if (i < lines.length) {
						val += '\n' + lines[i].trim().slice(0, -1); // Remove closing quote
					}
				} else {
					val = val.replace(/^['"]|['"]$/g, '');
				}
				
				if (!process.env[key]) process.env[key] = val;
				i++;
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
	console.log('Upload candidates:', candidates.join(', '));
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


