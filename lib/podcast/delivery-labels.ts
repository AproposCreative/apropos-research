export const PODCAST_SPOTIFY_SHOW_ID = '2I1kdhSpGpADdK26NoDOE8';
export const PODCAST_SPOTIFY_SHOW_URL = `https://open.spotify.com/show/${PODCAST_SPOTIFY_SHOW_ID}`;
export const PODCAST_ISSUE_LABELS: Record<string, string> = {
  source_missing: 'Originalartiklen kunne ikke findes. Lyd og historik er bevaret.',
  audio_failed: 'Lydproduktionen er stoppet. Den gemte kørsel skal kontrolleres før ny oplæsning.',
  audio_stalled: 'Lydproduktionen har ventet i mere end to timer.',
  duration_unavailable: 'Varigheden kunne ikke måles fra den eksisterende lydfil.',
  podcast_published_cover_missing: 'Artiklen mangler et publiceret coverbillede.',
  podcast_artwork_processing_failed: 'Coverbilledet kunne ikke behandles. Den eksisterende kopi er bevaret.',
  podcast_artwork_upload_failed: 'Coverbilledet kunne ikke gemmes.',
  podcast_artwork_readback_failed: 'Det gemte cover kunne ikke verificeres.',
  metadata_sync_failed: 'Artikeloplysninger kunne ikke hentes. Senest gemte data er bevaret.',
  duration_sync_failed: 'Varigheder kunne ikke opdateres. Eksisterende lyd er bevaret.',
  status_sync_failed: 'Status kunne ikke gemmes. Genindlæs status før genoptagelse.',
  feed_mirror_failed: 'Feedets reservekopi kunne ikke opdateres.',
};
