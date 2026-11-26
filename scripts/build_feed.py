"""Build a public RSS feed from retained npm metadata, never visitor watchlists."""
import json
from datetime import datetime,timezone
from email.utils import format_datetime
from xml.etree.ElementTree import Element,SubElement,tostring
from urllib.parse import quote

def feed(stage):
 data=json.loads((stage/'data/defaults.json').read_text())
 rss=Element('rss',version='2.0');channel=SubElement(rss,'channel')
 for key,value in [('title','Package Pulse · configured package releases'),('link','https://coolcode.ca/packagepulse/'),('description','Dated npm publication records for configured defaults. Includes prereleases. Weekly refresh; not a personal watchlist.')]:SubElement(channel,key).text=value
 rows=[]
 for record in data['packages']:
  p=record['pkg']
  for v in p['versions']:
   if v.get('publishedAt'):rows.append((v['publishedAt'],p['name'],v['version']))
 for date,name,version in sorted(rows,reverse=True)[:200]:
  item=SubElement(channel,'item');url='https://www.npmjs.com/package/'+quote(name,safe='@/')+'/v/'+quote(version,safe='')
  SubElement(item,'title').text=name+' '+version
  SubElement(item,'link').text=url
  SubElement(item,'guid',isPermaLink='false').text='npm:'+name+'@'+version
  SubElement(item,'pubDate').text=format_datetime(datetime.fromisoformat(date.replace('Z','+00:00')).astimezone(timezone.utc),usegmt=True)
  SubElement(item,'description').text='Published '+date+'. '+('Prerelease.' if '-' in version else 'Stable version.')+' Publication is not an upgrade recommendation.'
 (stage/'feed.xml').write_bytes(tostring(rss,encoding='utf-8',xml_declaration=True))
