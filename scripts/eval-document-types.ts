/** Live extraction regression using synthetic documents only. */
import { runExtraction } from '../src/lib/ai/extraction';
const fixtures = [
  { id: 'travel-qr', expected: 'other', text: '# Vorläufige Fahrkarte\nDeutschlandticket für Schüler. Fahrgast: Testkind. Gültig 03.09.2027 bis 30.09.2027. QR-Code für die Fahrkartenkontrolle. Nur gültig mit Lichtbildausweis.' },
  { id: 'travel-barcode', expected: 'other', text: '# Fahrschein\nDeutschlandticket. Gültigkeit: 01.10.2027 bis 31.10.2027. Barcode auf dem Handy bei der Kontrolle vorzeigen. Nicht übertragbar.' },
  { id: 'portal-login', expected: 'credentials', text: '# Zugang zum Fahrkartenportal\nBenutzername: synthetic@example.com\nPasswort: SYNTHETIC-TEST-ONLY\nHier wird das Deutschlandticket verwaltet.' },
  { id: 'school-login', expected: 'credentials', text: '# Schulportal Zugangsdaten\nBenutzername: SYNTHETIC-USER\nZugangscode: SYNTHETIC-CODE\nBitte mit diesen Angaben anmelden.' },
];
let failed = false;
for (const fixture of fixtures) {
  const analysis = await runExtraction(fixture.text, { members: [], categories: [], knowledgeNodes: [] });
  const passed = analysis.document_type === fixture.expected;
  console.log(JSON.stringify({ id: fixture.id, expected: fixture.expected, actual: analysis.document_type, passed }));
  failed ||= !passed;
}
if (failed) process.exitCode = 1;
