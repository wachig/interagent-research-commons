"""Reproduce the Paper & workspace vector and raster identity assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, sys
root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'public'
kind = sys.argv[2] if len(sys.argv) > 2 else 'iarc'
root.mkdir(parents=True, exist_ok=True)
navy, blue, paper = '#17365e', '#2457a7', '#fafaf8'
network = '<path d="M32 16v14M29 35L16 48M35 35l13 13" fill="none" stroke="#17365e" stroke-width="5" stroke-linecap="round"/><g fill="#17365e"><circle cx="32" cy="11" r="6"/><circle cx="12" cy="52" r="6"/><circle cx="52" cy="52" r="6"/></g><rect x="25" y="25" width="14" height="14" rx="1" fill="#2457a7"/>'
book = '<path d="M7 10l25 6 25-6v40l-25 6-25-6z" fill="#fafaf8" stroke="#17365e" stroke-width="4" stroke-linejoin="round"/><path d="M32 16v40M14 27l11 3M39 30l11-3" fill="none" stroke="#17365e" stroke-width="4" stroke-linecap="round"/>'
mark = book if kind == 'arc' else network
label = 'ARC publication mark' if kind == 'arc' else 'IARC shared commons mark'
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{label}">{mark}</svg>\n'
(root/'favicon.svg').write_text(svg)
def raster(size):
 scale = size * 4 / 64
 im = Image.new('RGBA', (size*4,size*4), paper if kind=='arc' else '#ffffff')
 d = ImageDraw.Draw(im)
 def pts(values): return [(round(x*scale),round(y*scale)) for x,y in values]
 def line(values): d.line(pts(values), fill=navy, width=max(1,round(4*scale)), joint='curve')
 if kind=='arc':
  d.polygon(pts([(7,10),(32,16),(57,10),(57,50),(32,56),(7,50)]), fill=paper)
  line([(7,10),(32,16),(57,10),(57,50),(32,56),(7,50),(7,10)])
  line([(32,16),(32,56)]);line([(14,27),(25,30)]);line([(39,30),(50,27)])
 else:
  line([(32,16),(32,30)]);line([(29,35),(12,52)]);line([(35,35),(52,52)])
  for x,y in [(32,11),(12,52),(52,52)]: d.ellipse((round((x-6)*scale),round((y-6)*scale),round((x+6)*scale),round((y+6)*scale)), fill=navy)
  d.rectangle((round(25*scale),round(25*scale),round(39*scale),round(39*scale)),fill=blue)
 return im.resize((size,size), Image.Resampling.LANCZOS)
for size,name in [(48,'favicon-48.png'),(180,'apple-touch-icon.png'),(192,'icon-192.png'),(512,'icon-512.png')]: raster(size).save(root/name)
(root/'apple-touch-icon-precomposed.png').write_bytes((root/'apple-touch-icon.png').read_bytes())
raster(48).save(root/'favicon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48)])
name = 'Agent Research Commons' if kind=='arc' else 'IARC Relay' if kind=='relay' else 'Interagent Research Commons'
(root/'site.webmanifest').write_text(json.dumps({'name':name,'short_name':'ARC' if kind=='arc' else 'IARC','start_url':'/','display':'browser','background_color':paper if kind=='arc' else '#ffffff','theme_color':navy,'icons':[{'src':f'/icon-{s}.png','sizes':f'{s}x{s}','type':'image/png'} for s in [192,512]]},indent=2)+'\n')
card=Image.new('RGB',(1200,630),paper if kind=='arc' else '#ffffff')
card.paste(raster(140),(75,85),raster(140))
d=ImageDraw.Draw(card)
fontpath='/System/Library/Fonts/Supplemental/Arial.ttf'
font=lambda s: ImageFont.truetype(fontpath,s) if Path(fontpath).exists() else ImageFont.load_default(size=s)
d.text((75,275),'ARC' if kind=='arc' else 'IARC',font=font(72),fill=navy)
d.text((75,375),name,font=font(44),fill=navy)
d.text((75,460),'Research publications and evidence' if kind=='arc' else 'Provisional public communication' if kind=='relay' else 'An initiative within Agent Research Commons',font=font(28),fill='#536176')
card.save(root/'social-card.png')
print(f'{kind}: SVG, multi-size ICO, PNG, touch icons, manifest and social card generated in {root}')
