"""Lossless edits of the retained Word template. Unchanged ZIP entries stay byte identical."""
import base64, copy, io, json, re, sys, zipfile, posixpath, subprocess
from pathlib import Path
from lxml import etree as E
from PIL import Image

NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'v':'urn:schemas-microsoft-com:vml', 'mc':'http://schemas.openxmlformats.org/markup-compatibility/2006',
      'wps':'http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'wpg':'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'}
def q(prefix, name): return '{'+NS[prefix]+'}'+name
def own_text(p): return p.xpath('./w:r/w:t | ./w:hyperlink/w:r/w:t | ./w:smartTag/w:r/w:t',namespaces=NS)
def group_for(part, p, body_index=0):
    if 'header' in part or 'footer' in part: return 'Cabeçalhos e rodapés'
    # Main story after the first section is the verso/redação section in the blank template.
    if p.xpath('ancestor::w:txbxContent',namespaces=NS):
        return 'Verso e redação' if body_index > 68 else 'Capa'
    return 'Verso e redação' if body_index > 68 else 'Capa'
def ancestor_anchor(el):
    xs=el.xpath('ancestor::wp:anchor | ancestor::wp:inline',namespaces=NS)
    return xs[-1] if xs else None
def geometry(anchor):
    if anchor is None:return {}
    out={}
    for axis,key in [('H','x'),('V','y')]:
        n=anchor.find('wp:position'+axis+'/wp:posOffset',NS)
        if n is not None: out[key]=round(int(n.text)/360000,2)
    ex=anchor.find('wp:extent',NS)
    if ex is not None:
        out['width']=round(int(ex.get('cx'))/360000,2);out['height']=round(int(ex.get('cy'))/360000,2)
    return out

def grouped_text_frame(p):
    shapes=p.xpath('ancestor::wps:wsp',namespaces=NS)
    if not shapes:return None
    shape=shapes[-1];groups=shape.xpath('ancestor::wpg:wgp',namespaces=NS)
    transform=shape.find('wps:spPr/a:xfrm',NS)
    if not groups or transform is None:return None
    sx=sy=1.0
    for group in groups:
        g=group.find('wpg:grpSpPr/a:xfrm',NS)
        if g is None:return None
        ex=g.find('a:ext',NS);ch=g.find('a:chExt',NS)
        if ex is None or ch is None:return None
        sx*=int(ex.get('cx'))/int(ch.get('cx'));sy*=int(ex.get('cy'))/int(ch.get('cy'))
    offset=groups[-1].find('wpg:grpSpPr/a:xfrm/a:chOff',NS)
    return transform,sx,sy,int(offset.get('x','0')) if offset is not None else 0,int(offset.get('y','0')) if offset is not None else 0

def text_geometry(p):
    frame=grouped_text_frame(p)
    if not frame:return geometry(ancestor_anchor(p))
    transform,sx,sy,x0,y0=frame;off=transform.find('a:off',NS);ex=transform.find('a:ext',NS)
    return {'x':round((int(off.get('x'))-x0)*sx/360000,2),'y':round((int(off.get('y'))-y0)*sy/360000,2),
            'width':round(int(ex.get('cx'))*sx/360000,2),'height':round(int(ex.get('cy'))*sy/360000,2)}

def set_text_geometry(p,values):
    frame=grouped_text_frame(p)
    if not frame:return set_geometry(ancestor_anchor(p),values)
    transform,sx,sy,x0,y0=frame;off=transform.find('a:off',NS);ex=transform.find('a:ext',NS)
    for key,attr,scale,offset in [('x','x',sx,x0),('y','y',sy,y0)]:
        if key in values:off.set(attr,str(round(float(values[key])*360000/scale+offset)))
    for key,attr,scale in [('width','cx',sx),('height','cy',sy)]:
        if key in values:
            value=float(values[key]);assert .1<=value<=40,'Dimensão inválida';ex.set(attr,str(round(value*360000/scale)))
