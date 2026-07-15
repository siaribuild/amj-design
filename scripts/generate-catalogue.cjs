const fs = require('fs');
const path = require('path');

const base = process.argv[2]; // unpacked xlsx dir
const outPath = process.argv[3];
const xlDir = path.join(base, 'xl');

function decode(s){return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}

// shared strings
let shared = [];
const ss = fs.readFileSync(path.join(xlDir,'sharedStrings.xml'),'utf8');
for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const ts=[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
  shared.push(ts.map(t=>decode(t[1])).join(''));
}
const wb=fs.readFileSync(path.join(xlDir,'workbook.xml'),'utf8');
const rels=fs.readFileSync(path.join(xlDir,'_rels','workbook.xml.rels'),'utf8');
const relMap={};for(const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))relMap[m[1]]=m[2];
const sheetDefs=[...wb.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m=>({name:m[1],target:relMap[m[2]]}));
function colToIdx(c){let n=0;for(const ch of c)n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function parseSheet(target){
  const p=path.join(xlDir,target.replace(/^\//,'').replace(/^xl\//,''));
  const xml=fs.readFileSync(p,'utf8');const rows=[];
  for(const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)){
    const arr=[];
    for(const cm of rm[2].matchAll(/<c[^>]*r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)){
      const ci=colToIdx(cm[1]);const attrs=cm[2];const inner=cm[3];
      const t=(attrs.match(/t="([^"]+)"/)||[])[1]||'n';let val='';
      const v=inner.match(/<v>([\s\S]*?)<\/v>/);
      if(t==='s'){if(v)val=shared[parseInt(v[1])];}
      else if(t==='inlineStr'){const im=inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);if(im)val=decode(im[1]);}
      else{if(v)val=decode(v[1]);}
      arr[ci]=val;
    }
    rows.push(arr);
  }
  return rows;
}
const S={};for(const s of sheetDefs)S[s.name]=parseSheet(s.target);

// ---- helpers ----
function slugify(str){
  return String(str).toLowerCase()
    .replace(/&/g,' and ')
    .replace(/["'()]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'');
}
function esc(str){return String(str==null?'':str).replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${');}
function paragraphs(desc){
  if(!desc) return [];
  return String(desc).split(/\n\s*\n/).map(p=>p.replace(/\s*\n\s*/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}

// ---- categories ----
const catRows=S['Categories'].slice(1).filter(r=>r&&r[0]);
const categories=catRows.map(r=>({
  id:r[0], slug:slugify(r[1]), name:r[1], shortDescription:r[2]||'', description:r[3]||''
}));
const catById={};categories.forEach(c=>catById[c.id]=c);

// ---- families (with corrected display names for obvious export typos) ----
const NAME_FIX={
  'Casament Door':'Casement Door',
  'Bi-Fold Dooor':'Bi-Fold Door',
  'Lif-Sliding Door':'Lift-Slide Door',
  'Slim Frame Sliding Door':'Slim-Frame Sliding Door',
  'Glass Louver':'Glass Louvre',
  'Tilt&Turn Window':'Tilt & Turn Window',
};
const famRows=S['Families'].slice(1).filter(r=>r&&r[0]);
const families=famRows.map(r=>{
  const rawName=r[2];
  const name=NAME_FIX[rawName]||rawName;
  const cat=catById[r[1]];
  return { id:r[0], slug:slugify(name), categorySlug:cat?cat.slug:'', categoryId:r[1], name, shortDescription:r[3]||'', description:r[4]||'' };
});
const famById={};families.forEach(f=>famById[f.id]=f);

// ---- option types & options ----
const otRows=S['Option Types'].slice(1).filter(r=>r&&r[0]);
const optionTypes={};otRows.forEach(r=>optionTypes[r[0]]={id:r[0],name:r[1],slug:slugify(r[1])});
const optRows=S['Options'].slice(1).filter(r=>r&&r[0]);
const options={};optRows.forEach(r=>options[r[0]]={id:r[0],typeId:r[1],name:r[2]});

// ---- mapping matrix: rows = option id, cols = product id ----
const mapRows=S['Mapping'];
const header=mapRows[0]; // header[1..] = product ids
const prodColIndex={}; // productId -> column index in matrix row
for(let c=1;c<header.length;c++){ if(header[c]) prodColIndex[String(header[c]).trim()]=c; }
const mapByOption={}; // optionId -> {productId: status}
for(let i=1;i<mapRows.length;i++){
  const row=mapRows[i];if(!row||!row[0])continue;
  const optId=String(row[0]).trim();
  mapByOption[optId]={};
  for(const [pid,ci] of Object.entries(prodColIndex)){
    const raw=(row[ci]||'').toString().trim();
    if(!raw) continue;
    let status;
    if(raw.toUpperCase()==='S') status='standard';
    else if(raw.toUpperCase()==='O') status='optional';
    else status='optional'; // numeric codes (105/106) -> available/optional
    mapByOption[optId][pid]=status;
  }
}

// ---- images pool (placeholder Unsplash, grouped by category) ----
const WIN_IMG=[
  'https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format',
];
const DOOR_IMG=[
  'https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format',
];

function shortGlass(glass){
  if(!glass) return '';
  const l=glass.toLowerCase();
  const lowE=/low-?e/.test(l);
  const igu=/\+\s*\d+\s*(a|ar|argon)/i.test(glass)||/double/i.test(l)||/igu/i.test(l);
  if(lowE) return igu?'Low-E double glazed':'Low-E glazed';
  if(igu) return 'Double glazed';
  if(/temper/i.test(l)) return 'Single tempered';
  return glass;
}

// ---- products ----
const prodRows=S['Products'].slice(1).filter(r=>r&&r[0]);
// track family sequence index within category for image variety
const famSeqInCat={};
const catFamSeen={};
families.forEach(f=>{
  catFamSeen[f.categoryId]=catFamSeen[f.categoryId]||[];
  if(!catFamSeen[f.categoryId].includes(f.id)) catFamSeen[f.categoryId].push(f.id);
});
function famImgIndex(f){ const list=catFamSeen[f.categoryId]||[]; return Math.max(0,list.indexOf(f.id)); }

const products=prodRows.map((r)=>{
  const fam=famById[r[1]];
  const cat=fam?catById[fam.categoryId]:null;
  const name=r[2];
  const id=String(r[0]).trim();
  const pool=(cat&&cat.slug==='doors')?DOOR_IMG:WIN_IMG;
  const fi=fam?famImgIndex(fam):0;
  const hero=pool[fi%pool.length];
  const gallery=[pool[fi%pool.length],pool[(fi+1)%pool.length],pool[(fi+2)%pool.length]];
  const glass=r[5]||'';
  const minW=r[7],minH=r[8],maxW=r[9],maxH=r[10];
  const profile=r[11]||'';
  const air=r[12]||'',water=r[13]||'',wind=r[14]||'',notes=r[15]||'';
  // key specs (compact, for chips + hero)
  const keySpecs=[];
  if(profile) keySpecs.push({label:'Frame profile',value:profile});
  const sg=shortGlass(glass); if(sg) keySpecs.push({label:'Glazing',value:sg});
  if(maxW&&maxH) keySpecs.push({label:'Max size',value:`${maxW} × ${maxH} mm`});
  if(wind) keySpecs.push({label:'Wind rating',value:wind});
  // full spec table rows
  const specs=[];
  if(fam) specs.push({label:'Family',value:fam.name});
  if(cat) specs.push({label:'Category',value:cat.name});
  if(glass) specs.push({label:'Standard glass',value:glass});
  if(r[6]) specs.push({label:'Hardware',value:r[6]});
  if(profile) specs.push({label:'Profile thickness',value:profile});
  if(minW&&minH) specs.push({label:'Minimum size',value:`${minW} × ${minH} mm`});
  if(maxW&&maxH) specs.push({label:'Maximum size',value:`${maxW} × ${maxH} mm`});
  if(air) specs.push({label:'Air tightness',value:air});
  if(water) specs.push({label:'Water tightness',value:water});
  if(wind) specs.push({label:'Wind pressure',value:wind});
  if(notes) specs.push({label:'Notes',value:notes});
  // options grouped by type from mapping; the first installation choice is the default.
  const opts=[];
  for(const [optId,perProd] of Object.entries(mapByOption)){
    const status=perProd[id];
    if(!status) continue;
    const o=options[optId];if(!o)continue;
    const ot=optionTypes[o.typeId];
    opts.push({typeSlug:ot?ot.slug:'', typeName:ot?ot.name:'', name:o.name, availability:status});
  }
  const firstInstallation=opts.find(o=>o.typeSlug==='installation');
  if(firstInstallation) firstInstallation.availability='standard';
  return {
    id, slug:slugify(name), name,
    familySlug:fam?fam.slug:'', categorySlug:cat?cat.slug:'',
    shortDescription:r[3]||'',
    descriptionParagraphs:paragraphs(r[4]),
    standardGlass:glass, hardware:r[6]||'',
    minWidth:minW?Number(minW):null, minHeight:minH?Number(minH):null,
    maxWidth:maxW?Number(maxW):null, maxHeight:maxH?Number(maxH):null,
    profileThickness:profile, airTightness:air, waterTightness:water, windPressure:wind,
    notes, heroImage:hero, gallery, keySpecs, specs, options:opts,
    featuredOrder:Number(id)||0,
  };
});

// ---- emit TS ----
function j(o){return JSON.stringify(o);}
const L=[];
L.push(`// AUTO-GENERATED from products.xlsx — AMJ Trade Direct catalogue.`);
L.push(`// This module is the single hardcoded source of truth for catalogue + product-detail pages.`);
L.push(`// It is deliberately shaped to mirror future Sanity documents (category / family / product,`);
L.push(`// referenced by slug), so migration is a matter of swapping the arrays below for GROQ queries`);
L.push(`// while the selector helpers and React pages stay unchanged.`);
L.push(`// Regenerate: node scripts/generate-catalogue.cjs <unpacked-xlsx-dir> src/data/catalogue.ts`);
L.push(``);
L.push(`export type CategorySlug = "windows" | "doors";`);
L.push(``);
L.push(`export interface Category {`);
L.push(`  id: string;`);
L.push(`  slug: string;`);
L.push(`  name: string;`);
L.push(`  shortDescription: string;`);
L.push(`  description: string;`);
L.push(`}`);
L.push(``);
L.push(`export interface Family {`);
L.push(`  id: string;`);
L.push(`  slug: string;`);
L.push(`  categorySlug: string;`);
L.push(`  name: string;`);
L.push(`  shortDescription: string;`);
L.push(`  description: string;`);
L.push(`}`);
L.push(``);
L.push(`export type OptionAvailability = "standard" | "optional";`);
L.push(``);
L.push(`export interface ProductOption {`);
L.push(`  typeSlug: string;`);
L.push(`  typeName: string;`);
L.push(`  name: string;`);
L.push(`  availability: OptionAvailability;`);
L.push(`}`);
L.push(``);
L.push(`export interface SpecRow { label: string; value: string; }`);
L.push(``);
L.push(`export interface Product {`);
L.push(`  id: string;`);
L.push(`  slug: string;`);
L.push(`  name: string;`);
L.push(`  familySlug: string;`);
L.push(`  categorySlug: string;`);
L.push(`  shortDescription: string;`);
L.push(`  descriptionParagraphs: string[];`);
L.push(`  standardGlass: string;`);
L.push(`  hardware: string;`);
L.push(`  minWidth: number | null;`);
L.push(`  minHeight: number | null;`);
L.push(`  maxWidth: number | null;`);
L.push(`  maxHeight: number | null;`);
L.push(`  profileThickness: string;`);
L.push(`  airTightness: string;`);
L.push(`  waterTightness: string;`);
L.push(`  windPressure: string;`);
L.push(`  notes: string;`);
L.push(`  heroImage: string;`);
L.push(`  gallery: string[];`);
L.push(`  keySpecs: SpecRow[];`);
L.push(`  specs: SpecRow[];`);
L.push(`  options: ProductOption[];`);
L.push(`  featuredOrder: number;`);
L.push(`}`);
L.push(``);
// categories
L.push(`export const categories: Category[] = [`);
for(const c of categories){
  L.push(`  { id: ${j(c.id)}, slug: ${j(c.slug)}, name: ${j(c.name)}, shortDescription: \`${esc(c.shortDescription)}\`, description: \`${esc(c.description)}\` },`);
}
L.push(`];`);
L.push(``);
// families
L.push(`export const families: Family[] = [`);
for(const f of families){
  L.push(`  { id: ${j(f.id)}, slug: ${j(f.slug)}, categorySlug: ${j(f.categorySlug)}, name: ${j(f.name)}, shortDescription: \`${esc(f.shortDescription)}\`, description: \`${esc(f.description)}\` },`);
}
L.push(`];`);
L.push(``);
// products
L.push(`export const products: Product[] = [`);
for(const p of products){
  L.push(`  {`);
  L.push(`    id: ${j(p.id)}, slug: ${j(p.slug)}, name: ${j(p.name)},`);
  L.push(`    familySlug: ${j(p.familySlug)}, categorySlug: ${j(p.categorySlug)},`);
  L.push(`    shortDescription: \`${esc(p.shortDescription)}\`,`);
  L.push(`    descriptionParagraphs: [${p.descriptionParagraphs.map(x=>'`'+esc(x)+'`').join(', ')}],`);
  L.push(`    standardGlass: ${j(p.standardGlass)}, hardware: ${j(p.hardware)},`);
  L.push(`    minWidth: ${p.minWidth==null?'null':p.minWidth}, minHeight: ${p.minHeight==null?'null':p.minHeight}, maxWidth: ${p.maxWidth==null?'null':p.maxWidth}, maxHeight: ${p.maxHeight==null?'null':p.maxHeight},`);
  L.push(`    profileThickness: ${j(p.profileThickness)}, airTightness: ${j(p.airTightness)}, waterTightness: ${j(p.waterTightness)}, windPressure: ${j(p.windPressure)},`);
  L.push(`    notes: ${j(p.notes)},`);
  L.push(`    heroImage: ${j(p.heroImage)},`);
  L.push(`    gallery: [${p.gallery.map(j).join(', ')}],`);
  L.push(`    keySpecs: [${p.keySpecs.map(k=>`{ label: ${j(k.label)}, value: ${j(k.value)} }`).join(', ')}],`);
  L.push(`    specs: [${p.specs.map(k=>`{ label: ${j(k.label)}, value: ${j(k.value)} }`).join(', ')}],`);
  L.push(`    options: [${p.options.map(o=>`{ typeSlug: ${j(o.typeSlug)}, typeName: ${j(o.typeName)}, name: ${j(o.name)}, availability: ${j(o.availability)} }`).join(', ')}],`);
  L.push(`    featuredOrder: ${p.featuredOrder},`);
  L.push(`  },`);
}
L.push(`];`);
L.push(``);
// selectors
L.push(`// ─── Selectors (future GROQ query boundary) ──────────────────────────────────`);
L.push(`export const getCategories = (): Category[] => categories;`);
L.push(`export const getCategory = (slug: string): Category | undefined => categories.find(c => c.slug === slug);`);
L.push(`export const getFamiliesByCategory = (categorySlug: string): Family[] => families.filter(f => f.categorySlug === categorySlug);`);
L.push(`export const getFamily = (slug: string): Family | undefined => families.find(f => f.slug === slug);`);
L.push(`export const getProductBySlug = (slug: string): Product | undefined => products.find(p => p.slug === slug);`);
L.push(`export const getProductsByCategory = (categorySlug: string): Product[] =>`);
L.push(`  products.filter(p => p.categorySlug === categorySlug).sort((a, b) => a.featuredOrder - b.featuredOrder);`);
L.push(`export const getProductsByFamily = (familySlug: string): Product[] =>`);
L.push(`  products.filter(p => p.familySlug === familySlug).sort((a, b) => a.featuredOrder - b.featuredOrder);`);
L.push(`export const getRelatedProducts = (slug: string, limit = 3): Product[] => {`);
L.push(`  const p = getProductBySlug(slug);`);
L.push(`  if (!p) return [];`);
L.push(`  return products.filter(x => x.familySlug === p.familySlug && x.slug !== p.slug).slice(0, limit);`);
L.push(`};`);
L.push(`export const familyProductCount = (familySlug: string): number =>`);
L.push(`  products.filter(p => p.familySlug === familySlug).length;`);
L.push(``);
fs.writeFileSync(outPath, L.join('\n'), 'utf8');
console.log('Wrote', outPath);
console.log('categories', categories.length, 'families', families.length, 'products', products.length);
console.log('sample product slugs:', products.slice(0,4).map(p=>p.slug).join(', '));
console.log('windows families:', families.filter(f=>f.categorySlug==='windows').map(f=>f.slug).join(', '));
console.log('doors families:', families.filter(f=>f.categorySlug==='doors').map(f=>f.slug).join(', '));
