# Salon Collage — Carnet fournisseurs

Application web mobile de collecte des visites au salon collage & bonding, utilisable sur Android.

## Fonctions
- Fiches fournisseur : contact, technologie/référence, intérêt et gain potentiel, prochaines actions.
- Photos des solutions et cartes de visite ; mémos vocaux.
- Classification technique facultative (quatre axes de la cartographie initiale).
- Stockage local sur le téléphone (IndexedDB), sans serveur de données.
- Export ZIP : rapport HTML pour OneNote avec photos, CSV pour Excel, médias, sauvegarde JSON.

## Utilisation sur Android
Ouvrir le site dans Chrome, menu ⋮, **Ajouter à l'écran d'accueil**.
Tester une fiche avec photo et un export ZIP avant le salon. La PWA peut être utilisée sans connexion après son installation.

## Importer dans OneNote
Au retour, exporter le rapport HTML, l'ouvrir dans Edge sur PC, imprimer en PDF puis dans OneNote professionnel > Insérer > Impression du fichier. Les mémos audio sont exportés séparément.

## Précautions
Les informations ne sont pas envoyées au serveur : la publication sur GitHub concerne **uniquement le code**, jamais les données saisies. Le stockage local peut être effacé par le navigateur ou le système : faire des sauvegardes ZIP. Vérifier la politique informatique avant tout usage professionnel.

Hébergement statique : GitHub Pages, branche `main`, dossier `/` (root).

## Plan du salon 2026 (Hall 1)
- Onglet **Plan** : saisir le numéro du stand devant soi pour déterminer la position de départ.
- Rechercher une société dans les exemples disponibles ou parmi les fiches visitées, ou saisir un numéro de stand manuellement.
- Ouvrir le plan interactif officiel de l'organisateur avec le stand cible sélectionné.
- **Je suis arrivé** : faire du stand atteint le nouveau repère ; **Créer sa fiche** : créer une visite préremplie.
- Le scan QR Android fonctionne uniquement si un code QR présent sur le stand encode un numéro exploitable. Il n'y a pas d'OCR automatique des panneaux.
- **Limite assumée** : aucun calcul automatique des chemins entre les allées ou de géolocalisation GPS précise à l'intérieur. Il faut le plan géométrique des allées et des stands pour construire une navigation façon magasin.
- Les données de visites restent stockées localement. La page officielle du salon, si ouverte, nécessite une connexion Internet.
- La liste d'exposants intégrée est volontairement partielle, sourcée depuis l'annuaire du salon le 4 novembre 2026.
