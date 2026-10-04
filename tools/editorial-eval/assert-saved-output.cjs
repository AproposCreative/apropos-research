const { createHash } = require('node:crypto');
module.exports = output => {
  try {
    const data = JSON.parse(output);
    const hash = createHash('sha256').update(JSON.stringify([data.title, data.intro, data.bodyText])).digest('hex');
    const valid = typeof data.title === 'string' && data.title.trim().length > 0 &&
      typeof data.bodyText === 'string' && data.bodyText.length >= 100 && hash === data.textHash &&
      data.publicationApproval === false && data.humanScores === null;
    const flags = [data.bodyText.includes('—') && 'em-dash', /Det interessante er|Det er værd at bemærke|I en tid hvor/i.test(data.bodyText) && 'stock-phrase'].filter(Boolean);
    return { pass: valid, score: valid ? 1 : 0,
      reason: `Saved-output integrity only; NOT a quality/factual score. Editorial review flags: ${flags.join(', ') || 'none detected'}. Human evaluation still required.` };
  } catch { return { pass: false, score: 0, reason: 'Invalid saved-output record; no model was called.' }; }
};
