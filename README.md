# L'Antre

**L'Antre** est une PWA qui centralise tes recherches de rencontres. Tu règles tes
critères une fois, l'app construit la requête correspondante pour chaque source et
te l'ouvre. Aucun compte, aucun serveur : tout reste dans le navigateur.

---

## Comment ça marche

L'Antre est un **agrégateur de recherches**, pas un scraper.

| Source | Mode | Détail |
|---|---|---|
| Serveur L'Antre | **Direct** | Reddit, fédivers et flux de forums agrégés côté serveur, sans subir les blocages du réseau. Nécessite le worker (voir `worker/`). |
| Lieux | **Direct** | Clubs libertins, saunas et boutiques réellement présents autour de toi, via l'API Overpass (OpenStreetMap) : nom, adresse, horaires, téléphone, distance. |
| Reddit | **Direct** | Les annonces r4r publiques, via l'API JSON publique. |
| FetLife — profils | Lien | Recherche de kinksters sur ta ville et tes critères. |
| FetLife — groupes | Lien | Groupes régionaux : c'est là qu'on annonce les rencontres. |
| FetLife — événements | Lien | Soirées et munchs à venir, listés selon la ville de ton profil FetLife. |
| Forums libertins | Lien | Requête ciblée sur les forums francophones. |
| Craigslist | Lien | Section « activity partners » du site local à ta ville. |
| Recherche web | Lien | Requête généraliste construite depuis tes filtres. |
| Groupes Facebook | Lien | Recherche de groupes libertins/BDSM de ta région, là où s'organisent les soirées. |
| Instagram | Lien | Hashtag local calculé depuis tes critères et ta ville. |
| X (Twitter) | Lien | Onglet « Récent », pour les annonces qui viennent d'être publiées. |
| Happn | Lien | Ouvre l'app. Happn fonctionne par croisement de trajets : aucune recherche par mots-clés n'est possible. |

Pourquoi ce choix : une page web ne peut pas interroger un site tiers sans son
accord (politique CORS du navigateur). Les proxys publics qui contournaient ça
sont hors service, et les sites concernés interdisent l'extraction automatique.
Plutôt que d'afficher des profils inventés, L'Antre construit des liens de
recherche réels, immédiatement ouvrables.

Les liens de recherche s'affichent immédiatement, sans attendre aucune requête
réseau : une source en direct lente, filtrée ou bloquée ne peut pas retarder ni
faire disparaître le reste. La récupération Reddit dispose de 8 secondes, après
quoi elle est abandonnée et sa carte signale « récupération directe
indisponible ».

---

## Installation

### Héberger sur GitHub Pages
1. **Settings → Pages** du dépôt, branche `main`, dossier `/ (root)`, puis **Save**.
2. L'app est en ligne sur `https://<ton-compte>.github.io/l-antre/`.
3. Ouvre-la sur ton téléphone, puis **Ajouter à l'écran d'accueil**.

### En local
```bash
npx http-server -p 8080
# puis ouvrir http://127.0.0.1:8080
```
Un simple `file://` ne suffit pas : le service worker et la géolocalisation
exigent `http://localhost` ou du HTTPS.

---

## Fonctionnalités

- **Localisation** : GPS (avec conversion en nom de ville via OpenStreetMap) ou saisie manuelle.
- **Filtres** : genre, rôle BDSM, pratiques, attributs, tranche d'âge, exclusions.
- **Tri** : par date, par pertinence (nombre de mots-clés présents) ou par source.
- **Analyse d'image (option)** : MobileNet via TensorFlow.js, exécuté sur l'appareil.
- **Favoris et historique** : stockés en `localStorage`, rechargeables en un clic.
- **Hors-ligne** : service worker avec app shell en cache.

### Le moteur de recherche

Les critères ne suppriment plus de résultats : ils les **notent**. Chaque annonce
reçoit un score pondéré — ville et rôle pèsent le plus, les attributs physiques
le moins — augmenté d'un bonus de fraîcheur et d'un bonus d'intention (une
annonce qui écrit « cherche », « dispo ce soir », « MP » vaut mieux qu'une
discussion de fond). Le pourcentage affiché sur chaque carte est ce score
rapporté au maximum atteignable, et les critères trouvés sont listés en
étiquettes.

Trois modes décident du minimum exigé :

| Mode | Effet |
|---|---|
| **Large** (défaut) | Rien n'est écarté, tout est classé. À utiliser pour une première recherche. |
| **Ciblé** | Il faut au moins un critère correspondant. |
| **Strict** | Il faut un critère de chaque famille cochée. Très restrictif : une annonce réelle cite rarement les quatre. |

