from pathlib import Path
import json
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image,ImageOps,ImageDraw
base=Path('output/contractor-commerce-20261015')
proof=[]
for name in ('presupuesto-corto','presupuesto-largo'):
    source=base/(name+'.pdf')
    with pdfplumber.open(source) as document:
        text='\n'.join(page.extract_text() or '' for page in document.pages)
        assert 'Jefe / Supervisor' in text and 'Técnico' in text
        assert 'IVA 10%' in text and 'TOTAL:' in text
        assert all(len(page.images)>0 for page in document.pages[:1])
        assert 'OT-QA-001' in text
        if name.endswith('largo'):
            assert len(document.pages)>1 and 'Ítem 65' in text
        else:
            assert len(document.pages)==1
        outside=[(n+1,c['text']) for n,page in enumerate(document.pages) for c in page.chars if c['x0']<35 or c['x1']>560 or c['top']<15 or c['bottom']>834]
        assert not outside, outside[:3]
        proof.append({'archivo':source.name,'paginas':len(document.pages),'logo_embebido':bool(document.pages[0].images),'texto_fuera_de_margenes':len(outside)})
    pdf=pdfium.PdfDocument(source)
    selected=sorted(set([0,len(pdf)-1]))
    thumbs=[]
    for n in selected:
        image=pdf[n].render(scale=1.1).to_pil().convert('RGB')
        image.save(base/f'{name}-{n+1}.png')
        image.thumbnail((460,660))
        tile=Image.new('RGB',(480,700),'#eef1f6')
        tile.paste(image,((480-image.width)//2,25))
        ImageDraw.Draw(tile).text((12,680),f'{name} - {n+1}/{len(pdf)}',fill='#172238')
        thumbs.append(tile)
    sheet=Image.new('RGB',(480*len(thumbs),700),'white')
    for n,tile in enumerate(thumbs):sheet.paste(tile,(n*480,0))
    sheet.save(base/(name+'-revision.png'))
(base/'pdf-verificado.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(proof,ensure_ascii=False))
