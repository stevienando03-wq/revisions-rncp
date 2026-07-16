# Révision RNCP — Finance d'entreprise (PWA)

Application de révision **100 % hors-ligne** pour préparer le titre **RNCP Expert en finance d'entreprise** (niveau 7).
Elle réunit, par module, **la lecture du cours** et **l'entraînement aux QCM**. L'examen réel étant **open-book** (ressources + IA autorisées, cas à traiter), l'app entraîne la **compréhension des concepts et la méthode** — pas le par-cœur.

## Ce que fait l'app

- **Tableau de bord** : jauge de **maîtrise globale** (seuil 70 % visible), progression par module (% lu + % réussite), coach, série de jours 🔥, objectif quotidien, module recommandé.
- **Cours** (12 modules), chacun en deux couches :
  - **Essentiel** : à retenir (flashcards), chiffres & formules clés, pièges.
  - **Cours complet** : sections détaillées, **visuels** (tableaux comparatifs, schémas, pyramides), sommaire, ancres, reprise de lecture, **mini-quiz « Teste-toi »** par section.
- **Entraînement** : drill par module, **examen blanc** (60 questions tirées dans tous les modules, chrono, score + maîtrise par module), révision des **erreurs** (répétition espacée), **flashcards**, favoris, stats.
- **Chaque QCM** explique pourquoi la bonne réponse est juste **et** pourquoi chaque mauvaise option est fausse, avec **« Revoir dans le cours »**.
- **Recherche plein texte**, mode sombre, taille de texte réglable, export/import de la progression.
- **Installable** iPhone / Android, **hors-ligne** après le 1er chargement. Progression sur l'appareil (`localStorage`).

## Les 12 modules

1. Méthode & jour J (open-book) · 2. Stratégie & rentabilité financière · 3. Choix d'investissement (VAN/TIR) · 4. Politique de financement (CMPC, plan de financement) · 5. Trésorerie & prévisionnel pluriannuel · 6. Budget & plan de trésorerie · 7. Gestion de portefeuille & marchés · 8. Gestion obligataire · 9. Évaluation & diagnostic financier · 10. Normes IFRS · 11. Reporting & gestion des risques · 12. Contrôle de gestion & management (OVAR).

## Lancer en local

Site statique → le servir par HTTP (le service worker ne marche pas en `file://`) :

```bash
cd RNCP-Revision
python -m http.server 8000
```
Puis ouvre `http://localhost:8000`.

## Publier sur GitHub Pages

Depuis le dossier `RNCP-Revision` :

```bash
git init
git add .
git commit -m "App de révision RNCP"
git branch -M main
git remote add origin https://github.com/<TON-PSEUDO>/revisions-rncp.git
git push -u origin main
```
Puis : **Settings → Pages → Source : Deploy from a branch → Branch : `main` / `/ (root)` → Save**. En ligne sur `https://<TON-PSEUDO>.github.io/revisions-rncp/`.

## Installer sur le téléphone

- **iPhone (Safari)** : URL → **Partager** → **Sur l'écran d'accueil**.
- **Android (Chrome)** : URL → menu **⋮** → **Installer l'application**.

## Mettre à jour le contenu

Tout le contenu est dans **`content.json`** (les 12 modules `_modules/m*.json` sont la sauvegarde source). Après modification, incrémente la version du cache dans `sw.js` (`rncp-rev-v1` → `rncp-rev-v2`).

## Structure

```
RNCP-Revision/
├── index.html          # coquille de l'app
├── styles.css          # charte (bleu nuit / ivoire / anthracite)
├── app.js              # logique : routeur, cours, QCM, score global, examen, persistance
├── content.json        # tout le contenu (cours + banque QCM)
├── _modules/           # sauvegarde des 12 modules (source de content.json)
├── manifest.json       # PWA (installable)
├── sw.js               # service worker (hors-ligne)
└── icons/              # icônes 192 / 512 / maskable
```

## Avertissement

Le contenu est issu de **tes propres fiches et du référentiel RNCP37421**. Les questions entraînent la **compréhension** ; l'examen réel est open-book et porte sur des **études de cas**. Vérifie toujours les chiffres d'actualité (cours de bourse, indices) dans tes sources le jour J.
