export type StoryConnectionStatus = 'connected' | 'not_connected' | 'not_configured' | 'unavailable';

export function storyConnectionMessage(status: StoryConnectionStatus | null, owner: boolean) {
  if (status === 'connected') return null;
  if (status === 'not_connected') return owner
    ? 'Tilslut den fælles Meta-forbindelse, før teamet kan udgive Stories med artikellink.'
    : 'Ejeren skal tilslutte den fælles Meta-forbindelse, før teamet kan udgive Stories med artikellink. Du skal ikke logge ind på Meta her.';
  if (status === 'not_configured') return 'Story-serveren er ikke tilsluttet. Stories med artikellink kan ikke udgives endnu.';
  if (status === 'unavailable') return 'Story-forbindelsen kunne ikke kontrolleres. Kontrollér status igen, før du udgiver.';
  return 'Kontrollerer Story-forbindelsen…';
}
