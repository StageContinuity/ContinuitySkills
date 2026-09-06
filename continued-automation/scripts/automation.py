#!/usr/bin/env python3
"""Continued automation authoring tool. Registration only creates immutable drafts."""
import argparse, contextlib, fcntl, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile
ROOT = pathlib.Path(os.environ.get('CONTINUED_AUTOMATIONS_HOME', str(pathlib.Path.home()/'Library/Application Support/AgentBar/automation-artifacts')))
CONNECTORS = ['github.review_requests', 'github.assigned_issues']
def fail(message): raise ValueError(message)
def dump(value): print(json.dumps(value, ensure_ascii=False))
def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f: json.dump(value,f,ensure_ascii=False); f.flush(); os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name): os.unlink(name)
def inspect(bundle):
    bundle = pathlib.Path(bundle).resolve()
    files = {}
    for path in bundle.rglob('*'):
        if path.is_symlink(): fail('Bundle cannot contain symbolic links.')
        if path.is_file():
            rel=path.relative_to(bundle).as_posix()
            if rel.startswith('.') or '/.' in rel or path.suffix not in ['.json','.md']: fail('Only visible JSON and Markdown files are supported in connector bundles.')
            if len(files)>=100 or path.stat().st_size>512000: fail('Bundle exceeds file limits.')
            files[rel]=path.read_bytes()
    if sum(map(len,files.values()))>2000000: fail('Bundle exceeds 2 MB.')
    for required in ['automation.json','README.md','worker.md','tests/cases.json']:
        if required not in files: fail('Missing '+required)
    m=json.loads(files['automation.json'])
    if set(m)-{'schemaVersion','id','name','connector','repositories','intervalMinutes','action','conditions','source'}: fail('Unknown manifest fields.')
    if m.get('schemaVersion')!=1 or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}',m.get('id','')): fail('Expected schemaVersion 1 and a lowercase stable id.')
    if not isinstance(m.get('name'),str) or not 1<=len(m['name'])<=120: fail('Name required (max 120 characters).')
    if m.get('connector') not in CONNECTORS: fail('Unsupported connector. Use capabilities; arbitrary scripts are not executed.')
    if type(m.get('intervalMinutes')) is not int or not 5<=m['intervalMinutes']<=60: fail('intervalMinutes must be 5–60.')
    if m.get('action') not in ['notify','codex','claude']: fail('Invalid action.')
    if not isinstance(m.get('repositories'),list) or len(m['repositories'])>20 or any(not isinstance(r,str) or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',r) for r in m['repositories']): fail('repositories must contain owner/repo names (max 20).')
    c=m.get('conditions',{})
    if not isinstance(c,dict) or set(c)-{'titleContains','excludeDrafts'}: fail('Unsupported conditions.')
    if 'titleContains' in c and (not isinstance(c['titleContains'],str) or len(c['titleContains'])>200): fail('Invalid titleContains.')
    if 'excludeDrafts' in c and type(c['excludeDrafts']) is not bool: fail('Invalid excludeDrafts.')
    if not files['README.md'].strip() or not files['worker.md'].strip(): fail('README and worker instructions must not be empty.')
    if len(files['worker.md'])>16000: fail('worker.md exceeds 16 KB.')
    source=m.get('source',{})
    if not isinstance(source,dict) or set(source)-{'sessionID','provider','workID'} or any(not isinstance(v,str) or len(v)>200 for v in source.values()): fail('Invalid source metadata.')
    cases=json.loads(files['tests/cases.json'])
    if not isinstance(cases,list) or len(cases)<2: fail('Provide at least matching and empty fixtures.')
    empty=match=False
    for case in cases:
        actual=[x['id'] for x in select(case['items'],c)]
        if actual!=case['expectedIDs']: fail('Fixture failed: '+case.get('name','unnamed'))
        empty |= not actual; match |= bool(actual)
    if not empty or not match: fail('Fixtures must demonstrate a match and a no-match result.')
    h=hashlib.sha256()
    for name,data in sorted(files.items()): h.update(name.encode()+b'\0'+hashlib.sha256(data).digest())
    return m,files,h.hexdigest()
def select(items,conditions):
    result=[]; seen=set()
    for item in items:
        if not isinstance(item.get('id'),str) or not isinstance(item.get('title'),str): fail('Event must have string id/title.')
        if conditions.get('excludeDrafts') and item.get('isDraft'): continue
        if conditions.get('titleContains','').casefold() not in item['title'].casefold(): continue
        if item['id'] not in seen: result.append(item);seen.add(item['id'])
    return result
def gh(args):
    env=dict(os.environ,GH_HOST='github.com',GH_PROMPT_DISABLED='1',GH_PAGER='cat')
    p=subprocess.run(['gh']+args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35,env=env)
    if p.returncode: fail('GitHub request failed. Check gh auth status, connectivity and rate limits.')
    if len(p.stdout)>8000000: fail('Response exceeds limit.')
    return json.loads(p.stdout)
def preview(bundle):
    m,_,rev=inspect(bundle)
    user=gh(['api','--hostname','github.com','user'])
    prs=m['connector']=='github.review_requests'
    args=['search','prs' if prs else 'issues','--review-requested' if prs else '--assignee',user['login'],'--state','open','--limit','1000','--json','id,title,url,repository,number'+(',isDraft' if prs else '')]
    for repo in m['repositories']:args+=['--repo',repo]
    items=gh(args)
    if len(items)>=1000:fail('Result limit reached. Narrow repositories.')
    requests=[]
    for x in select(items,m.get('conditions',{})):
        repo=x['repository']['nameWithOwner']; expected=f'https://github.com/{repo}/{"pull" if prs else "issues"}/{x["number"]}'
        if x['url']!=expected:fail('Unexpected source URL.')
        requests.append(dict(id=str(x['id']),title=x['title'],url=x['url'],repository=repo,number=x['number']))
    return dict(account=f'github.com:{user["id"]}:{user["login"]}',requests=requests,revision=rev,complete=True,modelCalls=0)
def register(bundle):
    m,files,rev=inspect(bundle);ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (ROOT/'registry.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        index=ROOT/'registry.json'; entries=json.loads(index.read_text()) if index.exists() else []
        target=ROOT/m['id']/'revisions'/rev
        if not target.exists():
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            staging=pathlib.Path(tempfile.mkdtemp(dir=target.parent))
            try:
                for name,data in files.items():
                    dest=staging/name;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700);dest.write_bytes(data);dest.chmod(0o600)
                os.replace(staging,target)
            finally:
                if staging.exists():shutil.rmtree(staging)
        record=dict(id=m['id'],name=m['name'],revision=rev,path=str(target),source=m.get('source',{}))
        entries=[e for e in entries if e['id']!=m['id']]+[record];atomic(index,entries)
    return dict(**record,status='draft',enabled=False,message='Open Continued → Artifacts → Automations to preview and enable.')
def create(path,connector):
    p=pathlib.Path(path)
    if p.exists():fail('Destination already exists.')
    (p/'tests').mkdir(parents=True)
    manifest=dict(schemaVersion=1,id=p.name,name='My automation',connector=connector,repositories=[],intervalMinutes=5,action='notify',conditions={})
    atomic(p/'automation.json',manifest)
    (p/'README.md').write_text('# My automation\n\nChecks GitHub every five minutes. Notifies on new matching events. No model is used by the checker. Configure repositories before enabling.\n')
    (p/'worker.md').write_text('Inspect the event and prepare an evidence-based local summary. Follow project rules. Do not post, approve, merge or modify remote state.\n')
    atomic(p/'tests/cases.json',[dict(name='empty',items=[],expectedIDs=[]),dict(name='match',items=[dict(id='fixture-1',title='Example event')],expectedIDs=['fixture-1'])])
def main():
    a=argparse.ArgumentParser();a.add_argument('command',choices=['capabilities','create','validate','register','list','preview']);a.add_argument('bundle',nargs='?');a.add_argument('--connector',default=CONNECTORS[0],choices=CONNECTORS);o=a.parse_args()
    if o.command=='capabilities':return dump(dict(schemaVersion=1,connectors=CONNECTORS,conditions=['titleContains','excludeDrafts'],customCode=False,registration='draft-only'))
    if o.command=='list':return dump(json.loads((ROOT/'registry.json').read_text()) if (ROOT/'registry.json').exists() else [])
    if not o.bundle:fail('Bundle path required.')
    if o.command=='create':create(o.bundle,o.connector);return dump(dict(path=o.bundle,status='created'))
    if o.command=='validate':
        m,_,rev=inspect(o.bundle);return dump(dict(valid=True,id=m['id'],revision=rev))
    if o.command=='register':return dump(register(o.bundle))
    if o.command=='preview':return dump(preview(o.bundle))
if __name__=='__main__':
    try:main()
    except Exception as e:dump(dict(error=str(e)));sys.exit(1)
