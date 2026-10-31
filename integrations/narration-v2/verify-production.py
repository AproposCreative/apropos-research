"""Read-only verification of the released worker before an owner jingle change.
Requires existing gcloud access; never changes IAM, credentials, settings or jobs.
"""
import subprocess,json,hashlib,datetime,pathlib,sys,urllib.request,urllib.error,zipfile
PROJECT='apropos-magazine-6004a'
REGION='us-central1'
FUNCTION='generateNarrationOnQueue'
SERVICE='generatenarrationonqueue'
TRIGGER='generatenarrationonqueue-803331'
ROOT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'output/narration-v2-release-20261031').resolve()
ROOT.mkdir(parents=True,exist_ok=True)
def command(*args):
    return json.loads(subprocess.check_output(['gcloud',*args,'--project='+PROJECT,'--format=json'],stderr=subprocess.PIPE))
def digest(x):
    x=json.loads(json.dumps(x))
    # Event filter arrays are unordered sets; retain every filter and all other settings.
    for key in ['eventarc','functionEventTrigger']:
        if isinstance(x,dict) and isinstance(x.get(key),dict) and isinstance(x[key].get('eventFilters'),list):
            x[key]['eventFilters']=sorted(x[key]['eventFilters'],key=lambda v:json.dumps(v,sort_keys=True))
    return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def inspect():
    f=command('functions','describe',FUNCTION,'--gen2','--region='+REGION)
    r=command('run','services','describe',SERVICE,'--region='+REGION)
    t=command('eventarc','triggers','describe',TRIGGER,'--location=europe-west1')
    spec=r['spec']['template']['spec'];container=spec['containers'][0]
    config={'runtime':f.get('buildConfig',{}).get('runtime'),'entryPoint':f.get('buildConfig',{}).get('entryPoint'),'functionEnvironment':f.get('environment'),'functionServiceConfig':{k:v for k,v in f.get('serviceConfig',{}).items() if k not in ['revision','uri']},'functionEventTrigger':f.get('eventTrigger'),'containerSpec':{k:v for k,v in container.items() if k not in ['image']},'serviceSpec':{k:v for k,v in spec.items() if k!='containers'},'scalingAnnotations':{k:v for k,v in r['spec']['template'].get('metadata',{}).get('annotations',{}).items() if 'autoscaling' in k or 'vpc' in k or 'cpu' in k or 'execution-environment' in k},'ingress':r['metadata'].get('annotations',{}).get('run.googleapis.com/ingress'),'eventarc':{k:v for k,v in t.items() if k not in ['createTime','updateTime','etag','uid','conditions']}}
    safe={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'functionName':f['name'],'functionKeys':sorted(f),'state':f.get('state'),'updateTime':f.get('updateTime'),'source':f.get('buildConfig',{}).get('source'),'runtime':config['runtime'],'entryPoint':config['entryPoint'],'revision':r.get('status',{}).get('latestReadyRevisionName'),'latestCreatedRevision':r.get('status',{}).get('latestCreatedRevisionName'),'traffic':r.get('status',{}).get('traffic'),'conditions':r.get('status',{}).get('conditions'),'configurationSha256':digest(config),'memoryCpu':container.get('resources'),'timeoutSeconds':spec.get('timeoutSeconds'),'concurrency':spec.get('containerConcurrency'),'scaling':config['scalingAnnotations'],'secretReferences':[{'name':v['name'],'reference':v['valueFrom']} for v in container.get('env',[]) if 'valueFrom' in v],'environmentKeys':[v['name'] for v in container.get('env',[])],'eventarcName':t.get('name'),'eventarcDestination':t.get('destination'),'eventarcEventFilters':t.get('eventFilters'),'eventarcConditions':t.get('conditions')}
    (ROOT/'inspect-latest.json').write_text(json.dumps(safe,indent=2)+'\n')
    print(json.dumps(safe,indent=2));return f,r,t,safe
def source_zip(f,target):
    src=f['buildConfig']['source']['storageSource']
    uri='gs://'+src['bucket']+'/'+src['object']+'#'+str(src['generation'])
    subprocess.run(['gcloud','storage','cp',uri,str(target),'--project='+PROJECT,'--quiet'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    return target.read_bytes()
def file_hashes(data):
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or any(pathlib.PurePosixPath(n).is_absolute() or '..' in pathlib.PurePosixPath(n).parts for n in names):raise RuntimeError('Unsafe source ZIP')
        return {n:hashlib.sha256(z.read(n)).hexdigest() for n in names if not n.endswith('/')}
RECIPE='ellen-continuous-v2-2026-10-31'
ARCHIVE_SHA256='4def328b2841cbf37f71a19c2e119f9bcd7431b79948314edae457e639bdf19e'
CONFIG_SHA256='0b102584f558a9131054fbce018ac02cc3a2d5eaacf168181be08fba9e7639ae'
def verify_live():
    f,r,t,active=inspect()
    if active['state']!='ACTIVE' or active['runtime']!='nodejs22' or active['entryPoint']!=FUNCTION:raise RuntimeError('Unsupported active worker')
    if not active['revision'] or active['revision']!=active['latestCreatedRevision']:raise RuntimeError('Active revision not ready')
    if active['configurationSha256']!=CONFIG_SHA256:raise RuntimeError('Released runtime or trigger settings have changed; review before selecting a jingle')
    if sum(x.get('percent',0) for x in active['traffic'] if x.get('revisionName')==active['revision'])!=100:raise RuntimeError('Active revision does not serve all traffic')
    data=source_zip(f,ROOT/'active-source-verified.zip')
    if hashlib.sha256(data).hexdigest()!=ARCHIVE_SHA256:raise RuntimeError('Active source differs from the supported released recipe')
    hashes=file_hashes(data)
    if len(hashes)!=13:raise RuntimeError('Unexpected active source file count')
    proof={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'recipeVersion':RECIPE,'revision':active['revision'],'activeSourceVerified':True,'configurationUnchanged':True,'configurationSha256':CONFIG_SHA256,'activeArchiveSha256':ARCHIVE_SHA256,'traffic':active['traffic'],'readOnlyVerification':True}
    (ROOT/'production-verified.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof,indent=2))
if __name__=='__main__':
    try:verify_live()
    except subprocess.CalledProcessError as exc:raise SystemExit('Read-only gcloud verification failed with exit '+str(exc.returncode)) from None
