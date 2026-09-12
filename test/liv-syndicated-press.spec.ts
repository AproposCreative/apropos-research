import {expect,it} from 'vitest';
import {extractLivSyndicatedPressPhotos,isLivSyndicatedPressPage} from '@/lib/liv/photo-credit';
const page='https://soundvenue.com/film/2026/09/klovn-123';
const image='https://soundvenue.com/wp-content/uploads/2026/09/Klovn-8b.jpg';
const figure=(credit:string,src=image)=>`<figure><img src="${src}"><figcaption>Klovn sæson 11. (${credit})</figcaption></figure>`;
it('retains an exact per-image TV 2 credit and source asset',()=>{
 expect(extractLivSyndicatedPressPhotos(figure('Foto: Per Arnesen/TV 2'),page)).toEqual([{url:image,credit:'Foto: Per Arnesen/TV 2'}]);
});
it.each(['https://soundvenue.com.evil.test/film/2026/09/klovn-123',page+'?token=x',page+'#fragment','https://soundvenue.com/musik/2026/09/klovn-123'])('rejects unsupported source %s',url=>{
 expect(isLivSyndicatedPressPage(url)).toBe(false);
 expect(extractLivSyndicatedPressPhotos(figure('Foto: Per Arnesen/TV 2'),url)).toEqual([]);
});
it('does not invent credits or transfer footer/adjacent credits',()=>{
 expect(extractLivSyndicatedPressPhotos('<img src="'+image+'"><footer>Foto: Per Arnesen/TV 2</footer>'+figure('Foto: Unknown'),page)).toEqual([]);
});
it('rejects unrelated CDN assets and nested ambiguous figures',()=>{
 expect(extractLivSyndicatedPressPhotos(figure('Foto: Per Arnesen/TV 2','https://evil.test/a.jpg'),page)).toEqual([]);
 expect(extractLivSyndicatedPressPhotos('<aside>'+figure('Foto: Per Arnesen/TV 2')+'</aside>',page)).toEqual([]);
});
