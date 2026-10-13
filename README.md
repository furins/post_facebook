# Pubblicazioni social · IC Badia Trecenta

Applicazione web riservata al personale che possiede un indirizzo email del
dominio `icbadiatrecenta.edu.it`, pensata per preparare foto, video e testi
destinati a Facebook e Instagram.

## Funzioni

- accesso passwordless tramite magic link inviato via SMTP;
- controllo server-side del dominio prima dell'invio e al momento dell'accesso;
- link monouso con scadenza di 10 minuti e protezione dalle richieste ripetute;
- utenti, token e sessioni persistenti in SQLite;
- procedura guidata in quattro fasi, con navigazione avanti e indietro;
- caricamento facoltativo di immagini e video con drag-and-drop;
- acquisizione diretta di foto e video dalla fotocamera, quando supportata dal
  browser;
- verifica dell'orientamento uniforme delle immagini;
- rotazione, rimozione e ritaglio quadrato di tutte le immagini;
- avviso sulla possibile presenza di volti; rilevamento locale con MediaPipe
  su richiesta, marcatura manuale e sfocatura;
- scansione a riquadri per i volti piccoli nelle foto di gruppo; verifica visiva
  e marcatura manuale restano necessarie prima dell’invio;
- download delle immagini elaborate;
- valutazione sintetica e proposta di testo per Facebook e Instagram tramite
  OpenRouter, avviate automaticamente quando si entra nel confronto;
- confronto di originale e proposta in due aree modificabili, con scelta del
  testo da inviare; l’originale resta disponibile se l’AI è lenta o non funziona;
- emoji e hashtag pertinenti modificabili dall’utente, con aggiunta garantita
  di `#icbadiatrecenta` e dell’hashtag relativo al grado scolastico;
- invio del contenuto completo a un indirizzo fisso, con allegati e copia
  automatica all'utente autenticato.

Il browser esegue localmente tutte le operazioni grafiche. Titolo, testo e
preferenze editoriali vengono inviati all'endpoint OpenRouter quando si entra
nel confronto dei testi; soltanto al momento della consegna il documento completo e i media
elaborati vengono inviati al server per comporre l'email.
Se la riscrittura fallisce, titolo, testo, richiesta tecnica e risposta ricevuta
vengono inviati via email a `REWRITE_ERROR_EMAIL_TO` (predefinito:
`furins@gmail.com`) per la diagnosi. La chiave API non è inclusa.

## Configurazione

Requisiti: Node.js 20.9 o successivo, un server SMTP e un disco persistente per
SQLite.

L’acquisizione dalla fotocamera richiede un browser compatibile e un contesto
sicuro HTTPS (su `localhost` è consentita anche durante lo sviluppo).

1. Installa le dipendenze:

   ```bash
   npm install
   ```

   Il `postinstall` copia il runtime MediaPipe in `public/mediapipe` e scarica il
   modello BlazeFace in `public/models` per servirli dalla stessa applicazione.

2. Copia `.env.example` in `.env.local` e compila le variabili:

   ```dotenv
   AUTH_SECRET="una-stringa-casuale-lunga"
   AUTH_URL="http://localhost:3000"
   ALLOWED_EMAIL_DOMAIN="icbadiatrecenta.edu.it"
   DATABASE_URL="file:./data/social-lab.sqlite"

   SMTP_HOST="smtp.example.org"
   SMTP_PORT="587"
   SMTP_USER="utente-smtp"
   SMTP_PASSWORD="password-o-token-smtp"
   SMTP_FROM="Pubblicazioni social <noreply@example.org>"
   SMTP_SECURE="false"
   SMTP_STARTTLS="true"

   SUBMISSION_EMAIL_TO="redazione@example.org"
   SUBMISSION_MAX_MB="15"

   OPENROUTER_API_KEY="chiave-openrouter"
   OPENROUTER_MODEL="qwen/qwen3.7-flash"
   REWRITE_ERROR_EMAIL_TO="furins@gmail.com"
   APP_URL="http://localhost:3000"
   # Opzionale: #icbadiatrecenta e il grado scolastico sono già automatici
   MANDATORY_HASHTAGS=""
   ```

   La riscrittura usa Qwen 3.7 Flash e passa automaticamente a DeepSeek V4
   Flash Latest se OpenRouter non riesce a servire il primo modello. Se imposti
   `OPENROUTER_MODEL`, questo diventa il modello principale; DeepSeek resta il
   modello di riserva. Il ragionamento interno è disabilitato per mantenere
   breve il tempo di risposta e contenere il costo.

   Una chiave per `AUTH_SECRET` può essere generata con:

   ```bash
   openssl rand -base64 32
   ```

