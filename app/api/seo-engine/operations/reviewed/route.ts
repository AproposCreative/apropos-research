import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { editorialRevisionInput, reviseReviewedMetadata } from '@/lib/seo-engine/post-publish/editorial-revision';
export const maxDuration=300;
export async function POST(req:NextRequest){
 const denied=requireCronBearer(req);if(denied)return denied;
 let input:unknown;try{const raw=await req.text();if(raw.length>5000)throw new Error();input=editorialRevisionInput.parse(JSON.parse(raw));}
 catch{return NextResponse.json({error:'seo_editorial_invalid'},{status:400});}
 try{return NextResponse.json(await reviseReviewedMetadata(input),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return NextResponse.json({error:e instanceof Error&&/^seo_[a-z_]+$/.test(e.message)?e.message:'seo_editorial_failed'},{status:409,headers:{'Cache-Control':'no-store'}});}
}
