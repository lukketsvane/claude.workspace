Lag ti separate figurar som er DEL AV TRAKTATEN, ikkje eit supplement.

Du får den endelege kandidatteksten etter omskrivinga. Les han som eit argumenttre og vel nøyaktig ti stader der ein figur kan gjere ein relasjon synleg som teksten elles må bere åleine. Ingen figur skal vere dekorasjon, stemningsbilete eller illustrasjon av eit ord. Kvar figur skal utføre eit presist logisk arbeid.

VISUELL STANDARD
- kvit bakgrunn
- berre svart / eventuelt svært lys grå hjelpelinje
- tynne, presise vektorstrekar
- ingen rammer, kort, panel, gradientar, skuggar, 3D eller farge
- mykje negativt rom
- roleg asymmetrisk balanse
- same enkle, boklege karakter som den godkjende figuren med punkt, linjer, opne/fylte noder og korte serif-etikettar
- etikettar berre når dei er nødvendige; på nynorsk
- ingen figurtekst utanfor sjølve figuren
- ingen kontaktark: ti sjølvstendige bilete
- figurane skal kunne stå direkte mellom proposisjonane utan å bryte den strenge typografiske boka

INNHALDSKRAV
- kvar figur må vere festa til éin konkret proposisjon i den FAKTISKE endelege teksten
- figurane skal dekkje ulike logiske funksjonar: identitet/skilnad, transformasjon, felt/nåbarheit, greinande kjeder/vekt, stabilitet, endring over tid, agent/halden del, rekkevidd/tilgjenge, grense eller sjølvreferanse — MEN berre dersom desse faktisk finst i den endelege teksten
- ikkje tving gamle omgrep inn dersom omskrivinga har fjerna dei
- ikkje bruk Wittgenstein-symbolikk eller lag visuell pastisj av Tractatus
- figurane skal gjere FORMLÆRE sitt eige omgrepsapparat meir sjølvberande

TEKNISK OUTPUT
Output berre rå Python-kode, ingen Markdown-gjerde og ingen forklaring.
Koden skal bruke berre Python-standardbiblioteket og lage mappa `figures/`.
Koden skal lage nøyaktig:
- `figures/figure-01.svg` ... `figures/figure-10.svg`
- `figures/figure-manifest.json`

Kvar SVG skal ha viewBox `0 0 1600 1000`, kvit bakgrunn, svarte vektorelement og innebygd tekst via vanlege SVG `<text>`-element. Bruk serif-fontstack `Times New Roman, Times, serif` for eventuelle etikettar. Ingen eksterne fontar, bilete eller nettressursar.

`figure-manifest.json` skal vere ei JSON-liste med nøyaktig ti objekt. Kvart objekt skal ha:
- `file`: `figure-01` ... `figure-10`
- `after`: proposisjonsnummeret figuren skal stå DIREKTE ETTER i final.tex, til dømes `1.32`
- `title`: svært kort intern arbeidstittel
- `purpose`: éi presis setning om kva inferensiell relasjon figuren gjer synleg

Vel berre `after`-nummer som faktisk finst i teksten du får. Figurane skal vere distribuerte gjennom argumentet, ikkje klumpa saman.