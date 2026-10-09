# Co-Loto

**Co-Loto** est une application web gratuite qui permet de co-créer une grille de Loto, d'Euromillions ou d'EuroDreams à plusieurs, comme dans une partie de jeu multijoueur.

> ⚠️ Co-Loto n'a **aucune affiliation** avec la Française des Jeux ([fdj.fr](https://www.fdj.fr/)). Le site ne vend aucun ticket et ne prend aucun pari : il aide seulement un groupe à choisir ensemble les numéros d'une grille.

## Principe

Chaque joueur choisit des numéros dans sa grille personnelle. Un numéro n'entre dans la grille collective que lorsque **tous** les joueurs l'ont choisi. La grille finale est donc le fruit d'un vrai consensus.

## Déroulement d'une partie

### 1. Création du salon

- Une personne lance la création d'une grille, ce qui ouvre un **salon d'attente**.
- L'accès au salon peut être :
  - **public** ;
  - **privé**, sur invitation (chat, email ou lien privé).
- Le nombre maximum de joueurs est compris entre **2 et 12** (**3 par défaut**).
- Le créateur peut indiquer, de façon optionnelle, **la date du tirage** auquel il prévoit de jouer la grille.

### 2. Lancement

Dès que **2 personnes** sont présentes dans le salon (créateur compris), le créateur peut lancer la partie.

### 3. Les tours de jeu

L'écran affiche deux grilles :

| À gauche | À droite |
|---|---|
| La **grille personnelle** du joueur | La **grille collective** |

À chaque tour :

1. Chaque joueur choisit dans sa grille personnelle un numéro qu'il n'a pas encore choisi.
2. Le tour se termine quand tous les participants ont fait leur choix.
3. Le système examine alors l'ensemble des grilles personnelles : tout numéro choisi par **tous** les joueurs (tous tours confondus) est **validé** et apparaît sur la grille collective.

### 4. Les numéros, puis les numéros complémentaires

Le jeu est choisi à la création du salon :

| Jeu | Numéros | Puis | Tirages |
|---|---|---|---|
| Loto | 5 parmi 1 à 49 | 1 numéro chance parmi 1 à 10 | lundi, mercredi, samedi |
| Euromillions | 5 parmi 1 à 50 | 2 étoiles parmi 1 à 12 | mardi, vendredi |
| EuroDreams | 6 parmi 1 à 40 | 1 numéro Dream parmi 1 à 5 | lundi, jeudi |

- Une fois que la grille collective contient tous ses numéros, la partie passe aux numéros complémentaires, selon le même principe.
- Quand le dernier numéro complémentaire est validé collectivement, **la partie est terminée**.
- Le fond de page reprend le dégradé de couleur du jeu choisi.

### 5. Après la partie

- Les joueurs jouent la grille co-créée comme ils le souhaitent : en point de vente, sur le site de la FDJ, chacun de leur côté, ou ensemble en partageant les gains.
- La grille reste consultable **30 jours** après sa création grâce à l'**URL unique** de la partie.
- Un joueur connecté retrouve toutes ses grilles dans **« Mes grilles »**, où il peut aussi modifier son pseudo et son adresse email, accepter de recevoir les résultats par email, et supprimer son compte. Un joueur qui a joué sans compte se voit proposer, à la fin de la partie, de se connecter : la grille qu'il vient de co-créer est alors ajoutée à son espace.
- Si une date de tirage a été indiquée, le résultat de la grille est évalué à la publication des résultats officiels et affiché sur la page de la grille.
- Les joueurs qui ont renseigné leur adresse email et donné leur accord peuvent **recevoir le résultat par email**.

## Fonctionnalités

- [x] Création de salon (public / privé, 2 à 12 joueurs)
- [x] Invitation par lien privé (copie du lien, email, partage depuis le téléphone)
- [x] Salle d'attente en temps réel
- [x] Grille personnelle et grille collective synchronisées
- [x] Validation des numéros par consensus
- [x] Choix du numéro chance, des étoiles ou du numéro Dream
- [x] Loto, Euromillions et EuroDreams
- [x] Page de consultation de la grille (30 jours, URL unique)
- [x] Date de tirage optionnelle (limitée aux jours de tirage du jeu)
- [x] Installable comme une application sur smartphone et tablette (PWA)
- [x] Connexion facultative (Google, Microsoft, GitHub, Discord) et page « Mes grilles »
- [ ] Vérification des résultats officiels à la date du tirage
- [ ] Envoi des résultats par email (avec consentement)

### Précisions sur les règles

