# Dev-Hub Orchestrator

Questo workspace è coordinato dal **Dev-Hub** centrale (workspace `dev-hub`, IP 10.0.1.13).

## Chi è Dev-Hub
- Orchestratore centrale di tutti i progetti Fabitus/Adabù
- Gestisce task, review, deploy e coordinamento tra workspace
- Può inviare task e monitorare lo stato tramite code-bridge (http://10.0.1.1:3100)

## Convenzioni
- Usa `git config pull.ff only` per evitare warning sui pull
- Committa sempre con messaggi chiari e in inglese
- Non deployare in prod senza approvazione esplicita dell'utente
- Se ricevi modifiche da remoto (push da dev-hub), fai `git pull` prima di lavorare

## Contatti
- code-bridge: http://10.0.1.1:3100
- Workspace dev-hub: 10.0.1.13
- Coder UI: https://code.zusho.it