3. Configura SMTP secondo il servizio utilizzato:

   - porta `587`: `SMTP_SECURE=false` e `SMTP_STARTTLS=true`;
   - porta `465`: `SMTP_SECURE=true`;
   - se il server autentica tramite IP, `SMTP_USER` e `SMTP_PASSWORD` possono
     rimanere vuoti.

   Il mittente tecnico indicato in `SMTP_FROM` deve essere autorizzato dal server
   SMTP. `SUBMISSION_EMAIL_TO` è il destinatario fisso della redazione: non può
   essere cambiato dal form. L'indirizzo verificato dell'utente viene aggiunto
   automaticamente in CC. `SUBMISSION_MAX_MB` limita la somma dei file allegati
   (15 MB è un valore prudente per molti servizi email).

   Dopo aver creato `.env.local`, verifica la consegna con:

   ```bash
   npm run smtp:test -- tuo.indirizzo@example.org
   ```

4. Avvia in sviluppo:

   ```bash
   npm run dev
   ```

   Alla prima esecuzione vengono create automaticamente la directory `data` e
   le tabelle SQLite.

5. In produzione imposta `AUTH_URL` e `APP_URL` sull'indirizzo HTTPS pubblico:

   ```dotenv
   AUTH_URL="https://social.example.org"
   APP_URL="https://social.example.org"
   DATABASE_URL="file:/data/social-lab.sqlite"
   ```

   Se usi Docker, monta `/data` come volume persistente. Esegui periodicamente
   il backup del file SQLite e dei relativi file `-wal`/`-shm`, preferibilmente
   tramite gli strumenti di backup SQLite.

## Deploy con rsync su dolomiti2

Il progetto genera un'applicazione Next.js standalone e la sincronizza tramite
`rsync` su SSH. La destinazione finale predefinita è:

```text
dolomiti2:/home/dolomiti/apps/pubblicazioni-social/app
```

L'host `dolomiti2` deve essere configurato in `~/.ssh/config` e utilizzabile con
una chiave SSH o un agente. Sia la macchina locale sia quella remota devono
disporre di `rsync`. Per verificare l'accesso senza pubblicare:

```bash
ssh dolomiti2
rsync --version
```

Il deploy completo si esegue dalla radice del progetto:

```bash
make deploy
```

Il comando esegue typecheck, lint, test e build e prepara `.deploy/app` con il
runtime Node.js, gli asset statici e i modelli MediaPipe. La build viene prima
sincronizzata in `/home/dolomiti/apps/pubblicazioni-social/.deploy/app`, senza
interrompere il servizio. Completato il trasferimento, `make deploy` esegue in
sequenza i file remoti `stop`, la promozione locale dello staging verso `app`
con `rsync`, e infine `start`. In questo modo il fermo è limitato alla sola
sincronizzazione tra directory sul server.

Anche gli script `start` e `stop` sono mantenuti dal progetto e aggiornati
durante l'attivazione. `start` carica `config/production.env` tramite l'opzione
nativa `node --env-file` e avvia il runtime standalone con `node app/server.js`
su `127.0.0.1:30128`; non usa `next start`.
`stop` gestisce anche il caso in cui il processo sia già fermo o il PID file sia
obsoleto.

`better-sqlite3` include codice nativo. Durante l'attivazione lo script
`install-native` installa una copia compatibile con la GLIBC del server in una
cache versionata sotto `.native`, la inserisce nello standalone e ne verifica
il funzionamento con un database in memoria. Il download avviene soltanto al
primo deploy di ciascuna versione di `better-sqlite3`; i deploy successivi
riutilizzano la cache. L'installazione usa inizialmente `npm --ignore-scripts` e
prova `prebuild-install`. Se non esiste un binario precompilato, compila soltanto
il modulo nella stessa cache con `node-gyp`, gli header Node di sistema e
`devtoolset-11`, già disponibile sul managed server. Non usa privilegi elevati,
non installa pacchetti globali e non modifica GLIBC. Prima di sostituire un
binario diverso ne conserva una copia sotto `.native/backups`.

Durante entrambe le sincronizzazioni principali `rsync` mostra l'avanzamento
complessivo, la percentuale completata, la velocità, il tempo stimato e le
statistiche finali. L'output è espresso in unità leggibili (KB, MB e GB).

Il deploy non trasferisce `.env.local`, database SQLite, sorgenti o altri file
locali. Gli eventuali collegamenti simbolici prodotti dalla build vengono
risolti in file reali. La preparazione elimina inoltre l'eventuale cartella
`data` tracciata da Next.js e interrompe il deploy se rileva file `.env*` o
SQLite nel pacchetto. Durante la promozione vengono protetti anche eventuali
`data/` e `.env*` già presenti dentro `app`.

Ad ogni deploy viene inoltre copiato il template non riservato:

```text
/home/dolomiti/apps/pubblicazioni-social/config/production.env.example
```

Il file operativo `production.env` non viene creato né sovrascritto. Al primo
deploy puoi copiare il template sul server, rinominarlo in `production.env` e
sostituire tutti i valori `SOSTITUIRE` e gli indirizzi di esempio.