def load(template,stabilize=False):
    z=zipfile.ZipFile(template); files={n:z.read(n) for n in z.namelist()}
    roots={n:E.fromstring(b) for n,b in files.items() if re.fullmatch(r'word/(document|header\d+|footer\d+)\.xml',n)}
    return files,roots
def layers(template):
    files,roots=load(template,True);legacy_roots=load(template,False)[1];result=[]
    for part,root in roots.items():
        seen={}; allp=root.findall('.//w:p',NS)
        for i,p in enumerate(allp):
            text=''.join(n.text or '' for n in own_text(p))
            if not text.strip():continue
            key=(part,text)
            if key in seen:seen[key]['targets'].append(i);continue
            anchor=ancestor_anchor(p); label=text[:75]
            if anchor is not None:
                dp=anchor.find('wp:docPr',NS)
                if dp is not None:label=dp.get('name',label)+' — '+text[:35]
            rp=p.find('./w:r/w:rPr',NS); font={}
            if rp is not None:
                n=rp.find('w:sz',NS)
                if n is not None:font['size']=int(n.get(q('w','val')))/2
                n=rp.find('w:rFonts',NS)
                if n is not None:font['font']=n.get(q('w','ascii'),'Arial')
                for tag,prop in [('b','bold'),('i','italic')]:
                    n=rp.find('w:'+tag,NS)
                    font[prop]=n is not None and n.get(q('w','val'),'1') not in ('0','false','off')
                n=rp.find('w:color',NS)
                if n is not None and re.fullmatch('[A-Fa-f0-9]{6}',n.get(q('w','val'),'')):font['color']='#'+n.get(q('w','val'))
            jc=p.find('./w:pPr/w:jc',NS)
            if jc is not None:font['align']=jc.get(q('w','val'),'left')
            item={'id':part+':text:'+str(i),'kind':'text','part':part,'targets':[i],'text':text,'label':label,'group':group_for(part,p,i),'geometry':text_geometry(p),'geometryScope':'group' if grouped_text_frame(p) else 'page',**font}
            item['legacyGeometry']=text_geometry(legacy_roots[part].findall('.//w:p',NS)[i])
            result.append(item);seen[key]=item
        relpart=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
        rels={n.get('Id'):posixpath.normpath(posixpath.join('word',n.get('Target'))) for n in E.fromstring(files[relpart])} if relpart in files else {}
        for j,anchor in enumerate(root.xpath('.//wp:anchor | .//wp:inline',namespaces=NS)):
            if anchor.xpath('ancestor::mc:Fallback',namespaces=NS):continue
            dp=anchor.find('wp:docPr',NS);label=dp.get('name','Arte') if dp is not None else 'Arte'
            blips=anchor.findall('.//a:blip',NS)
            media=list(dict.fromkeys(rels.get(b.get(q('r','embed'))) for b in blips));media=[m for m in media if m in files]
            thumb=''
            if media:
                try:
                    im=Image.open(io.BytesIO(files[media[0]])).convert('RGBA');im.thumbnail((270,170));buff=io.BytesIO();im.save(buff,format='PNG');thumb='data:image/png;base64,'+base64.b64encode(buff.getvalue()).decode()
                except Exception:pass
            parentp=anchor.xpath('ancestor::w:p',namespaces=NS)
            p=parentp[0] if parentp else None
            idx=allp.index(p) if p is not None else 0
            result.append({'id':part+':art:'+str(j),'kind':'art','part':part,'anchor':j,'label':label,'group':group_for(part,p,idx),'media':media,'thumbnail':thumb,'geometry':geometry(anchor),'legacyGeometry':geometry(legacy_roots[part].xpath('.//wp:anchor | .//wp:inline',namespaces=NS)[j])})
    # Present one editable side per document; repeat it in both odd/even headers.
    sides={'left':[],'right':[]}
    for item in list(result):
        if item['kind']=='art' and 'header' in item['part'] and item['label'].startswith('Agrupar') and item['media']:
            side='left' if item['geometry'].get('x',0)<0 else 'right'
            sides[side].append(item);result.remove(item)
    for side,items in sides.items():
        if items:
            base=copy.deepcopy(items[0]);base.update(id='side-seal:'+side,group='Selos laterais',label='Selo lateral '+('esquerdo' if side=='left' else 'direito'),placements=items,side=side)
            result.append(base)
    return result
