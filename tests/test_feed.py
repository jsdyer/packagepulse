import json,sys,tempfile,unittest
from pathlib import Path
from xml.etree import ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_feed import feed
class Feed(unittest.TestCase):
 def test_original_dates_guids_and_xml_escaping(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'data').mkdir();(root/'data/defaults.json').write_text(json.dumps({'packages':[{'pkg':{'name':'@scope/new','versions':[{'version':'1.0.0','publishedAt':'2026-01-02T00:00:00Z'},{'version':'2.0.0-beta.1','publishedAt':'2026-02-01T00:00:00Z'},{'version':'9.0.0','publishedAt':None}]}}]}));feed(root)
   r=ET.parse(root/'feed.xml');items=r.findall('./channel/item');self.assertEqual(len(items),2);self.assertEqual(items[0].findtext('guid'),'npm:@scope/new@2.0.0-beta.1');self.assertIn('01 Feb 2026',items[0].findtext('pubDate'));self.assertIn('Prerelease',items[0].findtext('description'))
