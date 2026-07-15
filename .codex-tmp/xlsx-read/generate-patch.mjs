import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const repo = "E:\\Projects\\amj-website-design";
const source = "D:\\OneDrive\\Documents\\Business\\AMJ Trade Direct\\Products\\product_catalogue_descriptions_enriched.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const rows = workbook.worksheets.getItem("Product Descriptions").getRange("A2:F28").values;
const descriptions = new Map(rows.map(row => [String(row[0]), { short: String(row[4] ?? ""), long: String(row[5] ?? "") }]));
const escapeTemplate = value => value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");

const path = `${repo}\\src\\data\\catalogue.ts`;
const lines = (await fs.readFile(path, "utf8")).split("\n");
let currentId = null;
const changes = [];
for (let index = 0; index < lines.length; index++) {
  const idMatch = lines[index].match(/^    id: "(\d+)"/);
  if (idMatch) currentId = idMatch[1];
  const next = descriptions.get(currentId);
  if (!next) continue;
  if (lines[index].startsWith("    shortDescription: `")) {
    changes.push([lines[index], `    shortDescription: \`${escapeTemplate(next.short)}\`,`]);
  } else if (lines[index].startsWith("    descriptionParagraphs: [")) {
    changes.push([lines[index], `    descriptionParagraphs: [\`${escapeTemplate(next.long)}\`],`]);
  } else if (lines[index].startsWith("    options: [")) {
    const needle = '{ typeSlug: "installation", typeName: "Installation", name: ';
    const at = lines[index].indexOf(needle);
    if (at >= 0) {
      const availabilityAt = lines[index].indexOf('availability: "optional"', at);
      const followingOptionAt = lines[index].indexOf(" }, {", at);
      if (availabilityAt >= 0 && (followingOptionAt < 0 || availabilityAt < followingOptionAt)) {
        const updated = lines[index].slice(0, availabilityAt) + 'availability: "standard"' + lines[index].slice(availabilityAt + 'availability: "optional"'.length);
        changes.push([lines[index], updated]);
      }
    }
  }
}

const generatorPath = `${repo}\\scripts\\generate-catalogue.cjs`;
const generator = await fs.readFile(generatorPath, "utf8");
const oldGenerator = "  // options grouped by type from mapping";
const newGenerator = "  // options grouped by type from mapping; the first installation choice is the default.\n";
const oldAnchor = "  return {\n    id, slug:slugify(name), name,";
const newAnchor = "  const firstInstallation=opts.find(o=>o.typeSlug==='installation');\n  if(firstInstallation) firstInstallation.availability='standard';\n" + oldAnchor;

let out = "*** Begin Patch\n*** Update File: E:\\Projects\\amj-website-design\\src\\data\\catalogue.ts\n";
for (const [oldLine, newLine] of changes) out += `@@\n-${oldLine}\n+${newLine}\n`;
out += "*** Update File: E:\\Projects\\amj-website-design\\scripts\\generate-catalogue.cjs\n";
out += `@@\n-${oldGenerator}\n+${newGenerator.trimEnd()}\n`;
out += `@@\n-${oldAnchor.replaceAll("\n", "\n-")}\n+${newAnchor.replaceAll("\n", "\n+")}\n`;
out += "*** End Patch\n";
console.error(JSON.stringify({ rows: rows.length, catalogueChanges: changes.length, generatorAnchorsFound: [generator.includes(oldGenerator), generator.includes(oldAnchor)] }));
console.log(out);
