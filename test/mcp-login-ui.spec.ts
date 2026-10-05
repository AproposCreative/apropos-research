import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import sharp from 'sharp';
import ConnectionLogin, { connectionLoginMessage } from '@/app/connect/chatgpt/login';
import { ACCESS_MESSAGE, ACCESS_TIMEOUT_MESSAGE, ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/auth-access-client';

const render = (accessError = '') => load(renderToStaticMarkup(createElement(ConnectionLogin, {
  signIn: async () => {}, signInWithGoogle: async () => {}, accessError,
})));

it('puts Google first and keeps password login available but collapsed', () => {
  const $ = render();
  expect($('button').first().text()).toBe('Fortsæt med Google');
  expect($('details').attr('open')).toBeUndefined();
  expect($('summary').text()).toBe('Brug e-mail og adgangskode');
  expect($('details button').text()).toBe('Log ind med adgangskode');
  expect($('input[type=email]').attr('value')).toBe('');
  expect($('input[type=email]').attr('autocomplete')).toBe('username');
  expect($('input[type=password]').attr('autocomplete')).toBe('current-password');
  expect($.html()).not.toContain('frederik@');
  expect($.text()).toContain('foreløbig kun åben for Frederik');
  expect($.text()).toContain('ikke en separat Apropos-adgangskode');
  expect($('svg').attr('aria-hidden')).toBe('true');
});

it('shows one accessible, specific access error without replacing the form', () => {
  const $ = render(ACCESS_MESSAGE);
  expect($('[role=alert]').length).toBe(1);
  expect($('[role=alert]').text()).toBe(ACCESS_MESSAGE);
  expect($('button').first().text()).toBe('Fortsæt med Google');
});

it.each([ACCESS_MESSAGE, ACCESS_TIMEOUT_MESSAGE, ACCESS_UNAVAILABLE_MESSAGE])('preserves the server access check: %s', message => {
  expect(connectionLoginMessage(new Error(message), 'google')).toBe(message);
});

it('handles blocked/cancelled Google popups and network failures without displaying raw errors', () => {
  expect(connectionLoginMessage({ code: 'auth/popup-blocked' }, 'google')).toContain('Tillad pop op-vinduer');
  for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
    expect(connectionLoginMessage({ code }, 'google')).toContain('blev afbrudt');
  }
  expect(connectionLoginMessage({ code: 'auth/network-request-failed' }, 'google')).toContain('netværk');
  expect(connectionLoginMessage(new Error('secret-token'), 'google')).not.toContain('secret-token');
  expect(connectionLoginMessage(new Error('invalid password'), 'password')).toContain('normalt Google');
});

it('ships an actual square, small PNG at the advertised MCP icon path', async () => {
  const metadata = await sharp('public/images/apropos-ai-icon.png').metadata();
  expect(metadata).toMatchObject({ format: 'png', width: 256, height: 256 });
});
