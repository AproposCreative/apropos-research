import { z } from 'zod';

const point = { x: z.number().min(0).max(1650), y: z.number().min(0).max(1045) };
export const setupKeys = ['Enter', 'Tab', 'Shift+Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Control+A'];
const event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('key'), key: z.enum(setupKeys) }).strict(),
  z.object({ type: z.literal('click'), ...point }).strict(),
  z.object({ type: z.literal('scroll'), ...point, deltaY: z.number().min(-1045).max(1045) }).strict(),
]);
export const setupCommand = z.object({
  action: z.enum(['begin', 'refresh', 'poll', 'input', 'click', 'text', 'key', 'instagram', 'finish', 'cancel', 'verify']),
  setupId: z.string().uuid().optional(), ...Object.fromEntries(Object.entries(point).map(([key, value]) => [key, value.optional()])),
  text: z.string().max(2000).optional(), key: z.enum(setupKeys).optional(),
  events: z.array(event).min(1).max(24).optional(),
}).strict().superRefine((value, context) => {
  const valid = (['begin', 'cancel', 'verify'].includes(value.action) || !!value.setupId) &&
    (value.action !== 'click' || (value.x !== undefined && value.y !== undefined)) &&
    (value.action !== 'text' || typeof value.text === 'string') &&
    (value.action !== 'key' || !!value.key) &&
    (value.action !== 'input' || !!value.events) &&
    (!value.events || (value.action === 'input' && value.events.reduce((n, item) => n + (item.type === 'text' ? item.text.length : 0), 0) <= 2000));
  if (!valid) context.addIssue({ code: 'custom', message: 'invalid_setup_command' });
});