Restent des exclusions strictes, indépendantes du mode : annonces
professionnelles ou payantes, tranche d'âge, comptes vérifiés, annonces sans
photo, annonces de plus d'un mois.

### Le serveur (optionnel mais décisif)

Un navigateur ne peut interroger que les sites qui l'y autorisent, et subit les
blocages du réseau de l'utilisateur. Le Cloudflare Worker de `worker/` lève ces
deux limites : Reddit devient joignable quel que soit l'opérateur, et deux
sources s'ajoutent — les hashtags publics du fédivers et les flux RSS de forums.

Déploiement en deux clics :

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chachou8106-blip/L-antre)

Détails et déploiement manuel : [`worker/README.md`](worker/README.md).
Son adresse se colle dans « Exclusions → Serveur L'Antre », et le bouton
« Tester les sources » dit lesquelles répondent réellement chez toi.

Le serveur ne contourne aucune authentification : FetLife, Instagram, Facebook
et Happn restent accessibles par lien uniquement.

### FetLife

Le compte FetLife est **gratuit**, messagerie comprise : seul un badge « supporter »
est payant, et il n'ouvre aucune fonction de contact.

L'app ne peut pas afficher de profils FetLife dans ses résultats et n'essaiera
pas : le site n'a aucune API publique, tout est derrière l'authentification, et
ses CGU interdisent l'accès automatisé. Elle ouvre donc trois entrées
pré-remplies — profils, groupes, événements — que ton compte rend directement
exploitables.

Le mode d'emploi complet — profil, groupes, munchs, premier message — est dans
[`GUIDE-FETLIFE.md`](GUIDE-FETLIFE.md).

Les **groupes régionaux** sont le meilleur point d'entrée : les rencontres s'y
annoncent, et y écrire vaut mieux qu'un message froid à un profil inconnu. Pense
à renseigner ta ville dans ton profil FetLife : la page « événements » s'en sert
pour déterminer ce qu'elle t'affiche.

### Quand un réseau bloque une source

Beaucoup d'opérateurs et de DNS filtrants bloquent `reddit.com` par domaine : la
requête ne renvoie pas une erreur, elle reste pendante. L'app essaie donc
plusieurs voies d'accès jusqu'à ce que l'une réponde :

1. **ton relais personnel**, s'il est configuré ;
2. l'**accès direct** ;
3. trois **relais publics** (allorigins, corsproxy, codetabs).

La voie qui a fonctionné est retenue et essayée en premier la fois suivante. Le
tout est borné à 14 secondes : si aucune voie ne répond, la carte « lien de
recherche » prend le relais plutôt que de faire attendre.

**Ce qu'un relais public voit :** l'URL demandée, donc tes mots-clés et ta ville.
Aucun identifiant ni cookie n'y transite, mais ces requêtes passent chez un
tiers. Pour que personne ne les voie, déploie ton propre relais :
[`tools/reddit-relay.js`](tools/reddit-relay.js) est un worker Cloudflare prêt à
coller — gratuit, environ trois minutes, et il n'accepte que les domaines dont
l'app a besoin (ce n'est pas un proxy ouvert). Colle ensuite son adresse dans
« Exclusions → Relais réseau ».

### Gratuit uniquement

L'option « Gratuit uniquement » (active par défaut) écarte les sites à
abonnement, messagerie payante, cam et annuaires professionnels. Elle agit à
trois endroits :

- les résultats dont le lien pointe vers un domaine banni sont retirés ;
- les annonces qui **renvoient** vers un tel domaine le sont aussi, même si leur
  texte est irréprochable ;
- les requêtes envoyées aux moteurs embarquent des exclusions `-site:`, pour que
  ces sites ne remontent pas du tout.

La liste est modifiable dans « Exclusions → Sites bannis » : un domaine par
ligne, enregistré sur l'appareil. Tombé sur un site payant ? Ajoute-le, il
disparaît des recherches suivantes. Les grands sites libertins français à
messagerie payante y figurent d'origine — retire les lignes qui te conviennent.

### Prendre contact

L'app ne peut pas — et ne cherche pas à — envoyer des messages à ta place. Elle
ouvre les recherches dans les plateformes où tu as déjà un compte, requête
pré-remplie, et tu écris toi-même depuis ton profil.

Une précision sur Happn : il n'expose aucune API publique et sa mécanique repose
sur les trajets croisés, pas sur une recherche. Aucune application tierce ne
peut y lancer une recherche par critères — la carte se contente d'ouvrir l'app.

### À propos de l'analyse d'image

