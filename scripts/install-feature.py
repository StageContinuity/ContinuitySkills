#!/usr/bin/env python3
"""Install one feature into Codex/Claude from this checkout; unrelated skills are untouched."""
import argparse,hashlib,json,os,pathlib,shutil,tempfile,uuid
SOURCE=pathlib.Path(__file__).resolve().parents[1]
def install(feature,agents,home,dry=False):
 catalog=json.loads((SOURCE/'features.json').read_text())['features']
 if feature not in catalog:raise ValueError('Unknown feature: '+feature)
 skills=catalog[feature]['skills'];home=pathlib.Path(home).resolve();cache=home/'.local/share/continuity-skills'
 digest=hashlib.sha256()
 for name in skills:
  for p in sorted((SOURCE/name).rglob('*')):
   if '__pycache__' in p.parts or p.suffix == '.pyc':continue
   if p.is_symlink():raise ValueError('Source skill contains a symlink')
   if p.is_file():digest.update(str(p.relative_to(SOURCE)).encode()+b'\0'+p.read_bytes())
 version=digest.hexdigest();destinations=[]
 for agent in agents:
  base=home/('.agents/skills' if agent=='codex' else '.claude/skills')
  for name in skills:
   dst=base/name;target=cache/version/name
   if os.path.lexists(dst):
    if not dst.is_symlink() or not dst.resolve().is_relative_to(cache):
     raise ValueError(f'{dst} is not owned by this installer. Existing skill preserved; resolve the conflict before installing.')
   destinations.append((dst,target))
 if dry:return dict(feature=feature,skills=skills,agents=agents,version=version,status='preview')
 cache.mkdir(parents=True,exist_ok=True)
 final=cache/version
 if not final.exists():
  staging=pathlib.Path(tempfile.mkdtemp(dir=cache))
  try:
   for name in skills:shutil.copytree(SOURCE/name,staging/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
   os.replace(staging,final)
  finally:
   if staging.exists():shutil.rmtree(staging)
 changed=[]
 try:
  for dst,target in destinations:
   dst.parent.mkdir(parents=True,exist_ok=True)
   previous=os.readlink(dst) if dst.is_symlink() else None
   tmp=dst.with_name(dst.name+'.continuity-install-'+uuid.uuid4().hex)
   try:tmp.symlink_to(target);os.replace(tmp,dst)
   finally:
    if os.path.lexists(tmp):tmp.unlink()
   changed.append((dst,previous))
 except Exception:
  for dst,previous in reversed(changed):
   dst.unlink()
   if previous is not None:dst.symlink_to(previous)
  raise
 return dict(feature=feature,skills=skills,agents=agents,version=version,status='installed',message='Start a new agent session to refresh skill discovery. No service login or automation was enabled.')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('feature');p.add_argument('--agents',nargs='+',choices=['codex','claude'],default=['codex','claude']);p.add_argument('--home',default=str(pathlib.Path.home()));p.add_argument('--dry-run',action='store_true');a=p.parse_args()
 try:print(json.dumps(install(a.feature,a.agents,a.home,a.dry_run)))
 except Exception as e:p.exit(1,str(e)+'\n')
