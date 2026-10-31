// Explicit owner-requested jingle selection only. No synthesis, publication or deployment.
import {readFile} from 'node:fs/promises';
import {initializeApp,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),recipe=require('./recipe.cjs');
const mode=process.argv[2]||'status';
if(!['status','select'].includes(mode))throw Error('Use status or select');
const auth=JSON.parse(await readFile('/Users/frederikkragh/Library/Application Support/com.vercel.cli/auth.json','utf8'));
async function config(path){const r=await fetch('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId=team_Tvz3Od7ikoA3oBfwtC87wQ7U',{headers:{Authorization:'Bearer '+auth.token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Existing configuration HTTP '+r.status);return r.json();}
const project='prj_sUVIsBr9l8DbjEFDrz6WUAQZcxGE',allow=new Set(['FIREBASE_ADMIN_PROJECT_ID','FIREBASE_ADMIN_CLIENT_EMAIL','FIREBASE_ADMIN_PRIVATE_KEY']);
const list=(await config('/v9/projects/'+project+'/env?decrypt=false')).envs.filter(e=>allow.has(e.key)&&e.target?.includes('production'));
const c={};for(const e of list)c[e.key]=(await config('/v1/projects/'+project+'/env/'+e.id)).value;
if(c.FIREBASE_ADMIN_PROJECT_ID!=='apropos-magazine-6004a')throw Error('Unexpected project');
const app=initializeApp({credential:cert({projectId:c.FIREBASE_ADMIN_PROJECT_ID,clientEmail:c.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:c.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g,'\n')})},'narration-jingle-control');
const db=getFirestore(app),owner=await getAuth(app).getUserByEmail('frederik@aproposmagazine.com');
const access=await db.collection('editorialAccess').doc('frederik@aproposmagazine.com').get();
if(owner.disabled||!owner.emailVerified||(access.exists&&access.data().active!==true))throw Error('Owner access unavailable');
const before=await recipe.readJingleSelection(db);
if(mode==='status')console.log(JSON.stringify({checkedAt:new Date().toISOString(),selection:before,configurationOnly:true,activeWorkerVerified:false,readOnly:true}));
else{
 const version=recipe.selectJingle(process.argv[3]),expected=Number(process.argv[4]);
 if(!process.argv[3]||!process.argv[4]||!Number.isSafeInteger(expected))throw Error('select requires exact version and expected revision');
 // Require a fresh, independent successful active-source readback from the rollout.
 const release=JSON.parse(await readFile('output/narration-v4-release-20261031/production-verified.json','utf8'));
 if(release.recipeVersion!==recipe.RECIPE_VERSION||release.modelId!==recipe.MODEL_ID||release.activeSourceVerified!==true||!release.revision||Date.now()-Date.parse(release.checkedAt)>15*60*1000||Date.parse(release.checkedAt)>Date.now())throw Error('Fresh active-worker verification required');
 const result=await recipe.setJingleSelection(db,version,expected,{uid:owner.uid,ownerVerified:true});
 const readback=await recipe.readJingleSelection(db);if(readback.version!==result.version||readback.revision!==result.revision)throw Error('Selection changed; read back before any retry');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),...result,readback,audioRegenerated:false}));
}
process.exit(0);
