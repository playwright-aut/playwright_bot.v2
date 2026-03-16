# CRM-BOT-MAIL INSTALLER

Ez a csomag egy teljesen új Mac gépre telepíti a CRM-BOT-MAIL rendszert.

A rendszer az Outlook Web `VU3 Leads` mappáját figyeli, felismeri az új lead értesítéseket, majd a CRM rendszerben automatikusan feldolgozza őket.

## Fő működés

1. Outlook figyelés
2. új lead felismerése
3. lead azonosító / link kinyerése
4. CRM megnyitása
5. státuszok beállítása:
   - ASSIGNED
   - IN_PROCESS
6. ügyféladatok kiolvasása
7. push értesítés küldése
8. e-mail olvasottra állítása

## Telepítés

1. Csomag kibontása:

    unzip crm-bot-mail-installer-release.zip

2. Belépés a mappába:

    cd crm-bot-mail-installer

3. Telepítő futtatása:

    ./install.sh

## A telepítő mit csinál

- ellenőrzi a Node.js és npm jelenlétét
- létrehozza a célmappát
- bemásolja a rendszerfájlokat
- létrehozza a szükséges runtime mappákat
- bekéri a szükséges belépési adatokat
- létrehozza a `.env` fájlt
- futtatja az `npm install` parancsot
- telepíti a Playwright Chromium-ot
- telepíti a `vu3mail` CLI parancsot

## Bekért adatok

### CRM
- CRM felhasználónév
- CRM jelszó

### Outlook
- Outlook e-mail / felhasználó
- Outlook jelszó

### Push értesítés
- Pushover token
- Pushover user key

## Elérhető parancsok

### Bot indítása
    vu3mail on

### Bot leállítása
    vu3mail off

### Állapot lekérdezése
    vu3mail status

### Bot újraindítása
    vu3mail restart

### CRM automata megnyitása, Enterre zár
    vu3mail crm-open

### Outlook automata megnyitása, Enterre zár
    vu3mail outlook-open

### Kihagyott leadek kezelése
    vu3mail miss

### Súgó
    vu3mail help

## Runtime mappák

A rendszer működés közben ezeket a mappákat használja:

- `debug`
- `state`
- `VU3MailQueue`
- `VU3MailQueueProcessed`
- `VU3MailQueueBlocked`
- `VU3MailMiss`

## Fontos megjegyzés

A Playwright profilok és a futási logok nem részei a telepíthető core csomagnak. Ezek működés közben automatikusan jönnek létre.

A rendszer úgy van kialakítva, hogy a `vu3mail off` után a Playwright profilokat törli, így a következő indulás tiszta állapotból történik.

## Hiba esetén

Állapot ellenőrzése:

    vu3mail status

Ha a bot szándékosan le volt állítva, és közben leadek érkeztek, indulás előtt rendezni kell a kihagyott leadeket:

    vu3mail miss

## Projekt célja

A cél egy hordozható, új gépre is telepíthető, automatizált lead-kezelő rendszer, amely stabilan és minimális kézi beavatkozással működik.
