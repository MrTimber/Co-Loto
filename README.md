# Co-Loto

**Co-Loto** est une application web gratuite qui permet de co-créer une grille de Loto, d'Euromillions ou d'EuroDreams à plusieurs, comme dans une partie de jeu multijoueur.

> ⚠️ Co-Loto n'a **aucune affiliation** avec la Française des Jeux ([fdj.fr](https://www.fdj.fr/)). Le site ne vend aucun ticket et ne prend aucun pari : il aide seulement un groupe à choisir ensemble les numéros d'une grille.

## Principe

Chaque joueur choisit des numéros, un par tour, sans voir les choix des autres. Un numéro n'est retenu dans la grille commune que lorsque **tous** les joueurs l'ont choisi. La grille finale est donc le fruit d'un vrai consensus.

## Déroulement d'une partie

### 1. Création du salon

- Une personne lance la création d'une grille, ce qui ouvre un **salon d'attente**.
- L'accès au salon peut être :
  - **public** ;
  - **privé**, sur invitation (chat, email ou lien privé).
- Le nombre maximum de joueurs est compris entre **2 et 12** (**12 par défaut**).
- Le créateur peut indiquer, de façon optionnelle, **la date du tirage** auquel il prévoit de jouer la grille.

### 2. Lancement

Dès que **2 personnes** sont présentes dans le salon (créateur compris), le créateur peut lancer la partie.

### 3. Les tours de jeu

L'écran affiche une grille qui réunit les choix du joueur et les numéros validés par tout le monde :

| Case | Signification |
|---|---|
| **Ce tour** | Le numéro que le joueur vient de choisir, qu'il peut encore changer |
| **Déjà choisi** | Un numéro choisi par le joueur à un tour précédent, mais pas encore par tous |
| **Validé par tous** | Un numéro choisi par tous les joueurs, retenu pour la grille commune |

Au-dessus de la grille, un bandeau indique le tour en cours, le nombre de numéros déjà validés et les joueurs qui ont déjà choisi.

À chaque tour :

1. Chaque joueur choisit dans la grille un numéro qu'il n'a pas encore choisi.
2. Le tour se termine quand tous les participants ont fait leur choix.
3. Le système examine alors les choix de chacun : tout numéro choisi par **tous** les joueurs (tous tours confondus) est **validé**. Le résultat du tour (« Fin du tour : … validé par tout le monde ! » ou « Aucun numéro validé à ce tour ») reste affiché deux secondes, avec une animation sur les numéros validés, avant le tour suivant.

### 4. Les numéros, puis les numéros complémentaires

Le jeu est choisi à la création du salon :

| Jeu | Numéros | Puis | Tirages |
|---|---|---|---|
| Loto | 5 parmi 1 à 49 | 1 numéro chance parmi 1 à 10 | lundi, mercredi, samedi |
| Euromillions | 5 parmi 1 à 50 | 2 étoiles parmi 1 à 12 | mardi, vendredi |
| EuroDreams | 6 parmi 1 à 40 | 1 numéro Dream parmi 1 à 5 | lundi, jeudi |

