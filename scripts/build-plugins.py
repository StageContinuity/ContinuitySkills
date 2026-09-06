#!/usr/bin/env python3
"""Build deterministic plugin archives and a reviewable release catalog; never publishes."""
import argparse, hashlib, json, pathlib, re, subprocess, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def build(out,tag,revision):
 if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,100}',tag):raise ValueError('Invalid release tag')
 out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
 features=json.loads((ROOT/'features.json').read_text())['features'];result=[]
 for plugin in json.loads((ROOT/'plugins/catalog.json').read_text())['plugins']:
  feature=features.get(plugin.get('feature'),{'skills':[],'requires':[],'description':plugin.get('description','')});files={}
  for skill in feature['skills']:
   for file in sorted((ROOT/skill).rglob('*')):
    if '__pycache__' in file.parts or file.suffix=='.pyc':continue
    if file.is_symlink():raise ValueError('Symlink in skill')
    if file.is_file():files['skills/'+str(file.relative_to(ROOT))]=file.read_bytes()
  for viewer in plugin.get('viewers',[]):
   for file in sorted((ROOT/'plugins'/viewer).rglob('*')):
    if file.is_symlink():raise ValueError('Symlink in viewer')
    if file.is_file():files[str(file.relative_to(ROOT/'plugins'))]=file.read_bytes()
  for template in plugin['templates']:files[template['path']]=(ROOT/'plugins'/template['path']).read_bytes()
  manifest=dict(id=plugin['id'],name=plugin['name'],version=plugin['version'],publisher='Continued',skills=['skills/'+s for s in feature['skills']],viewers=plugin.get('viewers',[]),templates=plugin['templates'],mcpServers=[])
  files['plugin.json']=(json.dumps(manifest,indent=2)+'\n').encode()
  if len(files)>2000 or sum(map(len,files.values()))>20_000_000:raise ValueError('Package exceeds Continued limits')
  name=plugin['id']+'-'+plugin['version']+'.zip';target=out/name
  with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
   for path,data in sorted(files.items()):
    info=zipfile.ZipInfo(path,date_time=(2020,1,1,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,data)
  data=target.read_bytes();result.append(dict(id=plugin['id'],name=plugin['name'],version=plugin['version'],description=feature['description'],requires=feature['requires'],sourceRevision=revision,apiVersion=1,size=len(data),sha256=hashlib.sha256(data).hexdigest(),url=f'https://github.com/StageContinuity/ContinuitySkills/releases/download/{tag}/{name}'))
 catalog=dict(schemaVersion=1,sourceRevision=revision,plugins=result)
 (out/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
 return catalog
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--tag',required=True);p.add_argument('--allow-dirty',action='store_true');a=p.parse_args()
 dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip())
 if dirty and not a.allow_dirty:p.error('Use a clean checkout for release packages, or --allow-dirty for local previews')
 revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();build(a.output,a.tag,revision+('-dirty' if dirty else ''))
