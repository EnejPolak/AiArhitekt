# API Debug – celoten tok v besedah (opis za ChatGPT)

## Kaj je api-debug stran

**api-debug** je testna/debug stran v Next.js aplikaciji. Omogoča ročno testiranje treh API korakov v zaporedju: **A) Geocode**, **D) Places**, **C) SERP**. Vsak korak ima svoj vhodni obrazec in prikaže odgovor API-ja (status, čas, JSON). Namen je razumeti, kako skupaj delujejo geokodiranje, iskanje trgovin/obrtnikov po lokaciji in iskanje produktov po domenah.

Stran in `POST /api/serp/reset-usage` sta **debug-only**. Production deployment (`VERCEL_ENV` / `VERCEL_TARGET_ENV` / `APP_DEPLOYMENT_ENV=production`) ju vedno onemogoči, tudi če je `API_DEBUG_ENABLED=true`. Lokalno/preview: nastavi `API_DEBUG_ENABLED=true`. Ne uporabljaj `NODE_ENV` kot edinega gata. Glej `lib/env/deployment.ts` in `docs/BACKEND.md`.

---

## Splošen tok (koraki A → D → C)

1. **A) Geocode** – uporabnik vnese naslov (npr. "Ljubljana, Slovenia"). Stran pokliče `/api/geocode`, dobi `lat`, `lng` in `formattedAddress`. Te koordinate se samodejno vpišejo v sekcijo D.
2. **D) Places** – uporabnik (ali avtomatsko iz A) dobi polja lat/lng, nastavi radij (km), način (kategorija ali brand) in opcije (dry run, only with website). Stran pokliče `/api/places/search`. Odgovor vsebuje sezname **stores** (trgovine) in **contractors** (obrtniki), plus **domene** za trgovine in obrtnike. Te domene (allowlist) se shranijo v stanje strani in jih C) uporabi.
3. **C) SERP** – uporabnik vnese "item specs" (en spec na vrstico, npr. "Beige upholstered dining chair, max €120") in opcijsko "preferred domains". Brez D) ni allowlist domen, zato C) brez dry runa ne more teči (razen če je vključen dry run). Stran pošlje POST na `/api/serp/search` z `items`, `allowlistDomains` (iz D), opcijsko `domainCategoryMap` (iz D) in `maxRequests`. Odgovor za vsak item vrne en "picked" produkt (naslov, link, cena, domena) ali null.

**Povezava med koraki:** A daje koordinate → D jih uporabi za iskanje Places in vrne domene → C te domene uporabi kot allowlist za iskanje produktov (site:domain + keywords).

---

## Akterji (datoteke) in njihova vloga

### Frontend (ena datoteka)

- **`app/api-debug/page.tsx`**  
  - Client-side React stran.  
  - Stanje: naslov za geocode; lat/lng, radij, način, brand keywords, dry run, only with website za Places; item specs, preferred domains, max requests, dry run za SERP; plus rezultati (geocodeResult, placesSearchResult, serpResult) in izvlečeni allowlist (allowlistDomainsStores, allowlistDomainsContractors, allowedDomains, domainCategoryMapStores).  
  - Ko A) uspe, `useEffect` iz geocodeResult vpiše lat/lng v polja Places.  
  - Ko D) uspe, iz odgovora izlušči `domains.stores` / `allowlistDomainsStores` in `domainCategoryMapStores` ter jih shrani v state; "allowedDomains" za C) so domene trgovin (stores).  
  - C) kliče SERP samo če je `allowedDomains.length > 0` ali če je vključen dry run.  
  - Vsi trije handlerji merijo čas (Date.now()) in prikažejo status + čas + JSON odgovor.

---

### API route: Geocode

- **`app/api/geocode/route.ts`**  
  - GET `?address=` ali POST `{ address }` / `{ lat, lng }` (reverse).  
  - `GOOGLE_GEOCODING_ENABLED=false` → ne kliče Google (`GEOCODING_DISABLED`).  
  - Normaliziran **`lib/cache`** (TTLCache, 24 h) – `Velenje` / ` velenje ` / `VELENJE` = en ključ.  
  - Če ni v cacheu in je enabled: en klic Google Geocoding API (brez retry ob quota). Timeout 10 s.  
  - Uspeh: `{ ok, formattedAddress, lat, lng }`. Quota: `GEOCODING_QUOTA_REACHED`.

---

### API route: Places (D)

- **`app/api/places/search/route.ts`**  
  - POST; body: `lat`, `lng`, `radiusKm`, `mode` (category | brand), opcijsko `brandKeywords`, `dryRun`, `onlyWithWebsite`.  
  - Validira koordinate (območja), radiusKm (1–50), mode, pri brand tudi brandKeywords.  
  - Vse logiko delegira v **`lib/places/placesService.ts`** – kliče `searchPlaces(params)` in vrne njen rezultat kot JSON.

**`lib/places/placesService.ts`** (glavni "akter" D):

