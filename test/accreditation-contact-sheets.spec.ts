import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/accreditation/sheet-auth',()=>({getSheetsAccessToken:async()=>'FAKE-TEST-TOKEN'}));
import { parseContactSheetRows,parseWorkflowRows,pullAdditionalAccreditationSource,ADDITIONAL_ACCREDITATION_SOURCES,syncRequestToSheet,requestToWorkflowValues } from '@/lib/accreditation/sheet-client';
import { WORKFLOW_SHEET_HEADERS } from '@/lib/accreditation/types';
afterEach(()=>vi.unstubAllGlobals());

it('reads the live Danish header shapes, actual emails and explicit opt-outs without inventing permissions',()=>{
  const rows=parseContactSheetRows([
    ['Festival','Må kontaktes ','Kontaktperson ','Kontaktinformation','Rolle','Andre'],
    ['Fixture Festival','Nej','Alex','Telefon 123; press@example.test / other@example.test','Presse','Old relation'],
    ['','','Bea','https://example.test/form','Presse'],
  ]);
  expect(rows).toHaveLength(3);expect(rows[0]).toMatchObject({name:'Alex',company:'Fixture Festival',email:'press@example.test',relationshipStatus:'do_not_contact'});
  expect(rows[1].email).toBe('other@example.test');expect(rows[2].email).toBeUndefined();expect(rows[2].company).toBeUndefined();
  expect(rows[2].raw['Preceding festival heading (unverified context)']).toBe('Fixture Festival');expect(rows[2].relationshipStatus).toBeUndefined();
  expect(rows[0].raw.Andre).toBe('Old relation');expect(rows[0].raw.sourceRow).toBe('2');
});
it('preserves bank relations, duplicate headings, blank-header cells and values beyond column Z',()=>{
  const head=['Kontakt','Email','Organisation','Billetrolle','Relationsstatus','Noter','Noter',''];
  const row=['Alex','press@example.test','Agency','Koncerter','warm','first','second','unlabelled'];row[26]='Last column';
  const [c]=parseContactSheetRows([head,row]);expect(c).toMatchObject({name:'Alex',company:'Agency',role:'Koncerter',relationshipStatus:'warm'});
  expect(c.raw['Noter']).toBe('first');expect(c.raw['Noter [column 7]']).toBe('second');expect(c.raw['Column 8']).toBe('unlabelled');expect(c.raw['Column 27']).toBe('Last column');
});
it('normalizes only workflow header formatting, keeps exact columns and rejects ambiguous schema',()=>{
  const headers=WORKFLOW_SHEET_HEADERS.map(h=>h.replaceAll('/',' / ')),row=WORKFLOW_SHEET_HEADERS.map((_,i)=>`cell-${i}`);
  const [r]=parseWorkflowRows([headers,row]);expect(r.requestId).toBe('cell-0');expect(r.artist).toBe('cell-1');expect(r.promoter).toBe('cell-7');expect(r.outcomeReason).toBe('cell-14');expect(r.emailThreadSource).toBe('cell-15');
  expect(()=>parseWorkflowRows([[...headers,'Artist/event'],row])).toThrow('tvetydige');expect(()=>parseWorkflowRows([['Something else'],['value']])).toThrow('kolonneoverskrifter');
});
it('reads extra tabs without writes and preserves both parallel historical opportunity lists',async()=>{
  const fetcher=vi.fn(async(_url:unknown,_init?:RequestInit)=>Response.json({values:[['Dato','Artist','Location','Promoter /  Arrangør','','Date','Artist','Venue','Promoter'],['2018-01-01','One','Hall','A','','2019-01-01','Two','Room','B']]}));vi.stubGlobal('fetch',fetcher);
  const rows=await pullAdditionalAccreditationSource(ADDITIONAL_ACCREDITATION_SOURCES[2]);expect(rows).toHaveLength(1);expect(rows[0].name).toBe('One / Two');
  expect(rows[0].raw.Artist).toBe('One');expect(rows[0].raw['Artist [column 7]']).toBe('Two');expect(rows[0].email).toBeUndefined();
  expect(decodeURIComponent(String(fetcher.mock.calls[0][0]))).toContain("'Milo, Muligheder'!A:AZ");expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
});
it('refuses a sync against reordered columns or duplicate IDs and keeps requested ticket quantity',async()=>{
  const request={id:'LIV-fixture',artist:'Fixture',applicants:[{name:'One applicant'}],ticketQuantity:3,senderMailbox:'liv',status:'researching'} as any;
  expect(requestToWorkflowValues(request)[5]).toBe('3');
  const headers=[...WORKFLOW_SHEET_HEADERS];[headers[0],headers[1]]=[headers[1],headers[0]];
  const fetcher=vi.fn(async()=>Response.json({values:[headers]}));vi.stubGlobal('fetch',fetcher);
  await expect(syncRequestToSheet(request)).rejects.toThrow('column order');expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue(Response.json({values:[WORKFLOW_SHEET_HEADERS,['LIV-fixture','One'],['LIV-fixture','Two']]}));
  await expect(syncRequestToSheet(request)).rejects.toThrow('duplicate request ID');expect(fetcher).toHaveBeenCalledTimes(2);
});
