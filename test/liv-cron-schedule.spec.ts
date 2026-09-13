import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('schedules primary delivery for both Copenhagen UTC offsets and keeps catch-up checks', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.crons.filter((job: { path: string }) => job.path === '/api/cron/liv-daily-article'))
    .toEqual([{ path: '/api/cron/liv-daily-article', schedule: '0 8,9 * * *' }]);
  expect(config.crons).toContainEqual({ path: '/api/cron/liv-delivery-check', schedule: '*/15 * * * *' });
});
