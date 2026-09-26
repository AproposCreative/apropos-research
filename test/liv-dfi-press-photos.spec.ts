import {expect,it} from 'vitest';
import {extractLivDfiPressPhotos,isLivDfiPressPage} from '@/lib/liv/dfi-press-photos';

const page='https://via.ritzau.dk/pressemeddelelse/15155265/film-award?publisherId=13560928';
const header='<div data-cypress="release-header"><a href="/nyhedsrum/13560928/det-danske-filminstitut">DFI</a></div>';
const figure=(id='535736',caption='Instruktør i Venedig. Foto: Aleksander Kalka',credit='')=>
 `<figure><img src="/data/images/public/13560928/15155265/8402aa13-b36c-48fa-b01b-5e5513075830-w_240.jpg"><figcaption>${caption}</figcaption><figcaption><strong>${credit}</strong></figcaption><a class="GalleryItem__link" href="/files/13560928/15155265/${id}/da" download>Download</a></figure>`;
it('reads distinct public download links with their actual photographer or rightsholder',()=>{
 expect(extractLivDfiPressPhotos(header+figure()+figure('535737','Still fra filmen','Nordisk Film'),page)).toEqual([
  {url:'https://via.ritzau.dk/files/13560928/15155265/535736/da',credit:'Foto: Aleksander Kalka'},
  {url:'https://via.ritzau.dk/files/13560928/15155265/535737/da',credit:'Pressebillede: Nordisk Film'}]);
});
it('does not trust other publishers, disguised hosts, credentials or mismatched release links',()=>{
 for(const bad of [page.replace('https:','http:'),page.replace('via.ritzau.dk','via.ritzau.dk.evil.test'),page.replace('13560928','12345'),page+'&token=secret',page+'&publisherId=12345']){
  expect(isLivDfiPressPage(bad)).toBe(false);expect(extractLivDfiPressPhotos(header+figure(),bad)).toEqual([]);
 }
 for(const html of [figure(),header.replace('13560928','12345')+figure(),header+figure().replace('/files/13560928/15155265','/files/13560928/11111'),header+figure().replace('href="/files/','href="https://evil.test/files/')])expect(extractLivDfiPressPhotos(html,page)).toEqual([]);
});
it('rejects uncredited, ambiguous, multi-image or unrelated figures; never borrows a footer credit',()=>{
 for(const html of [header+figure('535736','Scene','')+'<footer>Foto: Someone</footer>',header+'<aside>'+figure()+'</aside>',header+figure().replace('<img','<img src="/other.jpg"><img'),header+figure().replace('download>','>'),header+figure()+' '.repeat(1_000_000)]) expect(extractLivDfiPressPhotos(html,page)).toEqual([]);
 expect(extractLivDfiPressPhotos(header+figure()+figure('535736','Foto: Someone Else'),page)).toEqual([]);
 expect(extractLivDfiPressPhotos(header+figure()+figure(),page)).toHaveLength(1);
});