- Pendant un tour, chaque joueur peut changer son choix tant que tous les joueurs n'ont pas choisi.
- Les choix des autres joueurs restent secrets : on voit seulement qui a déjà choisi.
- Si plusieurs numéros deviennent unanimes au même tour alors qu'il reste moins de places, un tirage au sort départage les candidats.
- Les choix des numéros complémentaires repartent de zéro : ils sont indépendants des numéros déjà choisis.
- Un joueur qui ferme sa page peut revenir avec le même lien (son navigateur garde un jeton). S'il reste déconnecté plus de 90 secondes, il quitte la partie et le tour continue sans lui. Si le créateur part, le rôle passe au joueur suivant.

## Stack technique

Tout est gratuit et open source :

| Élément | Choix |
|---|---|
| Serveur | [Node.js](https://nodejs.org/) 22.13 ou plus, [Express](https://expressjs.com/) |
| Temps réel | [Socket.IO](https://socket.io/) (WebSocket) |
| Base de données | SQLite, intégré à Node.js (`node:sqlite`), aucune installation |
| Interface | HTML, CSS et JavaScript sans framework ni étape de build, installable (PWA : manifeste et service worker) |
| Connexion | [openid-client](https://github.com/panva/openid-client) (OAuth 2.0 et OpenID Connect, avec PKCE), sessions stockées dans SQLite |
| Tests | Lanceur de tests intégré à Node.js (`node --test`) |
| Intégration continue | GitHub Actions |
| Hébergement | [Render](https://render.com/), offre gratuite (fichier `render.yaml`) |

Organisation du code :

```
src/game.js       Règles du jeu (sans réseau, entièrement testées)
src/app.js        Serveur HTTP, API et événements temps réel
src/store.js      Stockage des grilles terminées (SQLite, 30 jours), des comptes et des sessions
src/auth.js       Connexion Google, Microsoft, GitHub, Discord (OAuth 2.0 avec openid-client) et API « Mes grilles »
src/drawDate.js   Validation de la date de tirage
src/index.js      Point d'entrée
public/           Pages web (accueil, salon, grille, page hors ligne)
public/sw.js      Service worker (installation, copie des fichiers statiques)
test/             Tests automatisés
```

Les salons en cours vivent en mémoire du serveur ; seules les grilles terminées sont enregistrées dans SQLite.

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
| `DATABASE_FILE` | Fichier SQLite des grilles | `data/co-loto.db` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Connexion avec Google | _(désactivée)_ |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Connexion avec Microsoft | _(désactivée)_ |
| `MICROSOFT_TENANT` | Annuaire Microsoft autorisé | `common` (comptes personnels et professionnels) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Connexion avec GitHub | _(désactivée)_ |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Connexion avec Discord | _(désactivée)_ |
| `PUBLIC_URL` | Adresse publique du site, pour les URL de rappel (inutile sur Render, qui fournit `RENDER_EXTERNAL_URL`) | adresse de la requête |
| `AUTH_DEV_LOGIN` | `1` ajoute un « compte de test » sans fournisseur, pour le développement local (toujours ignoré sur Render) | _(désactivé)_ |

Un fournisseur n'apparaît que si son identifiant **et** son secret sont définis. Sans aucun, le site fonctionne sans compte, comme avant.

Pour essayer la connexion en local sans créer d'application OAuth : `AUTH_DEV_LOGIN=1 npm start`.

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
3. Donnez un nom au Blueprint (par exemple `co-loto`) et laissez la branche sur `main`. Render affiche le service web `co-loto` trouvé dans `render.yaml`, avec l'offre **Free**.
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
   | Instance Type | **Free** |

4. Dans **Environment Variables**, ajoutez `NODE_VERSION` avec la valeur `22` (Co-Loto a besoin de Node.js 22.13 ou plus).
5. Cliquez sur **Deploy Web Service**, puis attendez que le journal affiche `Co-Loto est lancé`. L'adresse publique est en haut de la page du service.

#### Connexion avec Google, Microsoft, GitHub et Discord

La connexion est facultative et chaque fournisseur s'active séparément. Pour chacun, il faut créer une « application OAuth » dans la console du fournisseur, y déclarer l'**URL de rappel** ci-dessous, puis copier l'identifiant et le secret dans les variables d'environnement du service Render (**Environment** > **Add Environment Variable**, puis **Save Changes** : Render redéploie le site).

Remplacez `https://co-loto-xxxx.onrender.com` par l'adresse réelle du site (sans `/` final) :

| Fournisseur | URL de rappel à déclarer |
|---|---|
| Google | `https://co-loto-xxxx.onrender.com/auth/google/callback` |
| Microsoft | `https://co-loto-xxxx.onrender.com/auth/microsoft/callback` |
| GitHub | `https://co-loto-xxxx.onrender.com/auth/github/callback` |
| Discord | `https://co-loto-xxxx.onrender.com/auth/discord/callback` |

Les aperçus de pull request ont une autre adresse : la connexion n'y fonctionne que si l'URL de rappel de l'aperçu est aussi déclarée (GitHub n'en accepte qu'une par application ; créez au besoin une seconde application de test).

**Google** ([console.cloud.google.com](https://console.cloud.google.com/))
1. Créez un projet (sélecteur de projet en haut, puis **Nouveau projet**).
2. Menu **API et services** > **Écran de consentement OAuth** (« Google Auth Platform ») : nom de l'application `Co-Loto`, email d'assistance, audience **Externe**, puis publiez l'application (**Audience** > **Publier l'application**) pour qu'elle soit ouverte à tous. Co-Loto ne demande que l'adresse email (`openid`, `email`) : aucune validation par Google n'est nécessaire.
3. **Clients** > **Créer un client** : type **Application Web**, ajoutez l'URL de rappel dans **URI de redirection autorisés**, puis **Créer**.
4. Copiez l'**ID client** dans `GOOGLE_CLIENT_ID` et le **code secret** dans `GOOGLE_CLIENT_SECRET`.

**Microsoft** ([entra.microsoft.com](https://entra.microsoft.com/), un compte Azure gratuit peut être demandé)
1. **Applications** > **Inscriptions d'applications** > **Nouvelle inscription**.
2. Nom `Co-Loto` ; types de comptes : **Comptes dans un annuaire organisationnel et comptes Microsoft personnels** ; URI de redirection : plateforme **Web** et l'URL de rappel. Cliquez sur **S'inscrire**.
3. Copiez l'**ID d'application (client)** dans `MICROSOFT_CLIENT_ID`.
4. **Certificats et secrets** > **Nouveau secret client** : copiez tout de suite la **Valeur** (pas l'ID) dans `MICROSOFT_CLIENT_SECRET`. Notez sa date d'expiration (24 mois au plus) : il faudra le renouveler.

**GitHub** ([github.com/settings/developers](https://github.com/settings/developers))
1. **OAuth Apps** > **New OAuth App**.
2. Application name `Co-Loto`, Homepage URL l'adresse du site, Authorization callback URL l'URL de rappel. Cliquez sur **Register application**.
3. Copiez le **Client ID** dans `GITHUB_CLIENT_ID`, puis **Generate a new client secret** et copiez-le dans `GITHUB_CLIENT_SECRET`.

**Discord** ([discord.com/developers/applications](https://discord.com/developers/applications))
1. **New Application**, nom `Co-Loto`.
2. Onglet **OAuth2** : copiez le **Client ID** dans `DISCORD_CLIENT_ID`, puis **Reset Secret** et copiez le secret dans `DISCORD_CLIENT_SECRET`.
3. Dans **Redirects**, ajoutez l'URL de rappel et enregistrez.

Co-Loto demande à chaque service l'accès à l'adresse email, pour pouvoir envoyer plus tard les résultats des grilles (uniquement avec l'accord du joueur, donné dans « Mes grilles »). Données conservées : le fournisseur, l'identifiant technique qu'il donne, l'adresse email et un pseudo (celui des parties, ou le pseudo GitHub ou Discord ; jamais les vrais nom et prénom). Le joueur modifie son pseudo et son email dans « Mes grilles », et peut y supprimer son compte. Le détail est sur la page `/confidentialite` du site.

#### Mises à jour

Chaque fusion dans `main` redéploie automatiquement le site (« Auto-Deploy », activé par défaut). Pour redéployer à la main : **Manual Deploy** puis **Deploy latest commit** sur la page du service.

#### Limites de l'offre gratuite

- **Mise en veille :** le service s'endort après 15 minutes sans visite. La visite suivante le réveille, mais le premier chargement prend alors environ une minute. Une partie en cours n'est pas concernée, puisque les joueurs restent connectés.
- **Disque éphémère :** les fichiers ne sont pas conservés lors d'un redéploiement, d'un redémarrage ou d'une mise en veille. La base SQLite des grilles terminées est donc effacée à ces moments-là, et les liens `/grille/...` ne fonctionnent plus. Les comptes, les sessions et la liste « Mes grilles » sont effacés en même temps : il faut se reconnecter, et les grilles déjà jouées ne peuvent plus être retrouvées. Les salons en cours sont aussi perdus lors d'un redéploiement.
- **Quota mensuel :** l'offre gratuite donne 750 heures d'exécution par mois et par espace de travail, de quoi faire tourner un service en continu.

Pour garder les grilles 30 jours de façon fiable, une prochaine étape sera de brancher une base gratuite hébergée (par exemple [Turso](https://turso.tech/), compatible SQLite).

## Prochaines étapes

- Récupération des résultats officiels du Loto après chaque tirage et calcul du rang de gain de chaque grille.
- Adresse email facultative avec consentement, et envoi du résultat.
- Base de données hébergée pour conserver les grilles malgré les redéploiements.

## Contribuer

Les modifications passent par une pull request vers `main`. Les tests (`npm test`) sont lancés automatiquement par GitHub Actions sur chaque pull request.

## Licence

_À définir._
