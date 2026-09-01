# Pubblicazioni social · IC Badia Trecenta

Applicazione web riservata al personale che possiede un indirizzo email del
dominio `icbadiatrecenta.edu.it`, pensata per preparare foto, video e testi
destinati a Facebook e Instagram.

## Funzioni

- accesso passwordless tramite magic link inviato via SMTP;
- controllo server-side del dominio prima dell'invio e al momento dell'accesso;
- link monouso con scadenza di 10 minuti e protezione dalle richieste ripetute;
- utenti, token e sessioni persistenti in SQLite;
- caricamento locale di immagini e video con drag-and-drop;
- verifica dell'orientamento uniforme delle immagini;
- rotazione, rimozione e ritaglio quadrato di tutte le immagini;
- rilevamento locale dei volti con MediaPipe, selezione individuale e sfocatura;
- download delle immagini elaborate;
- riscrittura del testo tramite OpenRouter e `deepseek/deepseek-v4-pro`;
- emoji, hashtag pertinenti e aggiunta garantita degli hashtag obbligatori;
- invio del contenuto completo a un indirizzo fisso, con allegati e copia
  automatica all'utente autenticato.

Il browser esegue localmente tutte le operazioni grafiche. Titolo, testo e
preferenze editoriali vengono inviati all'endpoint OpenRouter quando si usa il
pulsante AI; soltanto al momento della consegna il documento completo e i media
elaborati vengono inviati al server per comporre l'email.

## Configurazione

Requisiti: Node.js 20.9 o successivo, un server SMTP e un disco persistente per
SQLite.

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
   OPENROUTER_MODEL="deepseek/deepseek-v4-pro"
   APP_URL="http://localhost:3000"
   MANDATORY_HASHTAGS="#ICBadiaTrecenta,#Scuola"
   ```

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

## Deploy SFTP su dolomiti2

Il progetto genera un'applicazione Next.js standalone e la trasferisce tramite
il client OpenSSH `sftp`. La destinazione predefinita è:

```text
dolomiti2:/home/dolomiti/apps/pubblicazioni-social/app
```

L'host `dolomiti2` deve essere configurato in `~/.ssh/config` e utilizzabile con
una chiave SSH o un agente, perché il trasferimento batch non può chiedere una
password in modo interattivo. Per verificare l'accesso senza pubblicare:

```bash
sftp dolomiti2
```

Il deploy completo si esegue dalla radice del progetto:

```bash
make deploy
```

Il comando esegue typecheck, lint, test e build; prepara `.deploy/app` con il
runtime Node.js, gli asset statici e i modelli MediaPipe; infine genera ed
esegue un batch SFTP con percorsi espliciti. Non trasferisce `.env.local`, il
database SQLite, i sorgenti o altri file locali. Gli eventuali collegamenti
simbolici prodotti dalla build vengono risolti in file reali, perché SFTP non
deve ricrearli sul server. La preparazione elimina inoltre l'eventuale cartella
`data` tracciata da Next.js e interrompe il deploy se rileva file `.env*` o
SQLite nel pacchetto.

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
make deploy-clean    # elimina il solo pacchetto locale
```

Host e destinazione possono essere sovrascritti senza modificare il Makefile:

```bash
make deploy \
  DEPLOY_HOST=altro-host \
  DEPLOY_REMOTE_DIR=/percorso/assoluto/app \
  DEPLOY_CONFIG_DIR=/percorso/assoluto/config
```

### Configurazione del processo sul server

SFTP trasferisce i file ma non può avviare o riavviare Node.js. Il processo deve
eseguire `server.js` dalla directory pubblicata, con una configurazione analoga:

```ini
[Service]
WorkingDirectory=/home/dolomiti/apps/pubblicazioni-social/app
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
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

Il deploy carica `server.js` e `package.json` per ultimi, ma non effettua un
riavvio atomico del servizio. Dopo `make deploy` occorre quindi riavviare o
ricaricare il processo con il sistema di supervisione configurato sul server.
Poiché `better-sqlite3` contiene un modulo nativo, la macchina che esegue la
build deve usare lo stesso sistema operativo e la stessa architettura del
server di produzione (oltre a una versione compatibile di Node.js).

## Verifiche

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

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
