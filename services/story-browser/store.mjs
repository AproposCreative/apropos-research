import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function sessionCipher(secret) {
  if (!secret || secret.length < 24) throw Error('session_encryption_unavailable');
  const key = createHash('sha256').update('apropos-story-browser-session-v1\0'+secret).digest();
  return {
    encrypt(state) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()]);
      return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: bytes.toString('base64') };
    },
    decrypt(row) {
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv, 'base64'));
      cipher.setAuthTag(Buffer.from(row.tag, 'base64'));
      return JSON.parse(Buffer.concat([cipher.update(Buffer.from(row.data, 'base64')), cipher.final()]).toString());
    },
  };
}

/** One account executor across instances. Never reclaim an ambiguous send. */
export function storyStore(db, cipher, clock = () => Date.now()) {
  const taskRef = id => db.collection('socialStoryBrowserTasks').doc(id);
  const receiptRef = id => db.collection('socialPublishOperations').doc(id);
  const lockRef = db.collection('socialStoryBrowserControl').doc('account');
  const connection = db.collection('socialStoryBrowserControl').doc('connection');
  return {
    async status() {
      const row = (await connection.get()).data();
      return { connected: !!row?.encryptedState, connectedAt: row?.connectedAt ?? null };
    },
    async session() {
      const row = (await connection.get()).data();
      return row?.encryptedState ? cipher.decrypt(row.encryptedState) : undefined;
    },
    async saveSession(state) {
      const encryptedState = cipher.encrypt(state);
      if (JSON.stringify(encryptedState).length > 800_000) throw Error('session_too_large');
      await connection.set({ encryptedState, connectedAt: new Date(clock()).toISOString() });
    },
    async claim(id) {
      return db.runTransaction(async tx => {
        const [snapshot, lock, receipt] = await Promise.all([tx.get(taskRef(id)), tx.get(lockRef), tx.get(receiptRef(id))]);
        const task = snapshot.data(), prior = lock.data(), approved = receipt.data();
        if (!task || !approved || approved.ownerUid !== task.ownerUid || approved.delivery !== 'business-suite' ||
          !approved.approved?.isStory || approved.channels.facebook || approved.imageSha256 !== task.imageSha256 ||
          approved.approved.articleUrl !== task.articleUrl) throw Error('invalid_story_task');
        if (task.status !== 'queued' || task.dispatchCount !== 0) return { claimed: false, task };
        const created = Date.parse(task.createdAt);
        if (!Number.isFinite(created) || clock()-created > 30*60_000 || created > clock()+60_000) {
          const updatedAt = new Date(clock()).toISOString();
          tx.update(taskRef(id), { status: 'failed', finishedAt: updatedAt, failure: 'approval_expired' });
          tx.update(receiptRef(id), { complete: true, phase: 'stopped', updatedAt,
            instagram: { status: 'failed', error: 'Udgivelsesgodkendelsen udløb før afsendelse. Intet blev sendt.' } });
          return { claimed: false, task, expired: true };
        }
        if (prior?.operationId && (prior.dispatched || prior.until > clock())) return { claimed: false, task, busy: true };
        const updatedAt = new Date(clock()).toISOString();
        tx.update(taskRef(id), { status: 'preparing', updatedAt });
        tx.update(receiptRef(id), { phase: 'story_preparing', updatedAt });
        tx.set(lockRef, { operationId: id, until: clock()+10*60_000, dispatched: false });
        return { claimed: true, task: { ...task, status: 'preparing' } };
      });
    },
    async beforePublish(id) {
      await db.runTransaction(async tx => {
        const [snapshot, lock] = await Promise.all([tx.get(taskRef(id)), tx.get(lockRef)]);
        const task = snapshot.data(), held = lock.data();
        if (task?.status !== 'preparing' || task.dispatchCount !== 0 || held?.operationId !== id || held.dispatched || held.until <= clock())
          throw Error('story_dispatch_locked');
        const at = new Date(clock()).toISOString();
        tx.update(taskRef(id), { status: 'sending', dispatchCount: 1, dispatchedAt: at });
        tx.update(receiptRef(id), { phase: 'story_sending', updatedAt: at, instagram: { status: 'sending' } });
        tx.set(lockRef, { ...held, dispatched: true });
      });
    },
    async finish(id, result) {
      return db.runTransaction(async tx => {
        const [snapshot, receipt, lock] = await Promise.all([tx.get(taskRef(id)), tx.get(receiptRef(id)), tx.get(lockRef)]);
        const task = snapshot.data(), row = receipt.data();
        if (!task || !row) throw Error('invalid_story_task');
        if (['published', 'failed', 'uncertain'].includes(task.status)) return row;
        const at = new Date(clock()).toISOString();
        const published = !!result.mediaId && task.dispatchCount === 1;
        const uncertain = !published && task.dispatchCount === 1;
        const status = published ? 'published' : uncertain ? 'uncertain' : 'failed';
        const instagram = { status, ...(published ? { id: result.mediaId, ...(result.storyUrl ? { url: result.storyUrl } : {}), publishedAt: at } :
          { error: uncertain ? 'Meta-svaret er uklart. Der sendes ikke igen. Kontrollér Storyen.' : result.loginRequired ?
            'Meta kræver login. Ejeren skal tilslutte Story-forbindelsen.' : 'Storyen blev stoppet før udgivelse.' }) };
        const next = { ...row, complete: true, updatedAt: at, instagram,
          phase: published ? result.linkVerified ? 'done' : 'story_link_unverified' : 'stopped',
          storyLink: { ...row.storyLink, status: result.linkVerified ? 'verified' : published ? 'unverified' : 'pending',
            ...(result.linkVerified ? { checkedAt: at } : {}) } };
        tx.update(taskRef(id), { status, finishedAt: at, linkVerified: !!result.linkVerified });
        tx.update(receiptRef(id), next);
        if (lock.data()?.operationId === id && !uncertain) tx.set(lockRef, { operationId: '', until: 0, dispatched: false });
        return next;
      });
    },
  };
}