L'option « Analyse d'image » charge TensorFlow.js et MobileNet v1 (~1,3 Mo de
poids, téléchargés seulement si tu coches la case) et classe les vignettes
directement sur ton appareil — aucune image n'est envoyée nulle part.

MobileNet est entraîné sur ImageNet : il reconnaît un millier d'objets courants
(vêtement, animal, véhicule, capture d'écran…). Il sert donc à **étiqueter les
vignettes** et à **écarter celles qui ne sont pas des photos** (logos, bannières
de texte). Il ne reconnaît pas d'attributs corporels : le filtre « attributs »
reste basé sur le texte des annonces, tel que leurs auteurs l'ont écrit.

---

## Structure

```
index.html              interface
manifest.json           métadonnées PWA
service-worker.js       cache hors-ligne
styles/main.css         thème sombre, responsive
scripts/utils.js        échappement HTML, texte, dates
scripts/notifications.js  bandeaux temporaires
scripts/relay.js        voies d'accès de secours quand une source est bloquée
scripts/backend.js      dialogue avec le serveur L'Antre
scripts/blocklist.js    domaines bannis (gratuit uniquement)
scripts/filters.js      état des filtres et construction des requêtes
scripts/search-engine.js  pondération, score et modes de recherche
scripts/geolocation.js  GPS et géocodage inverse
scripts/vision.js       TensorFlow.js / MobileNet
scripts/favorites.js    favoris (localStorage)
scripts/render.js       cartes et modale
scripts/sources.js      registre des sources et recherche
scripts/history.js      historique (localStorage)
scripts/app.js          câblage de l'interface
tools/generate-icons.py régénère les icônes PNG
tools/reddit-relay.js   relais minimal (remplacé par worker/, conservé pour mémoire)
worker/worker.js        serveur d'agrégation : Reddit, fédivers, RSS, lieux
worker/README.md        déploiement du serveur
GUIDE-FETLIFE.md        comment transformer une recherche en rencontre réelle
```

---

## Personnalisation

### Ajouter une source
Ajoute une entrée dans `SOURCES` (`scripts/sources.js`) :

```js
{
  id: 'ma-source',
  name: 'Ma source',
  icon: 'fas fa-star',
  note: 'Ce que fait cette recherche.',
  searchUrl() {
    return `https://exemple.fr/recherche?q=${encodeURIComponent(buildWebQuery())}`;
  }
  // async fetchLive() { ... }  // seulement si le site autorise l'accès CORS
}
```
Puis ajoute la case correspondante dans la section « Sources » d'`index.html`.

### Modifier les filtres
Les critères sont déclarés dans `index.html` et lus par `updateFilters()`
(`scripts/filters.js`). Le tri des résultats vit dans `sortResults()`.

### Régénérer les icônes
```bash
python3 tools/generate-icons.py
```

---

## Limites connues

- **Reddit** peut refuser les requêtes non authentifiées selon le réseau ou la
  région. L'app le signale et bascule sur le lien de recherche.
- **Genre, rôle et âge** sont déduits du texte des annonces (formats `[25F]`,
  `F4M`, « dominatrice »…) : c'est une heuristique, pas une donnée déclarée.
- **Le rayon** sert à cadrer la recherche cartographique ; les annonces Reddit
  n'exposent pas de coordonnées, donc aucune distance n'est calculée.
- **Les attributs** (gros seins, tatouages…) ne filtrent pas : ils pèsent dans
  le score. Peu d'annonces écrivent ces termes littéralement, et les exiger
  vide la liste. Le mode « strict » rétablit l'exclusion.
- **Les lieux** viennent d'OpenStreetMap, donc de contributions bénévoles : la
  couverture est bonne en ville, plus clairsemée en zone rurale, et un
  établissement fermé peut y figurer encore.
- **Géolocalisation** : nécessite HTTPS et ton autorisation explicite.

---

## Vie privée et cadre légal

- Aucune donnée ne quitte l'appareil : pas de compte, pas de serveur, pas
  d'analytics. Favoris et historique vivent en `localStorage` et le lien
  « Effacer mes données » les supprime.
- L'app ne contourne aucune protection technique et n'archive aucun profil :
  elle ouvre des recherches sur les sites, qui restent seuls responsables de
  leurs contenus.
- Les annonces affichées émanent de personnes réelles. Ce sont des données
  sensibles au sens de l'article 9 du RGPD : ne les republie pas, ne les
  recoupe pas avec d'autres sources, et respecte les CGU de chaque site.

---

## Licence

Usage personnel — voir [LICENSE](LICENSE).
