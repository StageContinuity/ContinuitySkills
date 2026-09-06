import importlib.util,tempfile,pathlib,hashlib,unittest,zipfile,json
spec=importlib.util.spec_from_file_location('builder',pathlib.Path(__file__).parents[1]/'scripts/build-plugins.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class Packages(unittest.TestCase):
 def test_reproducible_packages_match_catalog(self):
  with tempfile.TemporaryDirectory() as d:
   first=b.build(pathlib.Path(d)/'a','plugins-v0.1.0','fixture');second=b.build(pathlib.Path(d)/'b','plugins-v0.1.0','fixture');self.assertEqual(first,second)
   for item in first['plugins']:
    file=pathlib.Path(d)/'a'/item['url'].split('/')[-1];self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),item['sha256'])
    with zipfile.ZipFile(file) as z:
     manifest=json.loads(z.read('plugin.json'));self.assertEqual(manifest['id'],item['id'])
     for skill in manifest['skills']:self.assertIn(skill+'/SKILL.md',z.namelist())
 def test_rejects_invalid_tag(self):
  with self.assertRaises(ValueError):b.build('/tmp/unused','../escape','fixture')
