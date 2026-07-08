/**
 * Konstanter brugt af MainChatPanel og evt. fremtidige sub-komponenter.
 *
 * Holdt i et separat modul fordi (a) THINKING_TEXTS bruges flere steder i
 * koden hvis vi senere vil dele tænke-animationen op, og (b) det reducerer
 * top-niveau-kompleksiteten i `MainChatPanel.tsx` (~1938 linjer).
 */

export const THINKING_TEXTS = [
  'Finder vinklen…',
  'Aer katten…',
  'Reflekterer over virkeligheden…',
  'Tilføjer sidechain…',
  'Checker tonal balance…',
  'Lowcutter alt over 80 Hz…',
  'Lægger et magisk reverb-rum…',
  'Sampler virkeligheden…',
  'Ruller d20 for inspiration…',
  'Checker prisen på en Black Lotus…',
  'Tapper mana og skriver videre…',
  'Laver en soft-clip på egoet…',
  'Ligger automation på sætningen…',
  'Mixer lidt mere følelse i mix-bussen…',
  'Stemmer teksten i 432 Hz…',
  'Loader plug-in\'et "Human Touch v1.3"…',
  'Korrigerer for latens i virkeligheden…',
  'Kalibrerer tonen…',
  'Overdubber med selvironi…',
  'Bouncer til master…',
] as const;
