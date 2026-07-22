# Nächste Schritte

Priorisierte offene Punkte (Stand 2026-07-22). Jeder Punkt läuft als eigener
OpenSpec-Change (`opsx:propose`), nicht als Direkt-Edit. Details und Begründungen
stehen in CLAUDE.md („Decided, not yet built" / „Extensibility").

## 1. Registry-gestützte Publish-Validierung

- [x] Erledigt (OpenSpec-Change `registry-publish-validation`, archiviert 2026-07-22)

**Problem:** Ein unbekannter Action-`type` oder eine ungültige `config` publisht
heute sauber und scheitert erst bei der Outbox-Delivery (Retry → Dead-Letter →
geparkte Instanz). Das bricht das Projektprinzip „Fehler beim Publish, nie zur
Laufzeit". `registry.ts` deklariert zwar `configSchema`, aber nichts liest es;
`publishBody` konsultiert die Registry überhaupt nicht.

**Zu tun:**
- Registry-Mapping `type -> { config schema, output schema }` scharfschalten:
  `publishBody` prüft jede Action (alle Positionen: onEntry, onExit, onPath,
  onCancel) gegen die Registry.
- Unbekannter `type` oder Schema-Verletzung der `config` = Publish-Fehler mit
  lokalisierter Fehlermeldung (analog `CelValidationError`).
- Platzierung auf dem Write-Pfad beachten (wie CEL/Durations): `definition.ts`
  bleibt Deserializer für gespeicherte Bodies, darf also nicht verschärft werden.
- Tests: gültiges Beispiel publisht; unbekannter Typ und kaputte Config werden
  je mit lokalisiertem Fehler abgelehnt; identischer Re-Publish eines vor der
  Verschärfung gespeicherten Bodies bleibt Hash-Treffer-No-op.

## 2. TimerState-Provenance

- [x] Erledigt (OpenSpec-Change `timer-state-provenance`, archiviert 2026-07-22)

**Problem:** Die Timer-Reconciliation bei Migrationen keyt nur auf der Timer-Id.
Ein Ziel-Step, der eine überlebende Id mit anderer `duration` redeklariert oder
zwischen `duration` und `deadline` wechselt, ist von einem unveränderten Timer
nicht unterscheidbar — das alte `fireAt` bleibt stillschweigend stehen.

**Zu tun:**
- Provenance-Feld auf `TimerState` ergänzen (deklarierte Duration /
  Deadline-Quelle / Arming-Zeitpunkt) — Schema-Änderung in `definition.ts`,
  also bewusst und isoliert.
- Reconciliation in `migration.ts` erweitert: „carried+declared" nur noch bei
  unveränderter Provenance behalten; bei Abweichung gegen den Ziel-Body neu armen.
- Rückwärtskompatibilität klären: Bestands-Instanzen ohne Provenance-Feld
  (Verhalten definieren, nicht raten).
- Tests: redeklarierte Duration wird neu gearmt; unveränderter Timer behält
  `fireAt`; duration↔deadline-Flip wird erkannt.

## 3. Event-Kind `migration.transform-dropped`

- [x] Erledigt (OpenSpec-Change `migration-transform-dropped-event`, archiviert 2026-07-22)

**Problem:** Ein `transforms`-Ausdruck, der zur Laufzeit wirft, lässt sein
Zielfeld stillschweigend ungeschrieben (total, wie ein Guard). Der
`timer.unarmed`-Präzedenzfall sagt: eine solche Auslassung muss abfragbar sein.

**Zu tun:**
- Neues `InstanceEvent`-Kind `migration.transform-dropped` additiv ergänzen
  (Instanz, Version, `transitionSeq` in Kraft, Zielfeld, Grund).
- `evalTransforms` bzw. der Migrationspfad schreibt das Event pro
  fehlgeschlagenem Eintrag; kein Abbruch der Migration.
- Kein `ActionOutcome`-Träger nötig (das Kind enqueued nichts) — Doku
  entsprechend, wie bei den drei bestehenden outcome-losen Kinds.
- Tests: werfender Transform erzeugt das Event, Migration läuft weiter;
  erfolgreicher Transform erzeugt keins.

---

**Bewusst zurückgestellt:** Data-Source-Resolution (kein Konsument ohne Editor)
und In-Flight-Writeback-Reconciliation über Migrationen (vertagt, bis
`pending-actions`-Skips praktisch auftreten). Danach: API-Schicht + Editor
(Roadmap #4) — vorher als eigenes Explore-Gespräch zerlegen.
