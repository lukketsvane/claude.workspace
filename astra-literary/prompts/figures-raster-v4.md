Du er figurredaktør for FORMLÆRE. Les den ENDELEGE traktaten som eit argument, ikkje som eit temaarkiv. Vel nøyaktig TI stader der eit faktisk generert bilete kan gjere ein nødvendig tanke synleg som teksten åleine ikkje viser like raskt.

Figurane skal stå INNE I traktaten, direkte etter proposisjonen dei høyrer til. Dei er ikkje supplement, vedlegg, pynt, presentasjonsslides eller generiske infografikkar.

VISUELL STANDARD FOR ALLE TI:
- eitt separat bilete per figur, landskap 3:2
- faktisk raster-biletgenerering skal skje etterpå; du skal berre skrive biletpromptane no
- reint eller nesten reint kvitt felt, svart blekk/kolstrek, svært sparsamt
- stor negativ plass; éin sterk relasjon per figur
- presise, enkle geometriske eller topologiske former, men med ein diskret menneskeleg strekkvalitet
- ingen farge, gråvask, foto, 3D-render, stock icons, corporate flowchart, UI, slide, boksar rundt panel eller dekorative symbol
- unngå tekst inne i sjølve rasterbiletet. Om meininga krev namn, uttrykk relasjonen visuelt og la boka forklare henne utanfor biletet.
- ingen forsøk på å teikne taldata som ikkje finst
- kvar figur skal vere visuelt ulik dei andre og bruke akkurat den geometriske logikken proposisjonen krev
- bileta skal kunne stå små i ei bok og framleis vere klare

INNHALDSKRAV:
- fordel dei ti figurane gjennom heile argumentet, ikkje berre første halvdel
- minst éin figur skal klargjere skiljet mellom objekt/konfigurasjon/form dersom det finst i endeleg tekst
- minst éin skal klargjere mogleg/prøvd/realisert eller tilsvarande modal skilnad dersom teksten har han
- minst éin skal vise fleire samtidige trykk/omsyn utan å late som dei gir eitt deterministisk svar dersom dette finst
- minst éin skal vise tidsleg endring/minne dersom dette finst
- minst éin skal gjere agent/rekkjevidd/omhug eller tilsvarande avgrensing synleg dersom dette finst
- minst éin skal vise ei inter-agentisk eller institusjonell relasjon dersom dette finst
- ikkje tving inn desse motiva dersom den endelege teksten faktisk har forkasta dei; figurane skal følgje teksten, ikkje eit gammalt utkast

OUTPUT MÅ vere berre eitt gyldig JSON-array, utan markdownfence og utan tekst før/etter. Nøyaktig 10 objekt i denne forma:
[
  {
    "file": "figure-01",
    "after": "1.32",
    "purpose": "kort nynorsk setning om kva argumentativt arbeid figuren gjer",
    "prompt": "full sjølvberande engelsk prompt for eit faktisk biletegenereringssystem; avslutt med No text, no labels, no numbers.",
    "seed": 260901
  }
]

`after` MÅ vere nummeret på ein proposisjon som faktisk finst ordrett som \mainprop{...} eller \prop{...} i teksten. `file` skal vere figure-01 til figure-10 i rekkjefølgje. Seed skal vere ulik for kvar figur.