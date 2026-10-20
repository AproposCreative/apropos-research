"""Package reviewed press PDFs, original logos and credited portrait locally."""
import json,pathlib,zipfile,hashlib
root=pathlib.Path(__file__).resolve().parents[2]
copy=json.loads((root/'docs/seo/press-kit-copy-2026-10-20.json').read_text())
out=root/'output/press-kit'
for locale,title in [('da','Apropos Magazine — Pressemateriale'),('en','Apropos Magazine — Press materials')]:
 c=copy[locale]
 parts=[title,'20.10.2026','',c['boilerplate']['shortLabel'],c['boilerplate']['short'],'',c['boilerplate']['longLabel'],c['boilerplate']['long'],'',c['editorialProfile']['heading'],c['editorialProfile']['introduction']]
 for area in c['editorialProfile']['areas']: parts+=['',area['title'],area['text'],area['url']]
 parts+=['',c['facts']['heading']]
 for row in c['facts']['rows']:
  label='Editor-in-chief' if row['label']=='Responsible editor' else row['label']
  parts.append(label+': '+row['value'])
 parts+=['',c['contact']['heading'],c['contact']['text'],c['contact']['email']]
 parts += ['', 'Foto: Christine Olsgaard, Azide' if locale == 'da' else 'Photo: Christine Olsgaard, Azide']
 (out/('apropos-presse-' + locale+'.txt')).write_text('\n'.join(parts)+'\n')
readme='''APROPOS MAGAZINE / PRESS KIT
20 October 2026

Dansk
Pakken indeholder pressekit på dansk og engelsk, tekster og fakta samt originale logoer i sort og hvid som SVG, PNG og PDF.
Brug sort logo på lys baggrund og hvidt logo på mørk baggrund. Bevar proportioner, farver og fri luft omkring logoet. Undgå at beskære eller ændre det.
Pressefoto af Frederik Emil Kragh: Foto: Christine Olsgaard, Azide. Bevar fotokreditten ved brug. Originalfilen ligger i portraits/.
Logoerne er leveret af Apropos til omtale af mediet. Fotografier fra eller billedrettigheder til de nævnte artikler følger ikke med pakken.
Kontakt: Liv@aproposmagazine.com
Hjemmeside: https://www.aproposmagazine.com

English
This package contains Danish and English press kits, descriptions and facts, and original black and white logos in SVG, PNG and PDF.
Use the black logo on light backgrounds and the white logo on dark backgrounds. Preserve proportions, colours and clear space. Do not crop or alter the logo.
Press photo of Frederik Emil Kragh: Photo: Christine Olsgaard, Azide. Retain the photo credit when using the portrait. The original file is in portraits/.
Apropos supplied the logos for coverage of the publication. Photographs and image rights for the featured articles are not included.
Contact: Liv@aproposmagazine.com
Website: https://www.aproposmagazine.com
'''
(out/'README.txt').write_text(readme)
files=sorted((out/'brand').glob('*'))+[out/'portraits/frederik-kragh.jpg',out/'portraits/CREDIT.txt']+[out/'apropos-presse-da.txt',out/'apropos-presse-en.txt',out/'README.txt',root/'output/pdf/apropos-pressekit-da.pdf',root/'output/pdf/apropos-press-kit-en.pdf']
(out/'portraits/CREDIT.txt').write_text('Frederik Emil Kragh\nFoto / Photo: Christine Olsgaard, Azide\n')
zip_path=out/'apropos-pressepakke.zip'
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
 for path in files:
  name=path.parent.name+'/'+path.name if path.parent.name in ('brand','portraits') else path.name
  archive.write(path,'apropos-press-kit/'+name)
with zipfile.ZipFile(zip_path) as archive:
 assert archive.testzip() is None
 print({'files':len(archive.namelist()),'entries':archive.namelist()})
upload=[]
for p in [root/'output/pdf/apropos-pressekit-da.pdf',root/'output/pdf/apropos-press-kit-en.pdf',zip_path]:
 data=p.read_bytes(); upload.append({'path':str(p.relative_to(root)),'name':p.name,'md5':hashlib.md5(data).hexdigest(),'bytes':len(data)})
print(json.dumps(upload,ensure_ascii=False))
(root/'tmp/pdfs/press-kit').mkdir(parents=True, exist_ok=True)
(root/'tmp/pdfs/press-kit/bundle-upload.json').write_text(json.dumps(upload))
