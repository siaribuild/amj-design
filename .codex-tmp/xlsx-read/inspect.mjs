import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "D:\\OneDrive\\Documents\\Business\\AMJ Trade Direct\\Products\\product_catalogue_descriptions_enriched.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = workbook.worksheets.getItem("Product Descriptions");
console.log(JSON.stringify(sheet.getRange("A2:F28").values));