- **Namen:** okoli dane lokacije (lat, lng) po radiju poiskati **trgovine** (stores) in **obrtnike** (contractors), z minimalnim številom klicov Google Places API.  
- **Cache:** `lib/cache` (TTLCache) – search rezultati 14 dni, details 30 dni.  
- **Multi-pass načrt:**  
  - **Stores:** najprej keyword iskanja (slovenske kategorije: gradbeni center, keramika, pohištvo, svetila, barve, tekstil …), nato še iskanja po **tipu** (hardware_store, home_goods_store, furniture_store, lighting_store).  
  - **Contractors:** keyword iskanja (pleskar, električar, vodovodar, keramičar, montaža, …).  
- Kliče Google **Nearby Search** (keyword ali type) in **Place Details** (za website, phone, types). Throttling: max 3 req/s, concurrency 2, timeout 6 s.  
- **Razvrščanje:** vsak place se klasificira v "store" ali "contractor" z `classifyPlaceBucket(types, name, websiteDomain)` – uporablja Google types, ime (ključne besede obrtnikov) in hevristiko domen (npr. kamnosestvo, pleskar → contractor).  
- **Kvaliteta domen:**  
  - Za **allowlist** (domene, ki jih C) uporabi) se štejejo samo mesta z website.  
  - Domain mora biti "official" (ime podjetja se ujema z domeno) in za store: ali catalog path signal (e.g. /p/, /product/) ali storeScore >= 0.70; za contractor: service signal (path, types, ime, domena).  
  - **`lib/places/domainUtils`**: `normalizeDomainToRoot` (root domena) in **REJECTED_DOMAINS** (social, imeniki, agregatorji) – te domene se nikoli ne dajo v allowlist.  
- **Izhod:**  
  - `stores`, `contractors` (seznami PlaceResult z name, place_id, rating, distanceKm, website, websiteDomain, categoryBucket, types, qualityFlags).  
  - `domains.stores`, `domains.contractors` (unikátne normalizirane root domene, cap npr. 10 na list).  
  - **domainCategoryMapStores:** za vsako domeno trgovine se iz Place types (Google) preko **`lib/serp/taxonomy`** pretvori v taksonomske kategorije (furniture, lighting, bathroom_plumbing, flooring, paint_walls, diy_hardware, decor_textiles). To C) uporabi za category-based routing (item spec → kategorija → izbira domen).  
  - Places uporablja za allowlist normalizacijo **`lib/serp/domains`** (`normalizeDomainToRoot`), da so ključi enaki kot v SERP.

**`lib/serp/taxonomy.ts`**  
- Taksonomija kategorij za SERP.  
- `itemSpecToCategory(itemSpec)` – iz besedila speca (stol, luč, keramika, …) vrne eno kategorijo.  
- `placeTypesToTaxonomyCategories(types)` – iz Google Place types vrne seznam taksonomskih kategorij.  
- Uporablja se v placesService za **domainCategoryMapStores** in v SERP (queryGen) za izbiro domen glede na kategorijo itema.

---

### API route: SERP (C)

- **`app/api/serp/search/route.ts`**  
  - POST; body: `items` (array specov), `allowlistDomains` (obvezno, iz D), opcijsko `domainCategoryMap`, `preferredDomains`, `dryRun`, `maxRequests`, `debug`.  
  - **Rate limit:** `lib/rateLimit` – npr. 30 req / 60 s na IP.  
  - **Guardrails:** `lib/serpGuardrails` – dnevni cap (npr. 100 SERP klicov na dan, shranjeno v tmp), wait za rate limit, cache po query+allowlist (6 h). Če je dry run, se zunanji klici ne izvajajo.  
  - Validira items in allowlist (**`lib/serp/domains`**: `validateAndNormalizeAllowlist` – samo sane hostname, root, dedupe).  
  - **Domain ranking:** **`lib/serp/domainStats`** – iz datoteke tmp/serp-domain-stats.json naloži uspešnost po domenah (success/total) in **rankDomainsBySuccess(allowlistDomains)** vrne domene razvrščene po uspešnosti (bolj uspešne naprej). Te "ranked" domene se uporabijo v queryGen in pri stripStoreNamesAndDomainsFromItem.  
  - **Načrtovanje poizvedb:** **`lib/serp/queryGen`**:  
    - **stripStoreNamesAndDomainsFromItem(item, rankedDomains)** – iz speca odstrani imena trgovin in domene, da v iskanje ne gredo (uporabnik ne sme "tipati" trgovin).  
    - **buildPlannedQueries(items, rankedDomains, domainCategoryMap, preferredDomains)** – za vsak item:  
      - pretvori v ključne besede (**itemSpecToKeywords**),  
      - določi kategorijo itema (**itemSpecToCategory** iz taxonomy),  
      - **resolveDomainsForItem(itemCategory, allowlistDomains, domainCategoryMap)** izbere do N domen (npr. 4) po pravilih: najprej domene, katerih kategorije vključujejo kategorijo itema; nato relaxed (kategorija itema ali diy_hardware); nato "unknown" (domene brez kategorij); na koncu vse. Če je podan **preferredDomains**, se te obdržijo v vrsti, ostale razvrstijo z **stableShuffleSort(item, domains)** (deterministično po hash item+domain).  
      - Za vsako izbrano domeno zgradi poizvedbe oblike `site:domain keywords` (in po potrebi še z key phrase + size tokens).  
    - Rezultat: `planned` (map item → seznam poizvedb) in `flat` (seznam { item, query }).  
  - **Izvajanje:** do `maxRequests` poizvedb iz `flat`. Za vsako:  
    - cache key **serpCacheKey(query, rankedDomains)** (lib/serp/domains).  
    - Če je v SERP cacheu (serpGuardrails) – uporabi cache.  
    - Sicer: **checkDailyCap**, **waitForRateLimit**, nato **`lib/serp/provider`**: **fetchSerp(query, { allowedDomains })**.  
    - SerpAPI kliče Google (SerpAPI key), parametri location=Slovenia, hl=sl, gl=si. Odgovor filtrira samo rezultate z domen iz allowlist. Rezultate shrani v cache in po potrebi **incrementDailyUsage**.  
  - Rezultate po itemih zbere v **candidatesByItem** (map item → map link → organic result).  
  - **Pick best:** za vsak item **`lib/serp/pickBest`**: **pickBestCandidate(tokens, candidates, maxCandidates)** – tokeni so iz itemSpecToKeywords; oceni vsak kandidat (naslov, snippet, URL pattern – produktna stran vs. kategorija), da ne izbere kategorijskih strani; vrne en "picked" (title, url, snippet, price, image, domain, score, confidence, reasons).  
  - Cena/slika: **parsePriceFromSnippet** (lib/serp/enrich); če je ENRICH_PRODUCT_PAGE=true, lahko še **enrichProductPage** doda ceno/sliko s strani.  
  - **recordDomainOutcome(picked.domain, true/false)** (domainStats) – posodobi statistiko uspešnosti domen za naslednje rankiranje.  
  - Odgovor: `dryRun`, `plannedQueries`, `executedCount`, `results` (array { item, picked | null, opcijsko topCandidates }), status.