- Une fois que la grille contient tous ses numéros, la partie passe aux numéros complémentaires, selon le même principe. La grille n'affiche que la phase en cours : d'abord les numéros, puis les numéros complémentaires (étoiles pour l'Euromillions, gouttes pour le numéro Dream).
- Quand le dernier numéro complémentaire est validé collectivement, **la partie est terminée** et la grille co-créée s'affiche.
- Le fond de page reprend le dégradé de couleur du jeu choisi.

### 4 bis. Partie à distance (asynchrone)

À la création, le créateur choisit le mode de jeu : **en direct** (le salon et les tours décrits ci-dessus) ou **à distance**, quand les joueurs ne peuvent pas être présents en même temps.

- Le créateur choisit le jeu, le **nombre exact de joueurs** (2 à 12, lui compris, 3 par défaut), le mode (classique ou éclair, voir plus bas) et, en option, la date du tirage. Une partie à distance est toujours privée.
- Co-Loto crée **un lien unique par joueur**. Le créateur les retrouve sur la page de sa partie (son propre lien), pour les copier, les partager ou les envoyer par email, et pour relancer les retardataires.
- Chaque joueur, créateur compris, voit aussi **son propre lien** en haut de sa page, à copier ou à s'envoyer par email : sans compte, c'est le seul moyen de retrouver la partie depuis un autre appareil.
- En ouvrant son lien, chaque joueur choisit son pseudo, ou se connecte : le pseudo de son compte est alors utilisé.
- Chaque joueur **classe des numéros par ordre de préférence**, puis les numéros complémentaires, en en classant au moins un minimum :
  - **Mode classique** : assez de numéros pour que la grille soit complétée à coup sûr, quoi que choisissent les autres. Avec `n` joueurs et un jeu de `N` numéros dont `c` à trouver, chacun en classe au moins ⌈(c + (n − 1) × N) / n⌉. Au Loto : 27 numéros et 6 numéros chance à 2 joueurs, 35 et 7 à 3 joueurs, 46 et 10 à 12 joueurs.
  - **Mode éclair** : deux fois le nombre à trouver (au Loto, 10 numéros et 2 numéros chance). Si la simulation ne remplit pas la grille, les places restantes vont aux numéros classés par le plus de joueurs, puis au meilleur rang moyen, puis au plus petit. La page de la grille signale ces numéros « complétés ».
- Le joueur peut modifier son classement tant que tout le monde n'a pas répondu. Les classements des autres restent secrets : on voit seulement qui a répondu, et quand.
- Quand le dernier joueur a répondu, **la partie est simulée tour par tour** : au tour k, chaque joueur joue le k-ième numéro de son classement, et un numéro est validé dès qu'il figure dans les k premiers de chacun. Les règles sont celles du direct (numéros validés en surnombre gardés, numéros complémentaires ensuite).
- Chaque joueur connecté peut cocher « Recevoir la grille par email » (coché par défaut) : la grille lui est alors envoyée avec son lien, si son adresse email est vérifiée. Les joueurs connectés la retrouvent aussi dans « Mon espace ».
- Si un joueur ne répond pas, le créateur peut le retirer dès que 2 joueurs ont répondu : la grille est calculée sans lui. Sans réponse de tous, la partie expire à la fin des prises de jeu du tirage prévu, ou au bout de 30 jours sans date de tirage.

### Mes parties en cours

L'entrée « Mes parties en cours » du menu liste le salon en direct où l'on joue sur cet appareil (pour y revenir après être allé sur une autre page, dans les 90 secondes) et les parties à distance : celles ouvertes sur cet appareil et, pour un joueur connecté, celles de son compte. Pour chaque partie à distance : le jeu, le mode, le nombre de joueurs, qui a répondu et quand, et la date limite.

### 5. Après la partie

- Les joueurs jouent la grille co-créée comme ils le souhaitent : en point de vente, sur le site de la FDJ, chacun de leur côté, ou ensemble en partageant les gains.
- La grille reste consultable **30 jours** après sa création grâce à l'**URL unique** de la partie (`/grille/...`), que l'on peut copier ou partager depuis l'écran de fin. Elle indique à quel tour chaque numéro a été validé.
- Un joueur connecté retrouve toutes ses grilles dans **« Mon espace »**, où il voit son adresse email, peut modifier son pseudo, accepter de recevoir les résultats par email, et supprimer son compte. Un joueur qui a joué sans compte se voit proposer, à la fin de la partie, de se connecter : la grille qu'il vient de co-créer est alors ajoutée à son espace.
- Si une date de tirage a été indiquée, elle s'affiche sur la page de la grille. À terme, le résultat de la grille sera évalué à la publication des résultats officiels et affiché sur cette page, et les joueurs qui ont renseigné leur adresse email et donné leur accord le **recevront par email** (pas encore disponible, voir « Prochaines étapes »).

## Fonctionnalités

- [x] Création de salon (public / privé, 2 à 12 joueurs) et liste des salons publics sur l'accueil
- [x] Invitation par lien privé (copie du lien ; sur smartphone et tablette, menu de partage du système : SMS, WhatsApp, email… ; sinon envoi par email)
- [x] Salle d'attente en temps réel
- [x] Grille de jeu synchronisée en temps réel (ses choix et les numéros validés par tous)
- [x] Partie à distance : un lien unique par joueur, mode classique ou éclair, partie simulée, grille envoyée par email
- [x] Page « Mes parties en cours » : salon en direct de l'appareil et parties à distance
- [x] Validation des numéros par consensus
- [x] Numéros validés en surnombre : grille multiple ou grille simple, au choix
- [x] Choix du numéro chance, des étoiles ou du numéro Dream
- [x] Loto, Euromillions et EuroDreams
- [x] Page de consultation de la grille (30 jours, URL unique), partage du lien en fin de partie
- [x] Date de tirage optionnelle (limitée aux jours de tirage du jeu)
- [x] Installable comme une application sur smartphone et tablette (PWA)
- [x] Connexion facultative (Google, Microsoft, GitHub, Discord, Facebook) et page « Mon espace »
- [x] Espace d'administration : utilisateurs et leurs grilles, fréquentation du site, numéros les plus joués
- [ ] Vérification des résultats officiels à la date du tirage
- [ ] Envoi des résultats par email (avec consentement)

### Précisions sur les règles

- Pendant un tour, chaque joueur peut changer son choix tant que tous les joueurs n'ont pas choisi.
- Les choix des autres joueurs restent secrets : on voit seulement qui a déjà choisi.
- Si plusieurs numéros deviennent unanimes au même tour alors qu'il reste moins de places, ils sont **tous gardés** : la grille peut alors compter plus de numéros que prévu (par exemple 6 numéros au lieu de 5 au Loto). Le bandeau de fin de tour le signale. À la fin, chaque joueur choisit de son côté de tous les jouer en **grille multiple**, plus chère, ou d'en écarter pour jouer une **grille simple** : il touche un numéro pour l'écarter ou le reprendre, et Co-Loto affiche le nombre de combinaisons et le prix par tirage, ou prévient si la combinaison dépasse les limites du jeu. Limites des grilles multiples d'après les règlements FDJ :

  | Jeu | Numéros | Numéros complémentaires au plus |
  |---|---|---|
  | Loto | 5 ou 6 / 7 / 8 / 9 | 10 / 8 / 3 / 1 numéros chance |
  | Euromillions | 5 ou 6 / 7 / 8 / 9 / 10 | 12 / 6 / 4 / 3 / 2 étoiles |
  | EuroDreams | 6 à 8 / 9 / 10 | 5 / 3 / 1 numéros Dream |

  Prix d'une grille simple, sans option : 2,20 € au Loto, 2,50 € à l'Euromillions (My Million compris) et à EuroDreams. Co-Loto informe seulement : rien n'est parié sur le site.
- Les choix des numéros complémentaires repartent de zéro : ils sont indépendants des numéros déjà choisis.
- Un joueur qui ferme sa page peut revenir avec le même lien (son navigateur garde un jeton), ou depuis « Mes parties en cours ». S'il reste déconnecté plus de 90 secondes, il quitte la partie et le tour continue sans lui. Si le créateur part, le rôle passe au joueur suivant.

## Espace d'administration

Réservé aux administrateurs, il est accessible depuis le menu burger de l'en-tête (présent pour tout le monde : « Accueil », « Mes parties en cours », « Mon espace » une fois connecté, puis « Se connecter » ou « Se déconnecter »). Pour tout autre visiteur, ses pages, ses scripts et son API n'existent pas (erreur 404) et le menu ne contient pas d'entrées d'administration.

- **Superadmin** : il y en a un seul, désigné par la variable d'environnement `SUPERADMIN_EMAIL`. C'est le compte qui a cette adresse email (une adresse n'appartient qu'à un compte, voir « Comptes et adresses email »), **à condition qu'elle soit vérifiée**. Le compte n'a pas besoin d'exister à l'avance : il devient superadmin dès qu'il a cette adresse, vérifiée. Son rôle ne peut pas lui être retiré ; seul un changement de la variable désigne un autre superadmin.
- **Administrateurs** : le superadmin nomme ou retire les administrateurs depuis la page « Utilisateurs ». Seul un compte dont l'adresse email est vérifiée peut être nommé, et un rôle n'est effectif qu'avec une adresse vérifiée.

Pages :

| Page | Contenu |
|---|---|
| `/admin` (tableau de bord) | En ce moment, en deux zones : parties en direct (salons en attente, parties en cours, joueurs, connexions temps réel) et parties à distance (parties en attente en classique et éclair, classements reçus, joueurs attendus, parties dont la date limite tombe dans les 24 h) ; visites, parties créées, grilles co-créées, comptes, grilles par jeu et par mode de jeu (joueurs et tours en moyenne) |
| `/admin/utilisateurs` | Liste des comptes (pseudo, services de connexion liés, email, inscription, dernière connexion, rôle), recherche, grilles co-créées par chacun (avec leur mode de jeu), nomination des administrateurs |
| `/admin/frequentation` | Visiteurs et pages vues par jour (ou par semaine), grilles co-créées, pages les plus vues, sites d'origine, appareils, parties créées et grilles co-créées par jeu et par mode de jeu, inscriptions et connexions par fournisseur, sur 7 jours à 12 mois |
| `/admin/numeros` | Numéros et numéros complémentaires les plus joués pour chaque jeu, pour tous les modes de jeu ou un seul, sur une période d'un jour à un an, ou pour un tirage précis |

Les statistiques distinguent trois **modes de jeu** : *En direct* (salon tour par tour), *À distance, classique* et *À distance, éclair* (voir « Partie à distance »). Les grilles et les parties enregistrées avant l'ajout de cette distinction ont été reclassées automatiquement au démarrage.

**Mesure d'audience sans outil externe.** Le serveur compte lui-même les pages ouvertes par un navigateur (les robots et le contrôle de santé de Render sont ignorés), par jour : page, type d'appareil, site d'origine. Un visiteur est compté une fois par jour grâce à une empreinte de son adresse IP et de son navigateur, mélangée à un sel tiré au sort chaque jour ; sels et empreintes sont effacés le lendemain. Aucun cookie, aucune adresse IP n'est enregistrée, et les visites d'un jour à l'autre ne peuvent pas être reliées.

**Statistiques des numéros.** À la fin de chaque partie, les numéros de la grille sont aussi copiés, avec le jeu, la date de tirage, le nombre de joueurs et de tours, mais **sans les pseudos ni aucun lien vers la grille ou les joueurs**. Cette copie est gardée 3 ans, alors que la grille et ses joueurs sont effacés au bout de 30 jours. Chaque grille y est comptée pour un tirage : la date de tirage prévue si le créateur l'a indiquée, sinon le prochain tirage du jeu au moment où la grille est terminée (celui du jour jusqu'à la fin des prises de jeu : 20 h 15 pour le Loto et l'Euromillions, 20 h pour EuroDreams, heure de Paris). Les compteurs de fréquentation sont aussi gardés 3 ans.

## Stack technique

Tout est gratuit et open source :

| Élément | Choix |
|---|---|
| Serveur | [Node.js](https://nodejs.org/) 22.13 ou plus, [Express](https://expressjs.com/) |
| Temps réel | [Socket.IO](https://socket.io/) (WebSocket) |
| Base de données | [Turso](https://turso.tech/) (SQLite hébergé, offre gratuite) en production, fichier SQLite local sinon, via le client officiel [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) |
| Interface | HTML, CSS et JavaScript sans framework ni étape de build, installable (PWA : manifeste et service worker) |
| Connexion | [openid-client](https://github.com/panva/openid-client) (OAuth 2.0 et OpenID Connect, avec PKCE), sessions stockées dans la base |
| Tests | Lanceur de tests intégré à Node.js (`node --test`) |
| Intégration continue | GitHub Actions |
| Hébergement | [Render](https://render.com/), offre gratuite (fichier `render.yaml`) |

Organisation du code :

```
src/games.js      Description des jeux (numéros, jours de tirage, grilles multiples et prix), aussi servie au navigateur
src/game.js       Règles du jeu (sans réseau, entièrement testées)
src/async.js      Règles des parties à distance : classements et simulation (sans réseau, testées)
src/asyncGames.js API des parties à distance (création, classement, retrait d'un joueur, parties en cours)
src/app.js        Serveur HTTP, API et événements temps réel
src/store.js      Stockage des grilles terminées (30 jours), des comptes et des sessions (Turso ou fichier SQLite)
src/auth.js       Connexion Google, Microsoft, GitHub, Discord, Facebook (OAuth 2.0 avec openid-client) et API « Mon espace »
src/admin.js      Espace d'administration : pages et API réservées aux administrateurs
src/mail.js       Envoi des emails (SMTP) : codes de connexion, vérification d'adresse
src/stats.js      Mesure d'audience (pages vues, visiteurs du jour, appareils, sites d'origine)
src/drawDate.js   Validation de la date de tirage
src/index.js      Point d'entrée
public/           Pages web (accueil, salon, partie à distance, « Mes parties en cours », grille, connexion, « Mon espace », confidentialité, page hors ligne)
public/js/        Scripts des pages (modules JavaScript)
public/sw.js      Service worker (installation, copie des fichiers statiques)
admin/            Page et scripts de l'administration, servis seulement aux administrateurs
test/             Tests automatisés
```

Les salons en direct vivent en mémoire du serveur ; seules les grilles terminées sont enregistrées dans la base. Les parties à distance, qui durent plusieurs jours, y sont enregistrées dès leur création.

## Installation et lancement

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # relance automatique à chaque modification
npm test         # tests automatisés
```

Variables d'environnement facultatives :

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port HTTP | `3000` |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Base Turso (URL `libsql://...` et jeton d'accès). Utilisée seulement si les deux sont définies | _(fichier local)_ |
| `DATABASE_FILE` | Fichier SQLite local, utilisé sans Turso | `data/co-loto.db` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Connexion avec Google | _(désactivée)_ |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Connexion avec Microsoft | _(désactivée)_ |
| `MICROSOFT_TENANT` | Annuaire Microsoft autorisé | `common` (comptes personnels et professionnels) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Connexion avec GitHub | _(désactivée)_ |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Connexion avec Discord | _(désactivée)_ |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Connexion avec Facebook | _(désactivée)_ |
| `PUBLIC_URL` | Adresse publique du site, pour les URL de rappel de la connexion : `https://co-loto.com` en production (indispensable avec un nom de domaine personnalisé) | `RENDER_EXTERNAL_URL` sur Render (adresse `…onrender.com`), sinon adresse de la requête |
| `SUPERADMIN_EMAIL` | Adresse email du superadmin de l'espace d'administration (voir « Espace d'administration ») | _(aucun administrateur)_ |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE` | Serveur SMTP pour envoyer les codes de connexion et les liens de vérification d'adresse (voir « Envoi des emails ») | _(emails affichés dans le journal en local, indisponibles sur Render)_ |
| `AUTH_DEV_LOGIN` | `1` ajoute un « compte de test » sans fournisseur, pour le développement local (toujours ignoré sur Render, avec `NODE_ENV=production` et avec la base Turso, car il permet de se connecter avec l'adresse du superadmin) | _(désactivé)_ |

Un fournisseur n'apparaît que si son identifiant **et** son secret sont définis. Sans aucun, le site fonctionne sans compte, comme avant.

Pour essayer la connexion en local sans créer d'application OAuth : `AUTH_DEV_LOGIN=1 npm start`.

Pour essayer l'espace d'administration en local : `AUTH_DEV_LOGIN=1 SUPERADMIN_EMAIL=moi@example.com npm start`, puis ouvrez `http://localhost:3000/auth/dev?nom=Moi&email=moi@example.com` (l'adresse du compte de test compte comme vérifiée ; ajoutez `&verifiee=0` pour simuler une adresse non vérifiée : le code ou le lien de vérification s'affiche alors dans le journal du serveur).

Pour tester à plusieurs sur une seule machine, ouvrez le lien du salon dans une fenêtre de navigation privée.

### Installer Co-Loto sur smartphone ou tablette

Co-Loto est une application web progressive (PWA) : une fois le site ouvert, on peut l'ajouter à l'écran d'accueil et il s'ouvre ensuite en plein écran, comme une application. Il faut que le site soit servi en HTTPS (c'est le cas sur Render).

- **Android (Chrome, Edge, Samsung Internet)** : ouvrir le site, puis menu ⋮ > « Installer l'application » (ou « Ajouter à l'écran d'accueil »). Chrome peut aussi proposer l'installation directement.
- **iPhone et iPad (Safari)** : ouvrir le site, toucher le bouton Partager, puis « Sur l'écran d'accueil ».
- **Ordinateur (Chrome, Edge)** : cliquer sur l'icône d'installation dans la barre d'adresse.

Le jeu se joue en temps réel, une connexion à Internet reste nécessaire ; sans réseau, l'application affiche une page « hors ligne ».

### Déploiement gratuit sur Render

[Render](https://render.com/) héberge gratuitement le site, WebSocket compris.

**Préalable :** créez un compte sur [dashboard.render.com](https://dashboard.render.com/) en vous connectant avec GitHub, puis autorisez Render à accéder au dépôt `Co-Loto` (Render le propose au premier déploiement ; vous pouvez choisir « Only select repositories » et ne cocher que ce dépôt).

#### Option 1 : avec le Blueprint (recommandé)

Le fichier [`render.yaml`](render.yaml) du dépôt décrit déjà toute la configuration.

1. Dans le tableau de bord Render, cliquez sur **New** puis **Blueprint**. Avec un compte tout neuf, Render ouvre d'abord l'assistant « Create a new Service », qui ne propose pas le Blueprint : cliquez sur **Skip** pour revenir au tableau de bord, où le bouton **New** est disponible.
2. Choisissez le dépôt `MrTimber/Co-Loto` dans la liste (cliquez sur **Connect**).
3. Donnez un nom au Blueprint (par exemple `co-loto`) et laissez la branche sur `main`. Render affiche le service web `co-loto` trouvé dans `render.yaml`, avec l'offre **Free** et la région **Frankfurt**.
4. Vérifiez la liste des ressources que Render va créer, puis cliquez sur **Deploy Blueprint**. Render installe les dépendances et démarre le site en quelques minutes.
5. Ouvrez le service `co-loto` : son adresse publique s'affiche en haut de la page, sous la forme `https://co-loto-xxxx.onrender.com`. C'est l'adresse à partager.

#### Option 2 : créer le service web à la main

1. Dans le tableau de bord Render, cliquez sur **New** puis **Web Service**.
2. Choisissez **Git Provider**, puis le dépôt `MrTimber/Co-Loto` (cliquez sur **Connect**).
3. Remplissez le formulaire :

   | Champ | Valeur |
   |---|---|
   | Name | `co-loto` |
   | Language | `Node` |
   | Branch | `main` |
   | Root Directory | _(laisser vide)_ |
   | Build Command | `npm ci --omit=dev` |
   | Start Command | `npm start` |
   | Region | **Frankfurt (EU Central)** |
   | Instance Type | **Free** |

4. Dans **Environment Variables**, ajoutez `NODE_VERSION` avec la valeur `22` (Co-Loto a besoin de Node.js 22.13 ou plus).
5. Cliquez sur **Deploy Web Service**, puis attendez que le journal affiche `Co-Loto est lancé`. L'adresse publique est en haut de la page du service.

#### Connexion avec Google, Microsoft, GitHub, Discord et Facebook

La connexion est facultative et chaque fournisseur s'active séparément. Pour chacun, il faut créer une « application OAuth » dans la console du fournisseur, y déclarer l'**URL de rappel** ci-dessous, puis copier l'identifiant et le secret dans les variables d'environnement du service Render (**Environment** > **Add Environment Variable**, puis **Save Changes** : Render redéploie le site).

Commencez par définir `PUBLIC_URL` = `https://co-loto.com` (sans `/` final) dans Render. Sans elle, le site annonce aux fournisseurs l'adresse `…onrender.com` fournie par Render : le joueur y revient sans le cookie posé sur co-loto.com, et la connexion échoue à chaque fois. Pour la même raison, `www.co-loto.com` doit rediriger vers `co-loto.com` (comportement par défaut de Render quand les deux domaines sont ajoutés dans **Settings** > **Custom Domains**).

URL de rappel à déclarer chez chaque fournisseur, recopiée exactement :

| Fournisseur | URL de rappel à déclarer |
|---|---|
| Google | `https://co-loto.com/auth/google/callback` |
| Microsoft | `https://co-loto.com/auth/microsoft/callback` |
| GitHub | `https://co-loto.com/auth/github/callback` |
| Discord | `https://co-loto.com/auth/discord/callback` |
| Facebook | `https://co-loto.com/auth/facebook/callback` |

Les aperçus de pull request ont une autre adresse : la connexion n'y fonctionne que si l'URL de rappel de l'aperçu est aussi déclarée (GitHub n'en accepte qu'une par application ; créez au besoin une seconde application de test).

**Google** ([console.cloud.google.com](https://console.cloud.google.com/))
1. Créez un projet (sélecteur de projet en haut, puis **Nouveau projet**).
2. Menu **API et services** > **Écran de consentement OAuth** (« Google Auth Platform ») : nom de l'application `Co-Loto`, email d'assistance, audience **Externe**, puis publiez l'application (**Audience** > **Publier l'application**) pour qu'elle soit ouverte à tous. Co-Loto ne demande que l'adresse email (`openid`, `email`) : aucune validation par Google n'est nécessaire, à condition de ne pas ajouter de logo (un logo déclenche une vérification de la marque, qui prend plusieurs jours).
3. **Clients** > **Créer un client** : type **Application Web**, ajoutez l'URL de rappel dans **URI de redirection autorisés**, puis **Créer**.
4. Copiez l'**ID client** dans `GOOGLE_CLIENT_ID` et le **code secret** dans `GOOGLE_CLIENT_SECRET`.

**Microsoft** ([entra.microsoft.com](https://entra.microsoft.com/), un compte Azure gratuit peut être demandé)
1. **Applications** > **Inscriptions d'applications** > **Nouvelle inscription**.
2. Nom `Co-Loto` ; types de comptes : **Comptes dans un annuaire organisationnel et comptes Microsoft personnels** ; URI de redirection : plateforme **Web** et l'URL de rappel. Cliquez sur **S'inscrire**.
3. Copiez l'**ID d'application (client)** dans `MICROSOFT_CLIENT_ID`.
4. **Certificats et secrets** > **Nouveau secret client** : copiez tout de suite la **Valeur** (pas l'ID du secret, erreur fréquente) dans `MICROSOFT_CLIENT_SECRET`. Notez sa date d'expiration (24 mois au plus) : il faudra le renouveler.

**GitHub** ([github.com/settings/developers](https://github.com/settings/developers))
1. **OAuth Apps** > **New OAuth App**.
2. Application name `Co-Loto`, Homepage URL l'adresse du site, Authorization callback URL l'URL de rappel. Cliquez sur **Register application**.
3. Copiez le **Client ID** dans `GITHUB_CLIENT_ID`, puis **Generate a new client secret** et copiez-le dans `GITHUB_CLIENT_SECRET`.

**Discord** ([discord.com/developers/applications](https://discord.com/developers/applications))
1. **New Application**, nom `Co-Loto`.
2. Onglet **OAuth2** : copiez le **Client ID** dans `DISCORD_CLIENT_ID`, puis **Reset Secret** et copiez le secret dans `DISCORD_CLIENT_SECRET`.
3. Dans **Redirects**, ajoutez l'URL de rappel et enregistrez.

**Facebook** ([developers.facebook.com/apps](https://developers.facebook.com/apps), avec un compte Facebook)
1. **Créer une app**, cas d'usage **Authentifier et demander des données aux utilisateurs avec Facebook Login**, puis nom `Co-Loto` et email de contact.
2. **Cas d'usage** > **Personnaliser** : vérifiez que l'autorisation **email** est ajoutée (en plus de `public_profile`).
3. **Facebook Login** > **Paramètres** : dans **URI de redirection OAuth valides**, ajoutez l'URL de rappel et enregistrez.
4. **Paramètres de l'app** > **Général** : renseignez l'URL de la politique de confidentialité (`https://co-loto.com/confidentialite`) et, pour la suppression des données, la même page (elle explique comment supprimer son compte depuis « Mon espace »). Copiez l'**ID de l'app** dans `FACEBOOK_CLIENT_ID` et la **clé secrète** dans `FACEBOOK_CLIENT_SECRET`.
5. Passez l'app du mode **Développement** au mode **Live** (en haut de la page) : sans cela, seuls les administrateurs de l'app peuvent se connecter. Les autorisations `email` et `public_profile` ne demandent pas d'examen par Meta.

Co-Loto demande à chaque service l'accès à l'adresse email, pour pouvoir envoyer plus tard les résultats des grilles (uniquement avec l'accord du joueur, donné dans « Mon espace »). Données conservées : le fournisseur, l'identifiant technique qu'il donne, l'adresse email et un pseudo (celui des parties, ou le pseudo GitHub ou Discord ; jamais les vrais nom et prénom). Le joueur modifie son pseudo dans « Mon espace », et peut y supprimer son compte.

#### Comptes et adresses email

- **Un compte par adresse.** L'adresse email vient toujours du service de connexion et identifie le compte : elle ne se modifie pas dans « Mon espace », qui l'affiche avec un badge **Vérifiée** ou **Non vérifiée**.
- **Adresse vérifiée par le service** (Google ; Microsoft pour les comptes personnels ; GitHub et Discord quand l'adresse est confirmée chez eux ; Facebook) : si un compte a déjà cette adresse vérifiée, le service y est lié et le joueur arrive sur ce compte.
- **Adresse non vérifiée par le service** (compte Microsoft professionnel, adresse non confirmée chez GitHub ou Discord) : si un compte a déjà cette adresse, un **code à 6 chiffres** est envoyé à cette adresse et le joueur doit le saisir pour terminer la connexion (15 minutes, 5 essais). Sinon, un compte est créé avec l'adresse marquée **Non vérifiée**.
- **Vérifier son adresse** : dans « Mon espace », le bouton « Vérifier mon adresse » envoie un lien valable 24 heures. Une adresse vérifiée est nécessaire pour être administrateur et pour recevoir les résultats par email.
- **Compte existant à l'adresse non vérifiée** : le joueur qui prouve posséder l'adresse (service qui l'a vérifiée, ou code reçu) arrive sur ce compte, dont l'adresse devient vérifiée et dont le pseudo devient le sien. Les autres services liés au compte et ses sessions ouvertes sont retirés : si quelqu'un avait utilisé cette adresse sans en être le propriétaire, il n'y a plus accès (il lui faudrait un service qui l'a vérifiée, ou le code). Si le compte a des grilles, « Mon espace » prévient que certaines peuvent ne pas être les siennes ; le bouton « Retirer » de chaque grille la détache du compte.
- Un joueur connecté peut lier un autre service depuis « Mon espace » ; un compte sans adresse reçoit ainsi celle du service.
- Au premier démarrage de cette version, les comptes qui partagent une adresse vérifiée sont fusionnés dans le plus ancien (services, grilles et rôle compris) ; les comptes qui avaient cette adresse sans l'avoir vérifiée y laissent leurs grilles (avec l'avertissement ci-dessus), mais pas leurs services ni leurs sessions. Si aucun compte ne l'a vérifiée, seul le plus ancien garde l'adresse.

#### Envoi des emails (SMTP)

Les codes de connexion, les liens de vérification et les grilles des parties à distance sont envoyés par un serveur SMTP, celui d'un service d'envoi d'emails (par exemple [Brevo](https://www.brevo.com/fr/), dont l'offre gratuite suffit, Mailjet ou Mailgun) ou de votre messagerie. Ajoutez dans Render :

| Variable | Rôle | Exemple |
|---|---|---|
| `SMTP_HOST` | Serveur SMTP | `smtp-relay.brevo.com` |
| `SMTP_PORT` | Port : `587` (STARTTLS, exigé), `465` (TLS) ou `2525` | `587` |
| `SMTP_USER` | Identifiant SMTP | fourni par le service |
| `SMTP_PASSWORD` | Mot de passe ou clé SMTP | fourni par le service |
| `SMTP_FROM` | Expéditeur des emails, d'une adresse ou d'un domaine validé chez le service | `Co-Loto <noreply@co-loto.com>` |
| `SMTP_SECURE` | Facultatif : `true` pour forcer TLS dès la connexion | `true` si le port est `465` |

Pour que les emails n'arrivent pas en courrier indésirable, validez le domaine `co-loto.com` chez le service d'envoi (enregistrements SPF et DKIM à ajouter chez le registraire du domaine). Si l'hébergeur bloque les ports SMTP habituels, utilisez le port `2525`, proposé par la plupart des services d'envoi.

Sans `SMTP_HOST`, les emails sont affichés dans le journal du serveur en local ; sur Render, l'envoi est indisponible : le bouton « Vérifier mon adresse » n'apparaît pas, et une connexion qui demande un code est refusée avec un message.

#### Espace d'administration

Dans Render, ajoutez la variable `SUPERADMIN_EMAIL` avec votre adresse email (**Environment** > **Add Environment Variable**, puis **Save Changes**). Connectez-vous ensuite sur le site avec un service qui fournit cette adresse ; si elle n'est pas vérifiée par le service, vérifiez-la depuis « Mon espace » (l'envoi des emails doit être configuré, voir plus haut). Le menu burger affiche alors les entrées de l'administration.

#### Base de données Turso (conserver les grilles)

Le disque de l'offre gratuite de Render est effacé à chaque redéploiement ou mise en veille (voir plus bas). Pour que les grilles, les comptes et « Mon espace » soient conservés, Co-Loto utilise une base [Turso](https://turso.tech/) gratuite (SQLite hébergé) dès que ses deux variables sont définies :

1. Sur [app.turso.tech](https://app.turso.tech/), créez une base (**Create Database**), par exemple `co-loto`, dans la région la plus proche de celle du service Render : **Europe (Ireland)** pour un service à Francfort, comme celui décrit par `render.yaml`.
2. Sur la page de la base, copiez son **URL** (de la forme `libsql://co-loto-xxxx.turso.io`), puis cliquez sur **Create Token** et copiez le jeton (lecture et écriture, sans date d'expiration ou avec une date lointaine).
3. Dans Render, page du service > **Environment** > **Add Environment Variable** : ajoutez `TURSO_DATABASE_URL` avec l'URL et `TURSO_AUTH_TOKEN` avec le jeton, puis **Save Changes**. Render redéploie le site.

Les tables sont créées au premier démarrage. Le journal du service indique alors « base Turso » au lancement. Le jeton donne accès à toute la base : ne le mettez jamais dans le code ni dans un message. S'il a fuité, révoquez-le dans Turso et créez-en un autre.

Sans ces variables (en local, dans les tests), Co-Loto utilise le fichier `data/co-loto.db`.

#### Mises à jour

Chaque fusion dans `main` redéploie automatiquement le site (« Auto-Deploy », activé par défaut). Pour redéployer à la main : **Manual Deploy** puis **Deploy latest commit** sur la page du service.

#### Limites de l'offre gratuite

- **Mise en veille :** le service s'endort après 15 minutes sans visite. La visite suivante le réveille, mais le premier chargement prend alors environ une minute. Une partie en cours n'est pas concernée, puisque les joueurs restent connectés.
- **Disque éphémère :** les fichiers ne sont pas conservés lors d'un redéploiement, d'un redémarrage ou d'une mise en veille. Sans base Turso, le fichier SQLite des grilles terminées est donc effacé à ces moments-là, et les liens `/grille/...` ne fonctionnent plus ; les comptes, les sessions et la liste « Mon espace » aussi. Avec Turso (voir plus haut), tout cela est conservé. Les salons en cours restent perdus lors d'un redéploiement, puisqu'ils vivent en mémoire.
- **Quota mensuel :** l'offre gratuite donne 750 heures d'exécution par mois et par espace de travail, de quoi faire tourner un service en continu.

## Prochaines étapes

- Récupération des résultats officiels du Loto, de l'Euromillions et d'EuroDreams après chaque tirage, et calcul du rang de gain de chaque grille.
- Envoi du résultat par email aux joueurs qui l'ont accepté dans « Mon espace » (l'adresse et l'accord sont déjà enregistrés).

## Contribuer

Les modifications passent par une pull request vers `main`. Les tests (`npm test`) sont lancés automatiquement par GitHub Actions sur chaque pull request.

## Licence

_À définir._
