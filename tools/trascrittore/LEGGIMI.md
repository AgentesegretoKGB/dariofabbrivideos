# Trascrittore

Programma per il Mac che genera le trascrizioni dei video del catalogo che non le hanno.
Le aggiunge all'archivio del sito, e i video compaiono subito in «Cerca nelle trascrizioni».

Il programma scarica l'audio da YouTube usando la tua connessione di casa (YouTube blocca i server).
Poi lo trascrive sul Mac con Whisper, gratis e senza mandare l'audio a nessuno, e salva il risultato su GitHub.

## Installazione (una volta sola, circa 15 minuti)

1. Apri il **Terminale**: premi Cmd + Spazio, scrivi «Terminale» e premi Invio.
2. Incolla questa riga e premi Invio:

   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/AgentesegretoKGB/dariofabbrivideos/main/tools/trascrittore/installa.sh)"
   ```

3. Segui quello che compare:
   - se il Mac chiede la **password**, scrivila e premi Invio. Mentre la scrivi non si vede nulla, è normale;
   - per **GitHub** si apre il browser: accedi con l'account del sito e inserisci il codice che compare nel Terminale;
   - alla fine scarica il modello di Whisper (circa 550 MB).
4. Quando compare «✓ Installazione completata», sulla Scrivania trovi **Trascrivi video**.

## Uso

Fai doppio clic su **Trascrivi video** sulla Scrivania. La prima volta il Mac potrebbe chiedere conferma per aprirlo: scegli «Apri».

- Premi **Invio** per trascrivere **tutti** i video senza trascrizione.
- Oppure **incolla il link** di un video e premi Invio per trascrivere solo quello. Se il video ha già una trascrizione, viene rifatta e sostituita.

Ogni video viene salvato nel sito appena è pronto. Puoi chiudere la finestra quando vuoi: il lavoro fatto resta, e la volta dopo il programma riparte dai video che mancano.
Mentre lavora il Mac non va in stop, ma tienilo collegato alla corrente.

**Quanto ci mette:** dipende dal Mac. Con un Mac con chip Apple (M1, M2, M3…) servono circa 3-10 minuti per ogni ora di video. Con un Mac Intel è molto più lento.

## Se qualcosa non va

- **«YouTube non ha dato l'audio»:** riprova più tardi. Il programma aggiorna yt-dlp da solo a ogni avvio. Se il video è privato o rimosso, non si può trascrivere.
- **«Manca …»:** rilancia l'installazione con la stessa riga del punto 2. Rifà solo i passi che mancano.
- **Il testo ha qualche errore:** Whisper è molto preciso ma non perfetto, soprattutto con i nomi propri.
