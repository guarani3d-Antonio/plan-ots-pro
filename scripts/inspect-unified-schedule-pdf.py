from pathlib import Path
import json
import pdfplumber
import pypdfium2 as pdfium
base=Path('output/cronograma-unificado-20261014')
source=base/'pdf-largo-qa.pdf'
report=[]
with pdfplumber.open(source) as pdf:
 for i,page in enumerate(pdf.pages):
  words=page.extract_words()
  text=page.extract_text() or ''
  if 'Cronograma previsto' in text:assert 'Actividad' in text,'El título del Gantt quedó en una hoja separada'
  collisions=[]
  for index,a in enumerate(words):
   for b in words[index+1:]:
    if abs(a['top']-b['top'])<1 and min(a['x1'],b['x1'])-max(a['x0'],b['x0'])>1:collisions.append([a['text'],b['text']])
  report.append({'pagina':i+1,'ancho':page.width,'alto':page.height,'horizontal':page.width>page.height,'fechas':[w['text'] for w in words if '/' in w['text']],'colisiones':collisions})
 assert any(p['horizontal'] for p in report),'No hay hojas horizontales'
 assert not report[0]['horizontal'],'El cuerpo del informe perdió su orientación vertical'
 assert all(not p['colisiones'] for p in report),'Hay palabras superpuestas'
doc=pdfium.PdfDocument(source)
for i in range(len(doc)):
 page=doc[i];page.render(scale=1.3).to_pil().save(base/f'pdf-largo-pagina-{i+1}.png');page.close()
doc.close()
(base/'pdf-verificacion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
