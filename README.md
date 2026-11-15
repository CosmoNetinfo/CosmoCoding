# CosmoCoding

**Un workspace di sviluppo per il telefono.** Apri un repository GitHub, descrivi una modifica a GPT, Claude o Gemini e controlla il diff prima di aprire una pull request. Un modello Flutter permette di creare e compilare app installabili sullo stesso repository.

[Apri il workspace](https://vibedock-mobile.comfyblade8.chatgpt.site) · [Visita la landing](https://cosmonetinfo.github.io/CosmoCoding/)

## Scarica CosmoCoding

Gli installer del workspace e i checksum SHA-256 sono su [GitHub Releases](https://github.com/CosmoNetinfo/CosmoCoding/releases). Le app usano il workspace integrato e inviano le richieste ai servizi che colleghi con le tue credenziali.

| Sistema | Installazione dell’anteprima |
| --- | --- |
| Windows x64 | Apri il setup `.exe` non firmato. |
| macOS Apple Silicon | Monta il `.dmg` non notarizzato e trascina CosmoCoding in Applicazioni. |
| Android 8+ | Installa l’APK di anteprima e usa Android System WebView aggiornato. Se è già installata un’anteprima con un certificato diverso, disinstallala prima. |
| Ubuntu/Debian amd64 | Usa `sudo apt install ./CosmoCoding-<versione>-Linux-amd64.deb`. |

Il workflow manuale **Release CosmoCoding** compila gli installer del workspace e pubblica la prerelease su GitHub quando tutti i pacchetti sono disponibili.

## Dal prompt alla pull request

1. In **Connessioni**, aggiungi il token GitHub e apri il repository e il branch. Un repository nuovo deve avere un commit iniziale, per esempio un README.
2. Collega il provider AI che vuoi usare e seleziona fino a otto file in **File**.
3. In **Workspace**, scrivi la richiesta e scegli il modello. I file selezionati vengono inviati al provider scelto.
4. Apri i diff, scegli quali modifiche includere e crea la PR. CosmoCoding crea il commit in un branch dedicato a partire dalla versione che hai aperto.

Il modello modifica i file esistenti selezionati. Per aggiungere i file iniziali di un progetto Flutter, usa **Prepara modello Flutter** nella sezione **File**, quindi rivedi e integra la PR.

## Configurazione dei connettori

| Servizio | Cosa inserire | Accesso usato |
| --- | --- | --- |
| [GitHub](https://github.com/settings/personal-access-tokens/new) | Token personale fine-grained limitato ai repository necessari | **Contents** in lettura per esplorare il repo. **Contents** e **Pull requests** in scrittura per la PR. Aggiungi **Workflows** in scrittura per il modello Flutter e **Actions** in scrittura per avviare le build. |
| [OpenAI](https://platform.openai.com/api-keys) | Chiave API di un progetto con accesso ai modelli GPT | Elenco modelli e generazione via Responses API. |
| [Anthropic](https://platform.claude.com/settings/keys) | Chiave API Claude | Elenco modelli e generazione via Messages API. |
| [Google](https://aistudio.google.com/api-keys) | Chiave API Gemini | Elenco dei modelli e generazione. |
| [Supabase](https://supabase.com/dashboard/account/tokens) | Token Management API con accesso alla lettura dei progetti | Elenco progetti e collegamenti ai rispettivi dashboard. |

Le credenziali vengono usate dal backend per chiamare il servizio selezionato e tenute in memoria nella scheda. Ricaricare la pagina azzera la sessione. I provider AI applicano le quote e la fatturazione del proprio account API.

## Crea pacchetti installabili per il tuo progetto

Integra la PR del modello Flutter nel branch predefinito. Per avviare il workflow **Pacchetti installabili**, usa la scheda **Build** oppure **Actions** su GitHub. Apri l’esecuzione e scarica l’archivio **Artifacts** della piattaforma desiderata.

| Piattaforma | Pacchetto | Installazione |
| --- | --- | --- |
| Windows x64 | Setup `.exe` | Estrai l’archivio e apri il setup. Il file non è firmato. |
| macOS Apple Silicon | `.dmg` | Monta l’immagine e trascina l’app in Applicazioni. La notarizzazione Apple richiede un profilo Developer ID. |
| Android | `.apk` | Installa l’APK di test. Il dispositivo può richiedere il permesso di installare da quella fonte. Per aggiornamenti e pubblicazione usa una chiave di firma stabile. |
| Linux amd64 | `.deb` | Su Ubuntu/Debian compatibili esegui `sudo apt install ./vibedock-app-linux-amd64.deb`. |

I nomi, gli identificativi e le versioni del modello Flutter sono generici. Adeguarli al proprio progetto permette di generare pacchetti con l’identità dell’app.

## Avvio locale

Serve Node.js 22 o successivo. Il workspace non richiede pacchetti npm.

```sh
npm start
```

Apri [localhost sulla porta 4316](http://127.0.0.1:4316). In produzione apri l’URL HTTPS del workspace dal browser del telefono e usa l’opzione **Aggiungi alla schermata Home** o **Installa app**, se proposta dal browser.

```sh
npm run build
npm test
```

Il build produce il Worker HTTP in `dist/server/index.js`. `template.mjs` contiene il progetto Flutter inserito nei repository dal workspace. La landing statica si trova in `docs/`. Per pubblicarla, usa **Settings → Pages → Deploy from a branch**, con il branch `main` e la cartella `/docs`.

## Ambito attuale

Il workspace lavora su repository GitHub e propone modifiche a file UTF-8 di dimensioni contenute. Le build avvengono su GitHub Actions. Supabase espone l’elenco dei progetti senza eseguire SQL. La revisione e l’invio della pull request richiedono un’azione esplicita dall’interfaccia.
