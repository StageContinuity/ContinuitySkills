import importlib.util,json,pathlib,tempfile,unittest
P=pathlib.Path(__file__).resolve().parents[1]/'continued-automation/scripts/automation.py'
spec=importlib.util.spec_from_file_location('automation',P);a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class AutomationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name);a.ROOT=self.root/'registry';self.bundle=self.root/'my-check';a.create(self.bundle,'github.review_requests')
 def test_register_is_draft_and_revision_is_immutable(self):
  first=a.register(self.bundle);again=a.register(self.bundle)
  self.assertEqual(first['revision'],again['revision']);self.assertFalse(first['enabled'])
  (self.bundle/'worker.md').write_text('A revised worker instruction.')
  second=a.register(self.bundle);self.assertNotEqual(first['revision'],second['revision'])
  self.assertNotEqual((pathlib.Path(first['path'])/'worker.md').read_text(),(pathlib.Path(second['path'])/'worker.md').read_text())
  self.assertFalse((a.ROOT/'active.json').exists())
 def test_broken_fixture_and_symlink_rejected(self):
  (self.bundle/'tests/cases.json').write_text('[{"items":[],"expectedIDs":["bad"]},{"items":[],"expectedIDs":[]}]')
  with self.assertRaises(ValueError):a.inspect(self.bundle)
  (self.bundle/'escape.md').symlink_to('/etc/passwd')
  with self.assertRaises(ValueError):a.inspect(self.bundle)
 def test_preview_does_not_register_or_alter_state(self):
  original=a.gh
  a.gh=lambda args: {'id':1,'login':'fixture'} if args[0]=='api' else [{'id':'PR_1','title':'Fix','url':'https://github.com/a/b/pull/1','repository':{'nameWithOwner':'a/b'},'number':1}]
  self.addCleanup(setattr,a,'gh',original)
  value=a.preview(self.bundle);self.assertEqual(len(value['requests']),1);self.assertEqual(value['modelCalls'],0)
  self.assertFalse(a.ROOT.exists())
 def test_second_connector_and_filters(self):
  m=json.loads((self.bundle/'automation.json').read_text());m['connector']='github.assigned_issues';(self.bundle/'automation.json').write_text(json.dumps(m))
  a.inspect(self.bundle)
  self.assertEqual(a.select([{'id':'a','title':'Test'},{'id':'a','title':'Test'},{'id':'b','title':'Other'}],{'titleContains':'test'}),[{'id':'a','title':'Test'}])
 def test_arbitrary_code_and_unknown_capability_rejected(self):
  (self.bundle/'evil.py').write_text('raise RuntimeError()')
  with self.assertRaises(ValueError):a.inspect(self.bundle)
if __name__=='__main__':unittest.main()
