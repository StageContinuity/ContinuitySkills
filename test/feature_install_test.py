import importlib.util,pathlib,tempfile,unittest
P=pathlib.Path(__file__).resolve().parents[1]/'scripts/install-feature.py'
spec=importlib.util.spec_from_file_location('install',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_opt_in_and_same_version(self):
  with tempfile.TemporaryDirectory() as d:
   m.install('automation',['codex','claude'],d)
   a=pathlib.Path(d)/'.agents/skills/continued-automation';b=pathlib.Path(d)/'.claude/skills/continued-automation'
   self.assertEqual(a.resolve(),b.resolve());self.assertFalse((a.parent/'knowledge-base').exists())
   first=a.resolve();m.install('automation',['codex','claude'],d);self.assertEqual(first,a.resolve())
 def test_conflict_does_not_partially_install(self):
  with tempfile.TemporaryDirectory() as d:
   other=pathlib.Path(d)/'.claude/skills/knowledge-base';other.mkdir(parents=True);(other/'SKILL.md').write_text('owned by user')
   with self.assertRaises(ValueError):m.install('knowledge',['codex','claude'],d)
   self.assertFalse((pathlib.Path(d)/'.agents/skills/knowledge-base').exists());self.assertEqual((other/'SKILL.md').read_text(),'owned by user')
 def test_preview_does_not_install(self):
  with tempfile.TemporaryDirectory() as d:
   m.install('knowledge',['codex'],d,True);self.assertFalse((pathlib.Path(d)/'.agents').exists())
if __name__=='__main__':unittest.main()
