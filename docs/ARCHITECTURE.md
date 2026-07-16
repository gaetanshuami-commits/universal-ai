# Architecture Universal AI

## Principes fondamentaux

- Architecture multi-modèles.
- OpenAI, Anthropic et Gemini sont interchangeables.
- Aucun modèle n'est directement lié à l'interface.
- Les conversations longues sont segmentées.
- Les anciens échanges sont résumés et recherchés à la demande.
- L'interface ne charge que les messages visibles.
- Les actions sensibles nécessitent une autorisation.
- Le code utilisateur est exécuté dans des environnements isolés.
- Chaque modification importante est sauvegardée et réversible.

## Modules fondamentaux

- Authentification
- Chat multi-modèles
- Historique
- Mémoire
- Projets
- Fichiers
- Recherche
- Agents
- AI Code
- Paiements
- Administration
- Observabilité

## Architecture des conversations longues

Une conversation ne sera jamais enregistrée comme un seul bloc géant.

Elle utilisera :

- messages indépendants ;
- pagination par curseur ;
- virtualisation de l'interface ;
- segments de conversation ;
- résumés hiérarchiques ;
- mémoire structurée ;
- recherche sémantique ;
- derniers messages complets ;
- pièces jointes chargées à la demande.

Cette architecture évitera les ralentissements des longues conversations.