def set_text(p,text,preserve_runs=False):
    nodes=own_text(p)
    if not nodes:return
    if preserve_runs:
        cursor=0
        for i,n in enumerate(nodes):
            length=len(n.text or '');n.text=text[cursor:cursor+length] if i<len(nodes)-1 else text[cursor:];cursor+=length
    else:
        first=nodes[0];parent=first.getparent()
        for br in list(parent.findall('w:br',NS)):parent.remove(br)
        lines=text.split('\n');first.text=lines[0]
        cursor=parent.index(first)+1
        for line in lines[1:]:
            br=E.Element(q('w','br'));parent.insert(cursor,br);cursor+=1
            t=E.Element(q('w','t'));t.text=line;parent.insert(cursor,t);cursor+=1
        for n in nodes[1:]:n.text=''
    for n in nodes:n.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
def set_geometry(anchor,values):
    if anchor is None:return
    for key,axis in [('x','H'),('y','V')]:
        if key not in values:continue
        n=anchor.find('wp:position'+axis+'/wp:posOffset',NS)
        if n is not None:n.text=str(round(float(values[key])*360000))
    ext=anchor.find('wp:extent',NS)
    if ext is not None:
        for key,attr in [('width','cx'),('height','cy')]:
            if key in values:
                value=float(values[key]);assert 0.1<=value<=40,'Dimensão inválida'
                old=int(ext.get(attr));new=round(value*360000);ext.set(attr,str(new))
                # Preserve internal drawing scales and text box geometry with its bounding box.
                for n in anchor.findall('.//a:xfrm/a:ext',NS):
                    current=int(n.get(attr,'0'))
                    if current==old:n.set(attr,str(new))
