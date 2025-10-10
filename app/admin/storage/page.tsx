import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function StorageAdminPage() {
	const { user } = useAuth();
	const [file, setFile] = useState<File | null>(null);
	const [path, setPath] = useState('apropos-config/prompts/apropos_writer.prompt');
	const [uploading, setUploading] = useState(false);
	const [url, setUrl] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!user) setMessage('Login kræves for at uploade.');
	}, [user]);

	const handleUpload = async () => {
		if (!user) { setMessage('Du skal være logget ind.'); return; }
		if (!file || !path) { setMessage('Vælg fil og angiv stifinder.'); return; }
		try {
			setUploading(true);
			setMessage(null);
			const r = ref(storage, path);
			const buf = await file.arrayBuffer();
			await uploadBytes(r, new Uint8Array(buf));
			const durl = await getDownloadURL(r);
			setUrl(durl);
			setMessage('Upload fuldført');
		} catch (e) {
			console.error(e);
			setMessage('Upload fejlede');
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="p-6 text-white">
			<h1 className="text-xl font-medium mb-4">Firebase Storage Uploader</h1>
			<div className="mb-4 text-sm text-white/70">Standardsti: apropos-config/prompts/apropos_writer.prompt eller apropos-config/embeddings/articles-embeddings.json</div>
			<div className="space-y-3 max-w-xl">
				<input type="text" value={path} onChange={(e)=>setPath(e.target.value)} className="w-full px-3 py-2 bg-black border border-white/20 rounded-md" placeholder="apropos-config/..." />
				<input type="file" onChange={(e)=>setFile(e.target.files?.[0] || null)} className="block" />
				<button onClick={handleUpload} disabled={uploading || !file || !path} className="px-4 py-2 bg-blue-600 rounded disabled:opacity-50">{uploading ? 'Uploader…' : 'Upload'}</button>
				{message && <div className="text-sm text-white/70">{message}</div>}
				{url && <div className="text-xs break-all">URL: {url}</div>}
			</div>
		</div>
	);
}
