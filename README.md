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

## Fonctionnalités prévues

- [ ] Création de salon (public / privé, 2 à 12 joueurs)
- [ ] Invitation par lien privé, chat ou email
- [ ] Salle d'attente en temps réel
- [ ] Grille personnelle et grille collective synchronisées
- [ ] Validation des numéros par consensus
- [ ] Choix du numéro chance
- [ ] Page de consultation de la grille (30 jours, URL unique)
- [ ] Date de tirage optionnelle et vérification des résultats officiels
- [ ] Envoi des résultats par email (avec consentement)

## Stack technique

_À définir._

## Installation et lancement

_À compléter une fois la stack technique choisie._

## Contribuer

_À compléter._

## Licence

_À définir._