**`lib/serp/domains.ts`**  
- **normalizeDomainToRoot(urlOrDomain)** – s tldts izlušči registrable domain (ccTLD-safe), lowercase, brez www.  
- **validateAndNormalizeAllowlist**, **isSaneHostname**, **serpCacheKey(query, allowedDomains)** za SERP cache.

**`lib/serp/provider.ts`**  
- **fetchSerp(query, options)** – kliče SerpAPI (Google), timeout 18 s, en retry ob timeoutu. Vrne organic results (title, link, snippet, price, image). Z `allowedDomains` filtrira samo rezultate z teh domen.

**`lib/serp/pickBest.ts`**  
- Ocena kandidatov: produktni vzorci v URL (npr. /p/, /product/, /izdelek/), naslov in snippet; kazni za kategorijske strani. Vrne najboljšega kandidata z razlogi in confidence.

**`lib/serp/domainStats.ts`**  
- Branje/pisanje tmp/serp-domain-stats.json (success/total po domeni). **rankDomainsBySuccess** razvrsti allowlist po uspešnosti; **recordDomainOutcome** posodobi statistiko po vsakem picku.

**`lib/serpGuardrails.ts`**  
- Dnevni cap (npr. 100), shranjevanje v tmp/serp-usage.json; rate limit 1 req/s; TTL cache za SERP rezultate (npr. 6 h) po **serpCacheKey**.

---

## Povzetek toka podatkov

1. **Uporabnik** vnese naslov → **api-debug** GET `/api/geocode?address=...` → **geocode route** (cache ali Google Geocoding) → vrne lat, lng → stran vpiše lat/lng v D.
2. **Uporabnik** klikne Search Places (D) → **api-debug** POST `/api/places/search` z lat, lng, radiusKm, mode, … → **places route** → **placesService.searchPlaces** (Google Nearby + Details, cache, klasifikacija store/contractor, domain quality, domainCategoryMapStores prek taxonomy) → vrne stores, contractors, domains.stores, domains.contractors, domainCategoryMapStores → stran shrani allowlist in category map v state.
3. **Uporabnik** vnese item specs in klikne Search SERP (C) → **api-debug** POST `/api/serp/search` z items, allowlistDomains (iz D), domainCategoryMap (iz D) → **serp route** (rate limit, daily cap, guardrails) → **domainStats.rankDomainsBySuccess** → **queryGen.buildPlannedQueries** (strip store names, itemSpecToCategory, resolveDomainsForItem, site:domain + keywords) → za vsako poizvedbo do maxRequests: cache ali **provider.fetchSerp** (SerpAPI) → **pickBest.pickBestCandidate** za vsak item → parsePriceFromSnippet / enrichProductPage → **recordDomainOutcome** → odgovor z results (picked produkt ali null) in plannedQueries.

Vse skupaj: **Geocode** daje lokacijo, **Places** na tej lokaciji poišče trgovine in obrtnike ter pripravi allowlist domen in category map, **SERP** s tem allowlistom in category map išče po trgovinah konkretne produkte po opisu (item spec) in vrne en najboljši match na item.
