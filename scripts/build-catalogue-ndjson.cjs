// Build normalized Sanity NDJSON for the OpenFrame catalogue from products.xlsx.
//
//   1) unzip products.xlsx into a folder (e.g. `unzip products.xlsx -d /tmp/xlsx`)
//   2) node scripts/build-catalogue-ndjson.cjs /tmp/xlsx sanity/catalogue.ndjson
//   3) cd sanity && npx sanity dataset import catalogue.ndjson production
//
// Emits the SINGLE-SOURCE-OF-TRUTH model: optionType + option documents (each
// option carries its own price), products that REFERENCE shared options with a
// per-product availability, and images as uploadable Sanity assets (_sanityAsset).
// Document ids are deterministic so re-imports upsert.
const fs = require("fs");
const path = require("path");

const base = process.argv[2];
const outPath = process.argv[3] || "sanity/catalogue.ndjson";
if (!base) { console.error("usage: node scripts/build-catalogue-ndjson.cjs <unpacked-xlsx-dir> [out.ndjson]"); process.exit(1); }
const xlDir = path.join(base, "xl");

// ── xlsx parsing (shared-strings + sheets) ───────────────────────────────────
function decode(s){return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");}
const shared=[];
for(const m of fs.readFileSync(path.join(xlDir,"sharedStrings.xml"),"utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)){
  const ts=[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];shared.push(ts.map(t=>decode(t[1])).join(""));
}
const wb=fs.readFileSync(path.join(xlDir,"workbook.xml"),"utf8");
const rels=fs.readFileSync(path.join(xlDir,"_rels","workbook.xml.rels"),"utf8");
const relMap={};for(const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))relMap[m[1]]=m[2];
const sheetDefs=[...wb.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m=>({name:m[1],target:relMap[m[2]]}));
function colToIdx(c){let n=0;for(const ch of c)n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function parseSheet(target){
  const p=path.join(xlDir,target.replace(/^\//,"").replace(/^xl\//,""));
  const xml=fs.readFileSync(p,"utf8");const rows=[];
  for(const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)){
    const arr=[];
    for(const cm of rm[2].matchAll(/<c[^>]*r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)){
      const ci=colToIdx(cm[1]);const attrs=cm[2];const inner=cm[3];
      const t=(attrs.match(/t="([^"]+)"/)||[])[1]||"n";let val="";
      const v=inner.match(/<v>([\s\S]*?)<\/v>/);
      if(t==="s"){if(v)val=shared[parseInt(v[1])];}
      else if(t==="inlineStr"){const im=inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);if(im)val=decode(im[1]);}
      else{if(v)val=decode(v[1]);}
      arr[ci]=val;
    }
    rows.push(arr);
  }
  return rows;
}
const S={};for(const s of sheetDefs)S[s.name]=parseSheet(s.target);

// ── helpers ──────────────────────────────────────────────────────────────────
function slugify(str){return String(str).toLowerCase().replace(/&/g," and ").replace(/["'()]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");}
function paragraphs(desc){if(!desc)return[];return String(desc).split(/\n\s*\n/).map(p=>p.replace(/\s*\n\s*/g," ").replace(/\s+/g," ").trim()).filter(Boolean);}
function num(v){return v===""||v==null?null:Number(v);}
const ref=(id)=>({_type:"reference",_ref:id});
const imageAsset=(url)=>({_type:"image",_sanityAsset:`image@${url}`});
// Deterministic rank-string generator for orderRank (the @sanity/orderable-
// document-list field — see sanity.config.ts). Same algorithm as
// sanity/scripts/lib/rank.mjs, duplicated here because that one is ESM and
// this file is CommonJS; keep the two in step. A newly-imported category,
// option or product needs a STARTING rank too, not just the ones the
// one-time backfill script (sanity/scripts/backfill-order-rank.mjs) seeds on
// existing live documents.
function ranksFor(count){const width=Math.max(3,String(Math.max(count-1,0)).length);return Array.from({length:count},(_,i)=>`a${String(i).padStart(width,"0")}`);}
const docs=[];

// ── categories ───────────────────────────────────────────────────────────────
const categories=S["Categories"].slice(1).filter(r=>r&&r[0]).map(r=>({id:r[0],slug:slugify(r[1]),name:r[1],shortDescription:r[2]||"",description:r[3]||""}));
const catById={};categories.forEach(c=>catById[c.id]=c);
const categoryRanks=ranksFor(categories.length);
categories.forEach((c,i)=>docs.push({_id:`category-${c.slug}`,_type:"category",name:c.name,slug:{_type:"slug",current:c.slug},orderRank:categoryRanks[i],shortDescription:c.shortDescription,description:c.description}));

// ── families ─────────────────────────────────────────────────────────────────
const NAME_FIX={"Casament Door":"Casement Door","Bi-Fold Dooor":"Bi-Fold Door","Lif-Sliding Door":"Lift-Slide Door","Slim Frame Sliding Door":"Slim-Frame Sliding Door","Glass Louver":"Glass Louvre","Tilt&Turn Window":"Tilt & Turn Window"};
const families=S["Families"].slice(1).filter(r=>r&&r[0]).map(r=>{const name=NAME_FIX[r[2]]||r[2];const cat=catById[r[1]];return{id:r[0],slug:slugify(name),categorySlug:cat?cat.slug:"",categoryId:r[1],name,shortDescription:r[3]||"",description:r[4]||""};});
const famById={};families.forEach(f=>famById[f.id]=f);
for(const f of families) docs.push({_id:`family-${f.slug}`,_type:"family",name:f.name,slug:{_type:"slug",current:f.slug},category:ref(`category-${f.categorySlug}`),shortDescription:f.shortDescription,description:f.description});

// ── option types ─────────────────────────────────────────────────────────────
// The sheet's "Colour" type holds finishes (Powercoat/Anodised/…); we drop it for
// now and use a single shared "Colour" type carrying the Colorbond swatches.
const SKIP_SHEET_TYPES=new Set(["Colour"]);
const TYPE_SORT={ colour:1, hardware:2, flyscreen:3, installation:4 };
const optionTypes={}; // sheetTypeId -> {slug,name}
S["Option Types"].slice(1).filter(r=>r&&r[0]).forEach(r=>{
  const name=r[1];if(SKIP_SHEET_TYPES.has(name))return;
  optionTypes[r[0]]={id:r[0],name,slug:slugify(name)};
});
// Colorbond colour is a shared "applies to all" type (not per-product in the sheet).
const COLOUR_TYPE={slug:"colour",name:"Colour"};
const allTypes=[...Object.values(optionTypes),COLOUR_TYPE];
for(const t of allTypes){
  docs.push({_id:`optiontype-${t.slug}`,_type:"optionType",name:t.name,slug:{_type:"slug",current:t.slug},sortOrder:TYPE_SORT[t.slug]??9,appliesToAll:t.slug==="colour"});
}

// ── options (sheet: id, typeId, name, pricing) ───────────────────────────────
const optionIdBySheet={}; // sheetOptionId -> _id
const options=[];
S["Options"].slice(1).filter(r=>r&&r[0]).forEach(r=>{
  const type=optionTypes[r[1]];if(!type)return; // skip options of dropped types (finish)
  const name=r[2];const slug=slugify(name);
  const _id=`option-${type.slug}-${slug}`;optionIdBySheet[r[0]]=_id;
  options.push({_id,name,typeSlug:type.slug,price:num(r[3])??0});
});
// Ranked PER TYPE — Colours and Hardware never contend for the same ranks,
// matching how Studio's "Options" list is grouped (see sanity.config.ts).
const optionsByType={};options.forEach(o=>{(optionsByType[o.typeSlug]=optionsByType[o.typeSlug]||[]).push(o);});
Object.values(optionsByType).forEach(group=>{const ranks=ranksFor(group.length);group.forEach((o,i)=>{o.orderRank=ranks[i];});});
for(const o of options){
  docs.push({_id:o._id,_type:"option",name:o.name,slug:{_type:"slug",current:o._id.replace(/^option-/,"")},optionType:ref(`optiontype-${o.typeSlug}`),pricingComponent:o.price,orderRank:o.orderRank});
}
// Colorbond colours (shared palette): swatches, included in base price, Dover White default.
const COLORBOND=[
  ["Dover White","#E3E7E2",true],["Surfmist","#D7D6CB"],["Classic Cream","#E6CFAE"],["Southerly","#BFBFBB"],
  ["Paperbark","#C9B59B"],["Evening Haze","#BFB5A1"],["Shale Grey","#B2B4AF"],["Dune","#ADA398"],
  ["Bluegum","#899094"],["Windspray","#80847F"],["Pale Eucalypt","#777D67"],["Gully","#776F62"],
  ["Wilderness","#606F61"],["Wallaby","#6C6A65"],["Mangrove","#696957"],["Jasper","#675C51"],
  ["Basalt","#5C5E5E"],["Woodland Grey","#53514D"],["Cottage Green","#3B5045"],["Ironstone","#474B50"],
  ["Deep Ocean","#3C4B54"],["Manor Red","#673833"],["Monument","#404141"],["Night Sky","#2B2C2C"],
];
// Ranked in the order listed above — Dover White (isDefault) already leads,
// which is also where the live colour-swatch sort (isDefault desc, name asc)
// would put it, so this is a reasonable starting arrangement even though the
// swatch order itself does not read orderRank.
const colourRanks=ranksFor(COLORBOND.length);
COLORBOND.forEach(([name,hex,isDefault],i)=>{
  docs.push({_id:`option-colour-${slugify(name)}`,_type:"option",name,slug:{_type:"slug",current:`colour-${slugify(name)}`},optionType:ref("optiontype-colour"),pricingComponent:0,hex,isDefault:!!isDefault,orderRank:colourRanks[i]});
});

// ── mapping matrix: rows = sheet option id, cols = product id -> availability ──
const mapRows=S["Mapping"];const header=mapRows[0];
const prodCol={};for(let c=1;c<header.length;c++){if(header[c])prodCol[String(header[c]).trim()]=c;}
const availByProduct={}; // productId -> [{optionId,availability}]
for(let i=1;i<mapRows.length;i++){
  const row=mapRows[i];if(!row||!row[0])continue;const sheetOptId=String(row[0]).trim();
  const _ref=optionIdBySheet[sheetOptId];if(!_ref)continue;
  for(const [pid,ci] of Object.entries(prodCol)){
    const raw=(row[ci]||"").toString().trim();if(!raw)continue;
    const availability=raw.toUpperCase()==="S"?"standard":"optional";
    (availByProduct[pid]=availByProduct[pid]||[]).push({_ref,availability});
  }
}

// ── images (placeholder Unsplash, grouped by category; uploaded on import) ────
const WIN_IMG=["https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format","https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format","https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format","https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"];
const DOOR_IMG=["https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format","https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format","https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format","https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"];
const catFamSeen={};families.forEach(f=>{(catFamSeen[f.categoryId]=catFamSeen[f.categoryId]||[]).includes(f.id)||catFamSeen[f.categoryId].push(f.id);});
function famImgIndex(f){return Math.max(0,(catFamSeen[f.categoryId]||[]).indexOf(f.id));}
function shortGlass(g){if(!g)return"";const l=g.toLowerCase();const lowE=/low-?e/.test(l);const igu=/\+\s*\d+\s*(a|ar|argon)/i.test(g)||/double/i.test(l)||/igu/i.test(l);if(lowE)return igu?"Low-E double glazed":"Low-E glazed";if(igu)return"Double glazed";if(/temper/i.test(l))return"Single tempered";return g;}

// ── products ─────────────────────────────────────────────────────────────────
const prodRows=S["Products"].slice(1).filter(r=>r&&r[0]);
const productRanks=ranksFor(prodRows.length);
prodRows.forEach((r,rowIndex)=>{
  const id=String(r[0]).trim();const fam=famById[r[1]];const cat=fam?catById[fam.categoryId]:null;
  const name=r[2];const glass=r[5]||"";const minW=num(r[7]),minH=num(r[8]),maxW=num(r[9]),maxH=num(r[10]);
  const profile=r[11]||"",air=r[12]||"",water=r[13]||"",wind=r[14]||"",notes=r[15]||"";
  const pool=(cat&&cat.slug==="doors")?DOOR_IMG:WIN_IMG;const fi=fam?famImgIndex(fam):0;
  const hero=pool[fi%pool.length];const gallery=[pool[fi%pool.length],pool[(fi+1)%pool.length],pool[(fi+2)%pool.length]];
  const keySpecs=[];if(profile)keySpecs.push({label:"Frame profile",value:profile});const sg=shortGlass(glass);if(sg)keySpecs.push({label:"Glazing",value:sg});if(maxW&&maxH)keySpecs.push({label:"Max size",value:`${maxW} × ${maxH} mm`});if(wind)keySpecs.push({label:"Wind rating",value:wind});
  const specs=[];if(fam)specs.push({label:"Family",value:fam.name});if(cat)specs.push({label:"Category",value:cat.name});if(glass)specs.push({label:"Standard glass",value:glass});if(r[6])specs.push({label:"Hardware",value:r[6]});if(profile)specs.push({label:"Profile thickness",value:profile});if(minW&&minH)specs.push({label:"Minimum size",value:`${minW} × ${minH} mm`});if(maxW&&maxH)specs.push({label:"Maximum size",value:`${maxW} × ${maxH} mm`});if(air)specs.push({label:"Air tightness",value:air});if(water)specs.push({label:"Water tightness",value:water});if(wind)specs.push({label:"Wind pressure",value:wind});if(notes)specs.push({label:"Notes",value:notes});
  const prodOptions=(availByProduct[id]||[]).map((o,i)=>({_key:`op${i}`,_type:"productOption",option:{_type:"reference",_ref:o._ref},availability:o.availability}));
  docs.push({
    _id:`product-${slugify(name)}`,_type:"product",name,slug:{_type:"slug",current:slugify(name)},
    family:ref(`family-${fam?fam.slug:""}`),category:ref(`category-${cat?cat.slug:""}`),
    shortDescription:r[3]||"",descriptionParagraphs:paragraphs(r[4]),
    standardGlass:glass,hardware:r[6]||"",minWidth:minW,minHeight:minH,maxWidth:maxW,maxHeight:maxH,
    profileThickness:profile,airTightness:air,waterTightness:water,windPressure:wind,notes,
    heroImage:imageAsset(hero),gallery:gallery.map((u,i)=>({_key:`g${i}`,...imageAsset(u)})),
    keySpecs:keySpecs.map((s,i)=>({_key:`ks${i}`,_type:"specRow",...s})),
    specs:specs.map((s,i)=>({_key:`sp${i}`,_type:"specRow",...s})),
    options:prodOptions,orderRank:productRanks[rowIndex],
    seo:{_type:"seoMeta",metaTitle:`${name} | OpenFrame`,metaDescription:(r[3]||"").replace(/\s+/g," ").trim().slice(0,160)},
  });
});

fs.writeFileSync(outPath,docs.map(d=>JSON.stringify(d)).join("\n")+"\n","utf8");
const by=(t)=>docs.filter(d=>d._type===t).length;
console.log(`✓ wrote ${outPath} — ${docs.length} documents`);
console.log(`  categories ${by("category")}, families ${by("family")}, optionTypes ${by("optionType")}, options ${by("option")}, products ${by("product")}`);