def apply(template,options,out):
    files,roots=load(template,True); originals=layers(template); index={l['id']:l for l in originals}
    edits=copy.deepcopy(options.get('edits',[]))
    if 'coverTitle' in options:
        title=str(options['coverTitle']).strip()
        assert title,'Preencha o título da capa / turma'
        assert len(title)<=120,'Título da capa muito longo (máximo 120 caracteres)'
        edit=next((e for e in edits if e['id']=='word/document.xml:text:34'),None)
        if edit is None:
            edit={'id':'word/document.xml:text:34'};edits.append(edit)
        edit['text']=title
    custom_media=set()
    for edit in edits:
        edit=copy.deepcopy(edit)
        assert edit.get('id') in index,'Camada inválida'
        layer=index[edit['id']];root=roots[layer['part']]
        if options.get('layoutVersion',1)<2 and edit.get('geometry'):
            if edit['id']=='word/document.xml:text:1' and edit['geometry'].get('y')==14.2:del edit['geometry']['y']
            for key in ['x','y']:
                if key in edit['geometry'] and key in layer['geometry'] and key in layer.get('legacyGeometry',{}):
                    edit['geometry'][key]+=layer['geometry'][key]-layer['legacyGeometry'][key]
        if layer['kind']=='text':
            for pos in layer['targets']:
                p=root.findall('.//w:p',NS)[pos]
                if 'text' in edit:set_text(p,str(edit['text']))
                for r in p.findall('./w:r',NS):
                    rp=r.find('w:rPr',NS)
                    if rp is None:rp=E.Element(q('w','rPr'));r.insert(0,rp)
                    for key,tag in [('font','rFonts'),('size','sz'),('color','color'),('bold','b'),('italic','i')]:
                        if key not in edit:continue
                        n=rp.find('w:'+tag,NS)
                        if n is None:n=E.SubElement(rp,q('w',tag))
                        value=edit[key]
                        if key=='font':
                            for a in ('asciiTheme','hAnsiTheme','csTheme','eastAsiaTheme'):
                                if q('w',a) in n.attrib:del n.attrib[q('w',a)]
                            for a in ('ascii','hAnsi','cs'):n.set(q('w',a),str(value))
                        elif key=='size':
                            assert 5<=float(value)<=160,'Fonte inválida';n.set(q('w','val'),str(round(float(value)*2)))
                        elif key=='color':
                            for a in ('themeColor','themeTint','themeShade'):
                                if q('w',a) in n.attrib:del n.attrib[q('w',a)]
                            value=str(value).lstrip('#');assert re.fullmatch('[A-Fa-f0-9]{6}',value);n.set(q('w','val'),value)
                        else:n.set(q('w','val'),'1' if value else '0')
                if 'align' in edit:
                    assert edit['align'] in ('left','center','right','both')
                    pp=p.find('w:pPr',NS)
                    if pp is None:pp=E.Element(q('w','pPr'));p.insert(0,pp)
                    jc=pp.find('w:jc',NS)
                    if jc is None:jc=E.SubElement(pp,q('w','jc'))
                    jc.set(q('w','val'),edit['align'])
                set_text_geometry(p,edit.get('geometry',{}))
        elif layer.get('placements'):
            for placement in layer['placements']:
                anchor=roots[placement['part']].xpath('.//wp:anchor | .//wp:inline',namespaces=NS)[placement['anchor']]
                set_geometry(anchor,edit.get('geometry',{}))
            if edit.get('image'):
                match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)',edit['image']);assert match,'Imagem inválida'
                raw=base64.b64decode(match[2],validate=True);assert len(raw)<=12*1024*1024
                image=Image.open(io.BytesIO(raw));image.load();dest=io.BytesIO();image.convert('RGBA').save(dest,'PNG')
                # Separate each side from the shared header/footer media.
                media='word/media/selo-'+layer['side']+'.png';files[media]=dest.getvalue();custom_media.add(media)
                for placement in layer['placements']:
                    root=roots[placement['part']];anchor=root.xpath('.//wp:anchor | .//wp:inline',namespaces=NS)[placement['anchor']]
                    relpart=posixpath.join(posixpath.dirname(placement['part']),'_rels',posixpath.basename(placement['part'])+'.rels')
                    rels=E.fromstring(files[relpart]);rid='gssfSelo'+layer['side'];rel=E.SubElement(rels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')
                    rel.set('Id',rid);rel.set('Type',NS['r']+'/image');rel.set('Target','media/selo-'+layer['side']+'.png');files[relpart]=E.tostring(rels,encoding='UTF-8',xml_declaration=True)
                    for blip in anchor.findall('.//a:blip',NS):blip.set(q('r','embed'),rid)
                    alternate=anchor.xpath('ancestor::mc:AlternateContent',namespaces=NS)
                    if alternate:
                        for img in alternate[-1].findall('.//v:imagedata',NS):img.set(q('r','id'),rid)
        else:
            anchor=root.xpath('.//wp:anchor | .//wp:inline',namespaces=NS)[layer['anchor']]
            set_geometry(anchor,edit.get('geometry',{}))
            if edit.get('image'):
                match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)',edit['image']);assert match,'Imagem inválida'
                raw=base64.b64decode(match[2],validate=True);assert len(raw)<=12*1024*1024
                image=Image.open(io.BytesIO(raw));image.load();buff=io.BytesIO();image.convert('RGBA').save(buff,'PNG')
                # Reuse original media entry and content type, encoding accordingly.
                assert layer['media'],'Esta forma não tem imagem. Escolha uma camada de arte com miniatura.'
                targets=layer['media']
                if edit.get('mediaTarget'):
                    assert edit['mediaTarget'] in targets,'Imagem do grupo inválida';targets=[edit['mediaTarget']]
                for target in targets:
                    dest=io.BytesIO();fmt='JPEG' if target.lower().endswith(('.jpg','.jpeg')) else 'PNG'
                    image.convert('RGB' if fmt=='JPEG' else 'RGBA').save(dest,fmt);files[target]=dest.getvalue();custom_media.add(target)
    year=int(options.get('year',2026));assert 2000<=year<=2099,'Ano inválido'
    config=json.loads((Path(__file__).parent/'config.json').read_text(encoding='utf-8-sig'))
    arts=Path(out).parent/'year-art';arts.mkdir(exist_ok=True)
    year_media=[]
    for name in files:
        if re.fullmatch(r'word/media/image(?:5|6|10|11|12|13|14|16)\.png',name) and name not in custom_media:
            (arts/Path(name).name).write_bytes(files[name])
            year_media.append(name)
    proc=subprocess.run([config['node'],str(Path(__file__).parent/'year-art.cjs'),str(year),str(arts)],capture_output=True,timeout=60)
    if proc.returncode:raise ValueError(proc.stderr.decode('utf-8',errors='replace'))
    for name in year_media:files[name]=(arts/Path(name).name).read_bytes()
    for root in roots.values():
        for p in root.findall('.//w:p',NS):
            # Resolve placeholders without flattening edited multiline paragraphs.
            for n in own_text(p):
                n.text=(n.text or '').replace('{{ano}}',str(year)).replace('{{ANO}}',str(year))
            text=''.join(n.text or '' for n in own_text(p));new=re.sub(r'(?i)(SIMULADO\s*[-–—]?\s*)(?:20\d{2}|202[xX])',lambda m:m[1]+str(year),text)
            if new!=text:set_text(p,new,preserve_runs=len(new)==len(text))
        # Global page numbers avoid p1s2 ambiguity when printing one page.
        for n in root.findall('.//w:pgNumType',NS):
            if q('w','start') in n.attrib:del n.attrib[q('w','start')]
    for part,root in roots.items():files[part]=E.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True)
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as dest:
        for name,data in files.items():dest.writestr(name,data)
    return {'layers':len(originals),'year':year,'edits':len(options.get('edits',[]))}
