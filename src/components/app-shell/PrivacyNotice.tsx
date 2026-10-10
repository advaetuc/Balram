export function PrivacyNotice() {
  return <section aria-labelledby="privacy-title" className="mx-auto mt-4 max-w-7xl text-sm leading-6">
    <details><summary id="privacy-title">Privacy, public data & planning limits</summary>
      <div className="max-w-3xl space-y-3 pb-3">
        <p>Your profile, boundary, crops, irrigation inputs and last-good results stay in this browser’s IndexedDB.
          Balram has no accounts or remote farm database. Clearing browser storage removes your plan; other people using this browser may access it.</p>
        <p>Coordinates are transmitted only after an explicit action: requesting weather sends the field center through our server to Open-Meteo;
          requesting experimental soil data sends it to ISRIC SoilGrids when enabled. Provider coordinates are rounded to four decimal places.
          Nominatim receives submitted place-search text. Full boundary polygons and farm profiles are never uploaded.</p>
        <p>Map tiles load after you choose “Load online map”. OpenStreetMap receives visible tile locations and your IP address;
          subsequent map movements request visible tiles. Balram never downloads or stores tiles for offline use.
          “Use my location” asks the browser for permission and fills local inputs; it does not submit them to a data provider.</p>
        <p>Our hosting service processes lookup requests, including the submitted field center, and connection metadata.
          Public providers process requests under their own policies. Balram does not log coordinates or publicly cache lookup responses.
          The offline cache holds application files only; saved data retains its original dates and sources.</p>
        <p>Open-Meteo, Nominatim and OpenStreetMap are public, keyless services with usage limits and no guaranteed availability.
          SoilGrids is experimental and disabled for release. Agmarknet is disabled. Weather and soil values are modeled estimates,
          not field measurements; verify irrigation plans locally. Open-Meteo’s free endpoint requires non-commercial use.</p>
        <div className="flex flex-wrap gap-x-5">
          <a className="inline-flex items-center underline" href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Open-Meteo terms</a>
          <a className="inline-flex items-center underline" href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">Nominatim policy</a>
          <a className="inline-flex items-center underline" href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">OpenStreetMap privacy</a>
        </div>
      </div>
    </details>
  </section>;
}
