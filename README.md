# Selective Proxy Extension (Chrome MV3)

Extension Chrome (Manifest V3, Chrome 108+) qui active un proxy HTTP authentifié
**uniquement sur les domaines cibles**, avec authentification transparente
(aucune popup, aucune erreur ERR_TUNNEL_CONNECTION_FAILED). Tout le reste de la
navigation utilise la connexion directe de l'utilisateur.

Cas d'usage : forcer une IP sortante spécifique sur un domaine précis (accès
géo-restreint, IP de sortie maîtrisée, tests multi-régions) sans router tout le
trafic du poste.

## Pourquoi cette extension

Les extensions proxy classiques (ZeroOmega, FoxyProxy) échouent souvent à passer
l'authentification proxy sur les tunnels HTTPS en Manifest V3. Chrome exige la
permission `webRequestAuthProvider` combinée à un listener
`chrome.webRequest.onAuthRequired` en mode `asyncBlocking` pour injecter les
identifiants sur le challenge 407 du proxy. Cette extension implémente exactement
ce mécanisme, et ne répond qu'aux challenges du proxy (`details.isProxy`), jamais
aux authentifications de sites web, pour ne pas exposer les identifiants proxy à
un tiers.

## Fonctionnalités

- Routage sélectif par domaine via un PAC script dynamique (domaines cibles vers
  le proxy, tout le reste en DIRECT).
- Authentification proxy transparente (username / password), robuste à la
  suspension du service worker MV3 (lecture des identifiants depuis le storage au
  moment du challenge).
- Page d'options et popup d'état (test de connexion intégré, IP de sortie
  affichée).
- Failsafe : coupure automatique du routage sur échecs de tunnel répétés, avec
  notification, la navigation continue en direct au lieu d'être bloquée.

## Installation (mode développeur)

1. Cloner ou télécharger ce dépôt.
2. Ouvrir `chrome://extensions`, activer le "Mode développeur".
3. "Charger l'extension non empaquetée", sélectionner le dossier de l'extension.
4. Clic droit sur l'icône > Options, renseigner serveur, port, identifiants et
   domaines cibles. Enregistrer.

## Configuration

| Champ            | Exemple                     | Rôle                                  |
|------------------|-----------------------------|---------------------------------------|
| Serveur proxy    | proxy.exemple.com           | Hôte du proxy                         |
| Port             | 7777                        | Port du proxy                         |
| Identifiant      | user                        | Username d'authentification proxy     |
| Mot de passe     | ******                      | Password d'authentification proxy     |
| Domaines cibles  | example.com                 | Un par ligne, sous-domaines inclus    |

## Déploiement en parc

- Chrome Web Store en visibilité non répertoriée (installation en un clic, sans
  mode développeur).
- Force-install via console d'administration (Google Workspace, Intune, GPO) avec
  `ExtensionInstallForcelist`.

## Limites connues

- Chrome et navigateurs Chromium (Edge, Brave) avec le même paquet.
- Une seule extension peut contrôler `chrome.proxy` à la fois : désactiver les
  autres extensions proxy avant activation.
- Le proxy HTTP ne couvre pas WebRTC. Pour un besoin strict de non-exposition de
  l'IP réelle, contraindre WebRTC au niveau du navigateur
  (webRTCIPHandlingPolicy = disable_non_proxied_udp).

## Licence

MIT. Voir le fichier LICENSE.
