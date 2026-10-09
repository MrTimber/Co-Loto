# Co-Loto

**Co-Loto** est une application web gratuite qui permet de co-créer une grille de Loto à plusieurs, comme dans une partie de jeu multijoueur.

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

### 4. Les 5 numéros, puis le numéro chance

- Une fois que la grille collective contient **5 numéros**, la partie passe au choix du **numéro chance**, selon le même principe.
- Quand un numéro chance est validé collectivement, **la partie est terminée**.

### 5. Après la partie

- Les joueurs jouent la grille co-créée comme ils le souhaitent : en point de vente, sur le site de la FDJ, chacun de leur côté, ou ensemble en partageant les gains.
- La grille reste consultable **30 jours** après sa création grâce à l'**URL unique** de la partie.
- Si une date de tirage a été indiquée, le résultat de la grille est évalué à la publication des résultats officiels et affiché sur la page de la grille.
- Les joueurs qui ont renseigné leur adresse email et donné leur accord peuvent **recevoir le résultat par email**.

## Fonctionnalités

- [x] Création de salon (public / privé, 2 à 12 joueurs)
- [x] Invitation par lien privé (copie du lien, email, partage depuis le téléphone)
- [x] Salle d'attente en temps réel
- [x] Grille personnelle et grille collective synchronisées
- [x] Validation des numéros par consensus
- [x] Choix du numéro chance
- [x] Page de consultation de la grille (30 jours, URL unique)
- [x] Date de tirage optionnelle (lundi, mercredi ou samedi)
- [ ] Vérification des résultats officiels à la date du tirage
- [ ] Envoi des résultats par email (avec consentement)

### Précisions sur les règles

- Pendant un tour, chaque joueur peut changer son choix tant que tous les joueurs n'ont pas choisi.
- Les choix des autres joueurs restent secrets : on voit seulement qui a déjà choisi.
- Si plusieurs numéros deviennent unanimes au même tour alors qu'il reste moins de places, un tirage au sort départage les candidats.
- Les choix du numéro chance repartent de zéro : ce sont des numéros de 1 à 10, indépendants des 5 numéros.
- Un joueur qui ferme sa page peut revenir avec le même lien (son navigateur garde un jeton). S'il reste déconnecté plus de 90 secondes, il quitte la partie et le tour continue sans lui. Si le créateur part, le rôle passe au joueur suivant.

## Stack technique

Tout est gratuit et open source :

| Élément | Choix |
|---|---|
| Serveur | [Node.js](https://nodejs.org/) 22.13 ou plus, [Express](https://expressjs.com/) |
| Temps réel | [Socket.IO](https://socket.io/) (WebSocket) |
| Base de données | SQLite, intégré à Node.js (`node:sqlite`), aucune installation |
| Interface | HTML, CSS et JavaScript sans framework ni étape de build |
| Tests | Lanceur de tests intégré à Node.js (`node --test`) |
| Intégration continue | GitHub Actions |
| Hébergement | [Render](https://render.com/), offre gratuite (fichier `render.yaml`) |

Organisation du code :

```
src/game.js       Règles du jeu (sans réseau, entièrement testées)
src/app.js        Serveur HTTP, API et événements temps réel
src/store.js      Stockage des grilles terminées (SQLite, 30 jours)
src/drawDate.js   Validation de la date de tirage
src/index.js      Point d'entrée
public/           Pages web (accueil, salon, grille)
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

Pour tester à plusieurs sur une seule machine, ouvrez le lien du salon dans une fenêtre de navigation privée.

### Déploiement gratuit

Sur [Render](https://render.com/), créez un « Blueprint » à partir de ce dépôt : le fichier `render.yaml` configure un service web gratuit. Limites à connaître de l'offre gratuite : le service s'endort après 15 minutes sans visite (le premier chargement prend alors quelques dizaines de secondes) et son disque n'est pas conservé lors d'un redéploiement ou d'un redémarrage, ce qui efface les grilles enregistrées. Pour garder les grilles 30 jours de façon fiable, une prochaine étape sera de brancher une base gratuite hébergée (par exemple [Turso](https://turso.tech/), compatible SQLite).

## Prochaines étapes

- Récupération des résultats officiels du Loto après chaque tirage et calcul du rang de gain de chaque grille.
- Adresse email facultative avec consentement, et envoi du résultat.
- Base de données hébergée pour conserver les grilles malgré les redéploiements.

## Contribuer

Les modifications passent par une pull request vers `main`. Les tests (`npm test`) sont lancés automatiquement par GitHub Actions sur chaque pull request.

## Licence

_À définir._