Sono disponibili anche:

```bash
make help            # mostra tutti i target
make deploy-package  # prepara il pacchetto senza collegarsi al server
make deploy-upload   # aggiorna lo staging remoto senza riavviare
make deploy-activate # promuove lo staging esistente con stop/start
make deploy-stop     # esegue il file remoto stop
make deploy-start    # esegue il file remoto start
make deploy-clean    # elimina il solo pacchetto locale
```

Host e destinazione possono essere sovrascritti senza modificare il Makefile:

```bash
make deploy \
  DEPLOY_HOST=altro-host \
  DEPLOY_BASE_DIR=/percorso/assoluto \
  DEPLOY_REMOTE_DIR=/percorso/assoluto/app \
  DEPLOY_CONFIG_DIR=/percorso/assoluto/config
```

### Configurazione del processo sul server

I file remoti `start` e `stop` si occupano rispettivamente di avviare e fermare
il processo. Il processo deve eseguire `server.js` dalla directory pubblicata,
con una configurazione analoga:

```ini
[Service]
WorkingDirectory=/home/dolomiti/apps/pubblicazioni-social/app
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=30128
EnvironmentFile=/home/dolomiti/apps/pubblicazioni-social/config/production.env
ExecStart=/usr/bin/node /home/dolomiti/apps/pubblicazioni-social/app/server.js
Restart=always
RestartSec=5
```

Nel file `production.env` inserisci le variabili descritte in `.env.example`.
Per conservare il database al di fuori dei file applicativi è consigliato:

```dotenv
DATABASE_URL="file:/home/dolomiti/apps/pubblicazioni-social/data/pubblicazioni-social.sqlite"
```

L'upload verso lo staging è incrementale: dopo il primo deploy `rsync`
trasferisce soltanto i file modificati. Se l'upload fallisce, l'applicazione
attiva non viene fermata né modificata. La fase di attivazione parte soltanto
dopo una sincronizzazione completa.
La build può quindi essere preparata su una distribuzione Linux con una GLIBC
diversa, purché architettura e versione principale di Node.js siano compatibili
con il server.

## Verifiche

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Diagnosi della revisione AI

Se la riscrittura fallisce, apri gli strumenti sviluppatore del browser, scheda
**Rete**, e seleziona la richiesta `POST /api/rewrite`. Controlla il codice HTTP,
il tipo di contenuto e la risposta. Una risposta HTML o vuota indica che un
server o proxy ha risposto al posto dell’API JSON; un errore JSON contiene di
solito il motivo e, per i problemi con OpenRouter, un `requestId`.
L’API interrompe la richiesta a OpenRouter dopo 60 secondi. Il risultato appare
appena è disponibile. Il pulsante sotto il testo originale permette di sceglierlo
anche mentre la proposta è in preparazione o se si verifica un errore.

Sul server di produzione cerca lo stesso riferimento nei log:

```bash
rg -n 'ID_MOSTRATO_NELL_ERRORE|\[rewrite\]' ~/logs/apps/pubblicazioni-social/logfile.log
```

I log della riscrittura riportano stato HTTP e tipo della risposta di OpenRouter,
oppure la causa di un errore di rete. Non registrano titolo, testo del post,
chiave API o corpo della risposta. Un HTTP 401 indica una sessione non valida;
un HTTP 503 indica la chiave OpenRouter mancante; un HTTP 502 indica un problema
nel collegamento o nella risposta di OpenRouter. Se la risposta del browser è
HTML, verifica anche i log del proxy e che la richiesta raggiunga questa app.
Le email diagnostiche contengono il testo originale, il prompt inviato a
OpenRouter e la risposta ricevuta, ma non l'header di autorizzazione. Per gli
errori HTML osservati dal browser, la risposta allegata è limitata a 50.000
caratteri. Se l'applicazione è completamente irraggiungibile, non può inviare
la segnalazione: in quel caso restano i log del proxy.

## Note operative

- Il possesso dell'indirizzo viene dimostrato aprendo il magic link ricevuto. Un
  indirizzo di un altro dominio viene rifiutato prima dell'invio e al callback.
- Sono consentiti al massimo 3 invii allo stesso indirizzo ogni 15 minuti e 12
  richieste dallo stesso IP ogni ora.
- Ogni utente può consegnare al massimo 10 contenuti all'ora. Il server convalida
  nuovamente sessione, dominio, tipi dei file, numero e dimensione degli allegati.
- SQLite è pensato per una singola istanza con filesystem persistente. Per più
  repliche o piattaforme serverless occorre passare a un database condiviso.
- Il testo generato è modificabile e copiabile. L'app invia il materiale alla
  redazione, mentre la pubblicazione sulle piattaforme social resta manuale.
- Dopo rotazione, ritaglio o sfocatura il rilevamento volti viene azzerato: è
  possibile eseguirlo di nuovo sull'immagine risultante.