def localize_html(raw,folder):
    if len(raw)>64*1024*1024:raise ValueError('Documento grande demais')
    raw=re.sub(r'<(script|iframe|object)\b[^>]*>.*?</\1\s*>','',raw,flags=re.I|re.S)
    raw=re.sub(r'<(?:embed|link)\b[^>]*>','',raw,flags=re.I)
    count=0
    def image(m):
        nonlocal count
        tag=m[0];src=re.search(r'\bsrc\s*=\s*([\"\x27])(.*?)\1',tag,re.I|re.S)
        if not src:raise ValueError('Imagem sem origem')
        match=re.fullmatch(r'data:image/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)',src[2],re.I)
        if not match:raise ValueError('Imagem não embutida. Recarregue as questões para conferir todas as imagens.')
        rawbytes=base64.b64decode(match[2]);assert len(rawbytes)<=12*1024*1024,'Imagem muito grande'
        im=Image.open(io.BytesIO(rawbytes));im.load();path=Path(folder)/('image-'+str(count)+'.png');im.save(path,'PNG');count+=1
        return tag[:src.start(2)]+str(path).replace('\\','/')+tag[src.end(2):]
    raw=re.sub(r'<img\b[^>]*>',image,raw,flags=re.I)
    return raw,count
if __name__=='__main__':
    mode,template,request,output=sys.argv[1:5]
    data=json.loads(Path(request).read_text(encoding='utf-8-sig'))
    if mode=='model':Path(output).write_text(json.dumps({'ok':True,'layers':layers(template)},ensure_ascii=False),encoding='utf-8')
    elif mode=='prepare':
        apply(template,data.get('options',{}),output)
        html,count=localize_html(data['html'],Path(output).parent)
        Path(output).with_suffix('.doc').write_text('\ufeff'+html,encoding='utf-8')
        Path(output).with_suffix('.source.json').write_text(json.dumps({'images':count}),encoding='utf-8')
