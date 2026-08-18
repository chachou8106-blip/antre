# Serveur L'Antre

Un Cloudflare Worker qui donne à l'app ce qu'un navigateur ne peut pas obtenir
seul : des sources qui refusent le CORS, et un accès qui ne dépend pas des
blocages de ton opérateur.

## Ce qu'il apporte

| Source | Sans serveur | Avec serveur |
|---|---|---|
| Reddit | dépend de ton réseau, souvent bloqué | toujours joignable, avec un User-Agent que Reddit accepte |
| Fédivers (Mastodon) | impossible | hashtags publics de ta ville, sans compte |
| Flux RSS de forums | impossible (pas de CORS) | agrégés et filtrés |
| Lieux (OpenStreetMap) | possible | idem, en secours si Overpass est bloqué |

Ce qu'il **ne fait pas**, et ne fera pas : contourner une authentification.
FetLife, Instagram, Facebook et Happn restent hors de portée — leurs contenus
sont derrière un compte et leurs conditions interdisent l'accès automatisé.

## Déploiement en deux clics

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chachou8106-blip/L-antre)

Le bouton lit le `wrangler.toml` à la racine du dépôt, déploie `worker/worker.js`
sur ton compte et affiche l'adresse obtenue. Rien à copier-coller.

Ensuite, dans L'Antre : **Exclusions → Serveur L'Antre**, colle l'adresse,
**Enregistrer**, puis **Tester les sources**.

## Déploiement manuel

### Par l'interface web

1. Crée un compte sur <https://dash.cloudflare.com>.
2. **Workers & Pages** → **Create** → **Start with Hello World!** → **Deploy**.
3. **Edit code**, remplace tout le contenu par celui de `worker.js`, puis **Deploy**.
4. Copie l'adresse affichée : `https://<nom>.<compte>.workers.dev`.
5. Dans L'Antre : **Exclusions → Serveur L'Antre**, colle l'adresse, **Enregistrer**.
6. Clique **Tester les sources** : le rapport dit lesquelles répondent réellement.

### Par la ligne de commande

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler deploy
```

Le plan gratuit couvre 100 000 requêtes par jour — largement au-delà d'un usage
personnel.

## Points d'entrée

| Route | Rôle |
|---|---|
| `GET /api/search?q=&city=&lat=&lng=&radius=&sources=` | Recherche agrégée, résultats normalisés |
| `GET /api/health` | Teste chaque source et dit laquelle répond, avec son temps de réponse |
| `GET /?url=<url encodée>` | Relais simple, limité aux domaines de `ALLOWED_HOSTS` |

`/api/search` renvoie :

```json
{
  "query": "lyon bdsm",
  "results": [{ "source": "reddit", "platform": "…", "title": "…", "author": "…",
                "text": "…", "link": "…", "date": "…", "image": null }],
  "sources": [{ "id": "reddit", "status": "ok", "count": 12 }]
}
```

## Adapter les sources

Trois listes en tête de `worker.js` sont faites pour être modifiées :

- `FEDIVERSE_INSTANCES` — les instances Mastodon interrogées. Toutes ne servent
  pas leurs timelines publiques sans compte ; `/api/health` te dit lesquelles
  marchent, retire les autres.
- `RSS_FEEDS` — les flux de forums. Ces adresses changent avec le temps :
  `/api/health` signale les flux morts. Ajoute les tiens, un objet
  `{ id, url }` par flux.
- `ALLOWED_HOSTS` — les domaines que le relais accepte de transmettre. Le worker
  n'est volontairement pas un proxy ouvert.

**Ces listes n'ont pas pu être vérifiées en conditions réelles** : elles ont été
écrites d'après le fonctionnement documenté de chaque service, mais l'accès
réseau manquait au moment de l'écriture. `/api/health` existe précisément pour
que tu découvres en un clic ce qui répond chez toi, et que tu élagues.

## Vie privée

Le worker tourne sur ton compte. Il ne stocke rien, ne journalise rien au-delà
de ce que Cloudflare conserve par défaut, et ne reçoit aucun identifiant. Il
voit les termes de recherche et la ville — c'est tout, et c'est chez toi.
