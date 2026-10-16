from pathlib import Path
import json, unicodedata, pdfplumber, pypdfium2 as pdfium
root=Path('output/contractor-commerce-20261015');out=Path('output/branding-documents-20261016');result=[]
for name in ['presupuesto-corto','presupuesto-largo','presupuesto-tres-firmas','presupuesto-cuatro-firmas','presupuesto-unicode','presupuesto-item-extenso','presupuesto-firmado']:
 p=root/(name+'.pdf')
 doc=pdfium.PdfDocument(p)
 for n in sorted({0,len(doc)-1}):doc[n].render(scale=1.35).to_pil().save(out/f'{name}-{n+1}.png')
 with pdfplumber.open(p) as pdf:
  texts=[page.extract_text() or '' for page in pdf.pages];full=unicodedata.normalize('NFC','\n'.join(texts))
  assert 'Jefe / Supervisor' in full and 'Técnico' in full
  assert 'RUC de ejemplo' in full and 'qa@example.com' in full
  if name=='presupuesto-tres-firmas':assert len(pdf.pages)==1,(name,len(pdf.pages))
  if name=='presupuesto-unicode':assert 'ỹ' in full and 'Ñandutí' in full,full
  if name=='presupuesto-item-extenso':assert 'Línea 160' in full and 'Continuación del ítem 1' in full
  if name=='presupuesto-largo':assert 'Ítem 65' in full
  if name=='presupuesto-firmado':assert len(pdf.pages[0].images)==4 and 'Firmas registradas' in full
  for n,page in enumerate(pdf.pages):
   assert f'Página {n+1} de {len(pdf.pages)}' in texts[n]
   outside=[c for c in page.chars if c['x0']<39 or c['x1']>557 or c['top']<25 or c['bottom']>832]
   assert not outside,(name,n,[(c['text'],c['x0'],c['top']) for c in outside[:6]])
   assert page.images,(name,'logo missing on page',n)
  # Every signer remains on the same page, including its label and status.
  signer_pages=[n for n,text in enumerate(texts) if 'Jefe / Supervisor' in text or '\nTécnico' in text or 'Firma pendiente' in text or 'Registrada:' in text]
  assert len(set(signer_pages))==1,(name,signer_pages)
  result.append({'archivo':name,'paginas':len(pdf.pages),'sin_recortes':True,'firmas_agrupadas':True})
 doc=pdfium.PdfDocument(p)
 for n in sorted({0,len(doc)-1}):doc[n].render(scale=1.35).to_pil().save(out/f'{name}-{n+1}.png')
(out/'revision-pdf.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False))
