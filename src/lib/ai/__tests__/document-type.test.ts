import { describe, expect, it } from 'vitest';
import { correctTravelDocumentType, isTravelTicket } from '../document-type';
const ticket = '# Vorläufige Fahrkarte\nDeutschlandticket für Schülerinnen\nGültig 03.09.2026 bis 30.09.2026\nQR-Code: SYNTHETIC\nNur gültig mit Lichtbildausweis.';
describe('travel documents versus account access', () => {
  it('corrects a credentials suggestion for an actual travel document with a QR code', () => {
    expect(correctTravelDocumentType('credentials', ticket)).toBe('other');
  });
  it.each(['Passwort: hidden', 'Benutzername: private', 'PIN: 1234', 'Zugangscode: 1234', 'Login für das Kundenkonto'])('never downgrades a ticket containing %s', line => {
    expect(correctTravelDocumentType('credentials', ticket + '\n' + line)).toBe('credentials');
  });
  it('does not override contracts or infer a travel ticket from a title alone', () => {
    expect(correctTravelDocumentType('contract', ticket)).toBe('contract');
    expect(isTravelTicket('Deutschlandticket Zugang verwalten')).toBe(false);
    expect(isTravelTicket('Gültig bis 30.09.2026')).toBe(false);
  });
});
